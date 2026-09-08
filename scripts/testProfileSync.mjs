// ── DEC-047: profile edit/delete persistence through the Drive merge ─────────
// Greg: "when I delete or edit a field on the Health Profile ... it doesn't
// change the next time I open the app." Root cause: the merge's OBJECT rule
// was a shallow { ...local, ...drive } — Drive won every conflicting field and
// restored cleared ones. This suite runs a REAL vault through the REAL
// mergeIntoLocal (same harness as testPrepMarks) and pins the new rule:
// both-stamped → newer object wins wholesale; unstamped → legacy unchanged.
// Run: npm run test:profile-sync

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = (p) => join(__dirname, "..", "src", p);

class Storage {
  constructor() { this._m = new Map(); }
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }
  setItem(k, v) { this._m.set(k, String(v)); }
  removeItem(k) { this._m.delete(k); }
  clear() { this._m.clear(); }
  key(i) { return [...this._m.keys()][i] ?? null; }
  get length() { return this._m.size; }
}
globalThis.Storage = Storage;
globalThis.localStorage = new Storage();
globalThis.sessionStorage = new Storage();
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => {};

const secureStorage = await import("../src/lib/secureStorage.js");
const { mergeIntoLocal } = await import("../src/lib/driveSync.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS — " + m); } else { fail++; console.log("FAIL — " + m); } };

// Write a value, flush, and capture the Drive-format ciphertext blob for it.
async function captureDriveCopy(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  await secureStorage.flushPendingWrites();
  return JSON.parse(secureStorage.getRawCiphertext(key));
}
async function setLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  await secureStorage.flushPendingWrites();
}
const readLocal = (key) => JSON.parse(localStorage.getItem(key));

localStorage.clear();
secureStorage.installInterception();
await secureStorage.setupVaultAndMigrate("test passphrase for profile sync 47");

const KEY = "mi_profile_personal";

// ── 1. The reported bug: a newer LOCAL edit survives the app-open merge ──────
{
  const stale = { name: "Greg B", phone: "601-555-0000", bloodType: "O+", updatedAt: 1000 };
  const driveStale = await captureDriveCopy(KEY, stale);

  // Patient edits the phone AND clears bloodType; the save stamps newer.
  await setLocal(KEY, { name: "Greg B", phone: "601-555-9999", updatedAt: 2000 });
  await mergeIntoLocal({ _exportedAt: "x", [KEY]: driveStale });
  const now = readLocal(KEY);
  ok(now.phone === "601-555-9999", "edited field survives the boot merge against a stale Drive copy");
  ok(!("bloodType" in now), "a CLEARED field stays cleared — the stale Drive copy cannot restore it");
  ok(now.updatedAt === 2000, "the newer object is kept wholesale (stamp intact)");
}

// ── 2. The other direction: a newer DRIVE edit lands here ────────────────────
{
  const newer = { name: "Greg B", phone: "601-555-7777", updatedAt: 5000 };
  const driveNewer = await captureDriveCopy(KEY, newer);

  await setLocal(KEY, { name: "Greg B", phone: "601-555-9999", organ: "Liver", updatedAt: 2000 });
  await mergeIntoLocal({ _exportedAt: "x", [KEY]: driveNewer });
  const now = readLocal(KEY);
  ok(now.phone === "601-555-7777", "a newer edit from the other device wins here");
  ok(!("organ" in now), "wholesale replacement: a field the newer copy dropped is dropped here too");
}

// ── 3. Unstamped objects keep the LEGACY shallow merge, byte-for-byte ────────
{
  const drivePlain = await captureDriveCopy(KEY, { name: "Drive Name", phone: "111", extra: "drive-only" });
  await setLocal(KEY, { name: "Local Name", city: "Hattiesburg" });
  await mergeIntoLocal({ _exportedAt: "x", [KEY]: drivePlain });
  const now = readLocal(KEY);
  ok(now.name === "Drive Name", "unstamped: Drive still wins conflicting scalars (legacy pinned)");
  ok(now.city === "Hattiesburg", "unstamped: local-only fields still survive (legacy union)");
  ok(now.extra === "drive-only", "unstamped: drive-only fields still arrive (legacy union)");
}

// ── 4. One-sided stamp falls back to the legacy merge ────────────────────────
{
  const driveStamped = await captureDriveCopy(KEY, { name: "Drive Name", updatedAt: 9000 });
  await setLocal(KEY, { name: "Local Name", city: "Hattiesburg" }); // no stamp locally
  await mergeIntoLocal({ _exportedAt: "x", [KEY]: driveStamped });
  const now = readLocal(KEY);
  ok(now.name === "Drive Name" && now.city === "Hattiesburg",
     "one-sided stamp: legacy shallow merge applies (opt-in requires BOTH stamped)");
}

// ── 5. Insurance store rides the same rule ───────────────────────────────────
{
  const IKEY = "mi_profile_insurance";
  const driveStale = await captureDriveCopy(IKEY, { carrier: "Old Carrier", memberId: "A1", updatedAt: 100 });
  await setLocal(IKEY, { carrier: "New Carrier", updatedAt: 200 });
  await mergeIntoLocal({ _exportedAt: "x", [IKEY]: driveStale });
  const now = readLocal(IKEY);
  ok(now.carrier === "New Carrier" && !("memberId" in now),
     "insurance object: newer local edit + cleared field both stick");
}

// ── 6. Array stores are untouched by the object rule (regression guard) ──────
{
  const AKEY = "mi_care_team";
  const driveArr = await captureDriveCopy(AKEY, [
    { id: 1, name: "Dr. A (drive edit)", updatedAt: 500 },
    { id: 2, name: "Dr. B" },
  ]);
  await setLocal(AKEY, [{ id: 1, name: "Dr. A (local edit)", updatedAt: 900 }]);
  await mergeIntoLocal({ _exportedAt: "x", [AKEY]: driveArr });
  const now = readLocal(AKEY);
  const a = now.find(x => x.id === 1), b = now.find(x => x.id === 2);
  ok(a?.name === "Dr. A (local edit)", "array: newer stamped item edit still wins (DEC-046 unchanged)");
  ok(!!b, "array: union still brings the other device's records");
}

// ── 7. Structural: every profile save path stamps ────────────────────────────
{
  const store = readFileSync(SRC("store.js"), "utf8");
  ok(/setProfilePersonal\(v\) \{ setStore\('profile_personal', \{ \.\.\.v, updatedAt: Date\.now\(\) \}\); \}/.test(store),
     "setProfilePersonal stamps at the setter");
  ok(/setProfileInsurance\(v\) \{ setStore\('profile_insurance', \{ \.\.\.v, updatedAt: Date\.now\(\) \}\); \}/.test(store),
     "setProfileInsurance stamps at the setter");

  const tab02 = readFileSync(SRC("components/tabs/Tab02.jsx"), "utf8");
  const stamps = (tab02.match(/updatedAt: Date\.now\(\)/g) || []).length;
  ok(stamps >= 5, `Tab02 stamps all five per-item saves (found ${stamps})`);

  const phase2 = readFileSync(SRC("components/onboarding/Phase2Basics.jsx"), "utf8");
  ok(phase2.includes("p.updatedAt = Date.now()"), "onboarding Tier-0 write keeps the stamp intact");

  const sync = readFileSync(SRC("lib/driveSync.js"), "utf8");
  ok(sync.includes("du > lu ? value : local"), "merge object branch: newer wholesale when both stamped");
  ok(sync.includes("{ ...local, ...value }"), "merge object branch: legacy shallow merge retained for unstamped");
}

// ── 8. Weight auto-fill from Vitals (v1.49.0) ────────────────────────────────
{
  const { latestWeightReading } = await import("../src/store.js");

  localStorage.setItem("mi_readings", JSON.stringify([
    { id: "r1", date: "2026-08-13", systolic: 128, diastolic: 82 },            // newest, BP-only
    { id: "r2", date: "2026-08-10", weight: "182.4" },                          // newest WITH weight
    { id: "r3", date: "2026-08-01", weight: 185 },
    { id: "r4", date: "2026-08-12", weight: "not-a-number" },                   // junk ignored
  ]));
  await secureStorage.flushPendingWrites();
  const w = latestWeightReading();
  ok(w?.id === "r2", "picks the newest reading that HAS a weight (skips newer BP-only + junk)");
  ok(parseFloat(w.weight) === 182.4, "returns the reading with its weight value");

  localStorage.setItem("mi_readings", JSON.stringify([{ id: "r1", date: "2026-08-13", systolic: 128 }]));
  await secureStorage.flushPendingWrites();
  ok(latestWeightReading() === null, "no logged weights → null (profile field is the fallback)");

  localStorage.setItem("mi_readings", JSON.stringify([]));
  await secureStorage.flushPendingWrites();
  ok(latestWeightReading() === null, "empty readings → null, never throws");

  const tab02 = readFileSync(SRC("components/tabs/Tab02.jsx"), "utf8");
  ok(tab02.includes("latestWeightReading"), "Health Profile uses the vitals weight helper");
  ok(tab02.includes("log a new weight on the Vitals tab"), "edit mode explains where weight now comes from");
  const emergency = readFileSync(SRC("lib/printEmergency.js"), "utf8");
  ok(emergency.includes("latestWeightReading"), "emergency packet prints the CURRENT weight from Vitals");
}

// ── 9. Age calculated from DOB (v1.49.3) ─────────────────────────────────────
{
  const { ageFromDob } = await import("../src/store.js");
  const iso = d => d.toISOString().slice(0, 10);
  const today = new Date();

  const exactly30 = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate());
  ok(ageFromDob(iso(exactly30)) === 30, "birthday today → exact age");

  const tomorrow31 = new Date(today.getFullYear() - 31, today.getMonth(), today.getDate() + 1);
  ok(ageFromDob(iso(tomorrow31)) === 30, "birthday tomorrow → still the younger age");

  const yesterday29 = new Date(today.getFullYear() - 29, today.getMonth(), today.getDate() - 1);
  ok(ageFromDob(iso(yesterday29)) === 29, "birthday yesterday → new age");

  ok(ageFromDob("") === null, "empty DOB → null (stored field is the fallback)");
  ok(ageFromDob("not-a-date") === null, "unparseable DOB → null, never throws");
  ok(ageFromDob(iso(new Date(today.getFullYear() + 1, 0, 1))) === null, "future DOB → null");

  const tab02 = readFileSync(SRC("components/tabs/Tab02.jsx"), "utf8");
  ok(tab02.includes("calculated from DOB"), "profile shows age as calculated, read-only");
  ok(tab02.includes(">Health Profile</h1>"), "page header says Health Profile, matching the sidebar");
  const emergency = readFileSync(SRC("lib/printEmergency.js"), "utf8");
  ok(emergency.includes("ageFromDob(profile.dob)"), "emergency card computes age from DOB");
}

// ── 10. One-shot AI-launch signals never resurrect (v1.49.4) ─────────────────
// Greg: "Every time I open AI Analysis, this appears and Insina answers it."
// A dermatology-report prompt captured into the Drive backup was restored by
// every merge (scalar keys have no tombstones) and re-fired on every visit.
{
  const { collectLocalCiphertext, collectLocalData } = await import("../src/lib/driveSync.js");

  // The reported loop: signal consumed locally, stale copy still in Drive.
  const stalePending = await captureDriveCopy("mi_ai_pending", "Analyze my report");
  const staleDoc = await captureDriveCopy("mi_auto_analyze_doc", "1755300000000");
  localStorage.removeItem("mi_ai_pending");
  localStorage.removeItem("mi_auto_analyze_doc");
  await secureStorage.flushPendingWrites();
  await mergeIntoLocal({ _exportedAt: "x", mi_ai_pending: stalePending, mi_auto_analyze_doc: staleDoc });
  ok(localStorage.getItem("mi_ai_pending") === null,
     "merge ignores a stale mi_ai_pending in the Drive file — the prompt cannot re-fire");
  ok(localStorage.getItem("mi_auto_analyze_doc") === null,
     "merge ignores a stale mi_auto_analyze_doc — the document analysis cannot re-fire");

  // Upload side: a signal set at backup time never reaches the Drive file.
  localStorage.setItem("mi_ai_pending", JSON.stringify("in-flight question"));
  localStorage.setItem("mi_auto_analyze_doc", JSON.stringify("123"));
  await secureStorage.flushPendingWrites();
  const cipher = collectLocalCiphertext();
  ok(!("mi_ai_pending" in cipher) && !("mi_auto_analyze_doc" in cipher),
     "Drive upload payload excludes both launch signals");
  const plain = collectLocalData();
  ok(!("mi_ai_pending" in plain) && !("mi_auto_analyze_doc" in plain),
     "local download-backup payload excludes them too");

  // Boot purge: a copy already restored by a pre-fix merge dies at unlock.
  localStorage.setItem("mi_schema_version", "3"); // fully migrated — purge must still run
  const { runMigrations } = await import("../src/lib/migrations.js");
  runMigrations();
  ok(localStorage.getItem("mi_ai_pending") === null && localStorage.getItem("mi_auto_analyze_doc") === null,
     "runMigrations purges stale launch signals even with no pending migrations");
  localStorage.removeItem("mi_schema_version");
}

// ── 11. Patient Profile printout carries the transplant banner (v1.53.1) ─────
// Greg: "On the Patient Profile printout there needs to be a place at the top
// to identify that I'm a Liver Transplant." Same derivation as the Emergency
// Card — one clinically-reviewed list, never two drifting copies.
// WO_DASHBOARD_POLISH_02 (DEC-060/061): the printout moved from Tab02's hidden
// markup to src/lib/printProfile.js (store-based, on the shared shell). The
// same guarantees are pinned there; testPrintShell.mjs renders the document.
{
  const profile = readFileSync(SRC("lib/printProfile.js"), "utf8");
  ok(profile.includes('import { deriveTransplantBanner } from "./printEmergency.js"'),
     "profile print IMPORTS the shared banner derivation (no local copy)");
  const tab02 = readFileSync(SRC("components/tabs/Tab02.jsx"), "utf8");
  ok(!tab02.includes('id="print-profile"') && tab02.includes('from "../../lib/printProfile.js"'),
     "Tab02 no longer carries a second copy of the printout; it calls the shared builder");
  const header = profile.slice(profile.indexOf("const headerHtml ="), profile.indexOf("// ── Sections ──"));
  ok(header.includes('class="notice"') && header.indexOf('class="who"') < header.indexOf('class="notice"'),
     "the notice block renders in the header's LEFT column under the demographics line (v1.53.5 placement)");
  ok(profile.includes('reportDocument({ title: "Patient Profile", headerHtml') && profile.includes('kind: "Personal Health Record"'),
     "the brand block ('Personal Health Record') is the shell's right column, after the notice");
  ok(profile.includes('|| "No allergies recorded"') && header.includes("ALLERGIES: ${esc(allergyNames)}"),
     "the notice includes allergies, stating absence explicitly (never silence)");
  const shell = readFileSync(SRC("lib/printShell.js"), "utf8");
  ok(/\.banner \{ color:#b91c1c;[^}]*font-size:10pt/.test(shell) && !/\.banner \{[^}]*border/.test(shell) && /\.allergies \{ color:#b91c1c;[^}]*font-size:10pt/.test(shell),
     "notice is left-justified 10pt red TYPE with no box (v1.53.5 founder styling)");
  ok(profile.includes('.replace(/ ON IMMUNOSUPPRESSION$/, "")'),
     "profile shows the SHORT banner — suffix trimmed for display, shared derivation intact (Emergency Card keeps the full text)");
}

// ── 12. Saves merge over a FRESH read, never mount-time state (v1.53.4) ──────
// Greg: "My address is still not changing to my new address." A save made
// after a background Drive sync rebuilt the whole object from the PRE-sync
// React snapshot — resurrecting every untouched field with a fresh updatedAt
// that then WON the newer-edit-wins merge everywhere. The base must be the
// store, read at save time.
{
  const tab02 = readFileSync(SRC("components/tabs/Tab02.jsx"), "utf8");
  ok(tab02.includes("const merged = { ...getProfilePersonal(), ...tempPersonal }"),
     "savePersonal merges the edits over a fresh store read");
  ok(tab02.includes("const merged = { ...getProfileInsurance(), ...tempInsurance }"),
     "saveInsurance merges the edits over a fresh store read");
  ok(!/\{ \.\.\.personal, \.\.\.tempPersonal \}/.test(tab02) && !/\{ \.\.\.insurance, \.\.\.tempInsurance \}/.test(tab02),
     "no save path uses mount-time React state as its base");
  ok(tab02.includes('window.addEventListener("mi-data-synced", refresh)'),
     "Tab02 refreshes profile state when a background sync lands");
}

console.log(`\n${pass} passed, ${fail} failed (profile-sync)`);
assert.equal(fail, 0);

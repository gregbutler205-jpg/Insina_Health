// ── DEC-069: version-gated migrations never run while the record is unreadable ──
// Pins: with the interception installed and no DEK, runMigrations() defers
// (no version bump, no audit entry, no key touched — including v3's
// removeItem of mi_imaging, which a locked interception would otherwise carry
// out against real plaintext); once the vault is set up the same migrations
// apply in full; and main.jsx only migrates at boot for demo installs.
// Run: npm run test:locked-migrations

import { readFileSync } from "node:fs";

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
globalThis.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
globalThis.URL.createObjectURL = () => "blob:test";
globalThis.URL.revokeObjectURL = () => {};
globalThis.Blob = class { constructor() {} };

const { runMigrations, currentSchemaVersion } = await import("../src/lib/migrations.js");
const secureStorage = await import("../src/lib/secureStorage.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS — " + m); } else { fail++; console.log("FAIL — " + m); } };

// A pre-P-02 plaintext install: no vault, no version stamp, old-shape data
// that v2 (readings) and v3 (imaging) exist to migrate.
const OLD_READINGS = JSON.stringify([{ type: "bp", value: "120/80", date: "7/1/2026", ts: "2026-07-01" }]);
const OLD_IMAGING = JSON.stringify([{ id: "img1", type: "MRI", bodyPart: "Liver", date: "2026-06-01" }]);
function seedLegacyInstall() {
  localStorage.clear();
  localStorage.setItem("mi_readings", OLD_READINGS);
  localStorage.setItem("mi_imaging", OLD_IMAGING);
  localStorage.setItem("mi_documents", JSON.stringify([{ id: "d1", name: "Old letter" }]));
}
const raw = (k) => secureStorage.getRawCiphertext(k);

// ── Demo-style install: no interception, migrations run at boot as before ───
seedLegacyInstall();
ok(secureStorage.canReadManagedKeys(), "without the interception the record is readable");
{
  const r = runMigrations();
  ok(!r.deferred && currentSchemaVersion() === 5, "plaintext install without the interception migrates at boot (version 5)");
}

// ── Interception installed, vault locked: defer, touch nothing ──────────────
seedLegacyInstall();
secureStorage.installInterception();
ok(!secureStorage.canReadManagedKeys(), "installed-but-locked: the record is not readable");
{
  const before = JSON.stringify([...localStorage._m.entries()].sort());
  const r = runMigrations();
  ok(r.deferred === true && r.ran === 0, "runMigrations() reports the run as deferred");
  ok(currentSchemaVersion() === 0, "version is not stamped while locked");
  ok(raw("mi_imaging") === OLD_IMAGING, "mi_imaging plaintext survives (v3's removeItem never ran)");
  ok(raw("mi_readings") === OLD_READINGS, "mi_readings plaintext is untouched");
  ok(raw("mi_rie_audit") === null, "no audit entry claims a migration ran");
  ok(JSON.stringify([...localStorage._m.entries()].sort()) === before, "storage is byte-for-byte unchanged");
}

// ── Vault created (LockScreen setup), then afterUnlock's runMigrations() ────
await secureStorage.setupVaultAndMigrate("test passphrase for locked migrations");
ok(secureStorage.canReadManagedKeys(), "after vault setup the record is readable");
{
  const r = runMigrations();
  ok(!r.deferred && currentSchemaVersion() === 5, "the same migrations now apply in full (version 5)");
  const readings = JSON.parse(localStorage.getItem("mi_readings"));
  ok(readings[0].date === "2026-07-01" && readings[0].id && readings[0].enteredAt, "v2 normalized the reading (canonical date, id, enteredAt)");
  const diagnostics = JSON.parse(localStorage.getItem("mi_diagnostics") || "[]");
  ok(diagnostics.length === 1 && diagnostics[0].name === "MRI: Liver" && diagnostics[0].migratedFromImaging, "v3 moved the imaging study into mi_diagnostics");
  ok(localStorage.getItem("mi_imaging") === null, "v3 removed mi_imaging only after the verified move");
  ok(JSON.parse(localStorage.getItem("mi_documents"))[0].tier === "archive", "v4 stamped the document tier");
  ok(localStorage.getItem("mi_history_builder") !== null && localStorage.getItem("mi_attestations") !== null, "v4 seeded the History Builder keys");
  await secureStorage.flushPendingWrites();
  ok(raw("mi_diagnostics") !== null && raw("mi_diagnostics") !== localStorage.getItem("mi_diagnostics"), "migrated data is stored as ciphertext, not plaintext");
}

// ── Static pins: boot only migrates demo installs ───────────────────────────
const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf-8");
ok(main.includes("if (isDemoMode()) runMigrations()"), "main.jsx runs boot-time migrations for demo installs only");
ok(!main.includes("if (!hasVault()) runMigrations()"), "main.jsx no longer keys boot-time migrations on the absence of a vault");
const lock = readFileSync(new URL("../src/components/LockScreen.jsx", import.meta.url), "utf-8");
ok(/function afterUnlock\(\) \{\s*runMigrations\(\);/.test(lock), "LockScreen.afterUnlock() still runs migrations first");
const clock = readFileSync(new URL("../src/components/companion/screens/Lock.jsx", import.meta.url), "utf-8");
ok(/function finishUnlock\(\{ offerPinSetup \}\) \{\s*runMigrations\(\);/.test(clock), "companion Lock.finishUnlock() still runs migrations first");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

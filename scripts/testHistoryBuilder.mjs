// History Builder tests (WO_HISTORY_BUILDER_01 Phase 8, twelve minimums plus
// added cases). Node harness, no framework. Run: npm run test:history-builder

import assert from "node:assert/strict";
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

const hb = await import("../src/lib/historyBuilder.js");
const staged = await import("../src/lib/stagedItems.js");
const reportData = await import("../src/lib/reportData.js");
const { runMigrations } = await import("../src/lib/migrations.js");
const { buildEmergencyHtml } = await import("../src/lib/printEmergency.js");
const MAP = JSON.parse(readFileSync(new URL("../src/config/medConditionMap.json", import.meta.url), "utf-8"));
const COPY_SRC = readFileSync(new URL("../src/config/historyBuilderCopy.js", import.meta.url), "utf-8");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS " + m); } else { fail++; console.log("FAIL " + m); } };

const CT = [{ id: 1, name: "Dr. C", role: "Transplant Coordinator", phone: "601-555-0000" }];
const TX = [{ id: "tx", procedure: "Living Donor Liver Transplant", date: "2024-10-01", facility: "UMC" }];
const fullS1 = () => ({
  meds: [{ id: 1, name: "Tacrolimus", status: "active", frequency: "BID", refillDate: "2026-09-01" }],
  conditions: [{ id: 1, name: "Status post liver transplant", status: "active", since: "2024-10-01" }],
  allergies: [{ id: 1, name: "Penicillin" }],
  careTeam: CT, labs: [], readings: [], appointments: [], symptoms: [],
  surgeries: TX, records: [{ id: "r1" }], documents: [], refDocs: [], profile: { name: "A", dob: "1970-01-01", emergency: "B" },
});
const allAttested = { medsCompleteAt: "2026-08-01T00:00:00Z", allergiesResolvedAt: "2026-08-01T00:00:00Z", conditionsReviewedAt: "2026-08-01T00:00:00Z" };
const noneAttested = { medsCompleteAt: null, allergiesResolvedAt: null, conditionsReviewedAt: null };
const hbBase = { goal: "skipped", targetAppointmentId: null, dismissals: [], s4Covered: false };
const rank = (stores, attestations, hbState, sessionId = "s1") =>
  hb.rankPrompt({ stores, attestations, hb: hbState, sessionId, now: new Date("2026-08-11T12:00:00Z") });

// 1. Ranking determinism
{
  const s = fullS1();
  const first = rank(s, noneAttested, hbBase);
  let same = true;
  for (let i = 0; i < 25; i++) { const r = rank(s, noneAttested, hbBase); if (JSON.stringify(r) !== JSON.stringify(first)) same = false; }
  ok(same && first?.promptId === "C-02", `1 ranking deterministic across repeated calls (got ${first?.promptId})`);
}

// 2. Suppression: present fields never prompt again
{
  const s = fullS1();
  const gaps = hb.computeGaps(s, allAttested, { s4Covered: true });
  const s1Ids = gaps.filter(g => g.stage === 1).map(g => g.promptId);
  ok(s1Ids.length === 0, "2a wizard or tab captured S1 fields never re-ask");
  const empty = { ...fullS1(), meds: [] };
  ok(hb.computeGaps(empty, noneAttested, {}).some(g => g.promptId === "C-01"), "2b empty meds DOES prompt C-01");
  ok(hb.computeGaps(fullS1(), noneAttested, {}).some(g => g.promptId === "C-02"), "2c populated unattested meds prompts C-02 not C-01");
}

// 3. Migration idempotency
{
  localStorage.clear();
  localStorage.setItem("mi_onboarding_state", JSON.stringify({ goal: "track_meds_labs" }));
  localStorage.setItem("mi_documents", JSON.stringify([{ id: "d1", title: "Old scan" }]));
  runMigrations();
  const snap1 = JSON.stringify([...localStorage._m.entries()].sort());
  runMigrations();
  const snap2 = JSON.stringify([...localStorage._m.entries()].sort());
  ok(snap1 === snap2, "3 migration run twice yields identical state");
  const hbs = JSON.parse(localStorage.getItem("mi_history_builder"));
  ok(hbs.goal === "meds_labs", "3b migration copies and maps the wizard goal (track_meds_labs to meds_labs)");
  const docs = JSON.parse(localStorage.getItem("mi_documents"));
  ok(docs[0].tier === "archive", "3c existing documents stamped tier archive");
}

// 4. Attestation timestamps only via explicit confirmation
{
  localStorage.clear();
  hb.setAttestation("medsCompleteAt", "2026-08-11T00:00:00Z");
  const a = hb.loadAttestations();
  ok(a.medsCompleteAt === "2026-08-11T00:00:00Z" && a.allergiesResolvedAt === null, "4a explicit confirmation sets exactly its field");
  hb.setAttestation("bogusField", "x");
  ok(!("bogusField" in hb.loadAttestations()), "4b unknown attestation fields are refused");
}

// 5. Tier isolation: archive content unreachable from report output
{
  localStorage.clear();
  const SENTINEL = "ARCHIVE_SENTINEL_TEXT_9Q7";
  localStorage.setItem("mi_documents", JSON.stringify([{ id: "d1", title: "Discharge", extractedText: SENTINEL, tier: "archive" }]));
  localStorage.setItem("mi_meds_full", JSON.stringify(fullS1().meds));
  localStorage.setItem("mi_care_team", JSON.stringify(CT));
  const sources = reportData.getReportSources();
  ok(!JSON.stringify(sources).includes(SENTINEL), "5a accessor exposes no archive document content");
  const html = buildEmergencyHtml();
  ok(!html.includes(SENTINEL), "5b Emergency generator output cannot contain archive content");
}

// 6. Gating copy chooser
ok(hb.pickUploadCopy("fixture") === "C-13" && hb.pickUploadCopy(undefined) === "C-13", "6a AI-off renders C-13 and never C-12");
ok(hb.pickUploadCopy("live") === "C-12", "6b founder unlock (live extraction mode) renders C-12");

// 7. Dismissal resurfacing: below stage peers, once per session
{
  const s = { ...fullS1(), meds: [] , allergies: []};
  const h1 = { ...hbBase, dismissals: [{ promptId: "C-01", sessionId: "sX" }] };
  const r1 = rank(s, noneAttested, h1, "sX");
  ok(r1.promptId === "C-03", "7a dismissed prompt drops below its stage peers");
  const allDismissedOnce = { ...hbBase, dismissals: ["C-01", "C-03", "C-02", "C-05"].map(p => ({ promptId: p, sessionId: "sX" })) };
  const s2 = { ...fullS1(), meds: [], allergies: [] };
  const r2 = rank(s2, { ...noneAttested, conditionsReviewedAt: "x" }, allDismissedOnce, "sX");
  ok(r2?.promptId === "C-01", "7b resurfaces only after other prompts in the stage clear");
  const twice = { ...hbBase, dismissals: [
    ...["C-01", "C-03", "C-02", "C-05"].map(p => ({ promptId: p, sessionId: "sX" })),
    { promptId: "C-01", sessionId: "sX" }, { promptId: "C-03", sessionId: "sX" }, { promptId: "C-05", sessionId: "sX" },
  ] };
  const r3 = rank(s2, { ...noneAttested, conditionsReviewedAt: "x" }, twice, "sX");
  ok(r3 === null || r3.promptId !== "C-01", "7c at most once per session");
}

// 8. Readiness table flips on exactly its conditions
{
  const s = fullS1();
  ok(hb.computeReadiness(s, allAttested).emergencyPacket === true, "8a Emergency ready on spine complete");
  ok(hb.computeReadiness(s, { ...allAttested, medsCompleteAt: null }).emergencyPacket === false, "8b missing meds attestation blocks Emergency");
  ok(hb.computeReadiness({ ...s, careTeam: [] }, allAttested).emergencyPacket === false, "8c no phone contact blocks Emergency");
  ok(hb.computeReadiness(s, { ...noneAttested, medsCompleteAt: "x" }).medicationReport === true, "8d Medication Report needs only medsAttested");
  ok(hb.computeReadiness({ ...s, profile: {} }, allAttested).patientProfile === false, "8e Patient Profile needs demographics");
  ok(hb.computeReadiness(s, allAttested).consultationPrep === false, "8f Consultation Prep needs an upcoming appointment");
  const withAppt = { ...s, appointments: [{ id: 9, status: "upcoming", date: "2026-08-20" }] };
  ok(hb.computeReadiness(withAppt, allAttested).consultationPrep === true, "8g and flips with one");
}

// 9. Goal invariant: no boosted prompt outranks an open S1 gap
{
  const openS1 = { ...fullS1(), meds: [], labs: [] };
  for (const goal of ["emergency", "appointment", "meds_labs", "organize_meds", "profile", "skipped"]) {
    const h = { ...hbBase, goal, targetAppointmentId: goal === "appointment" ? "t1" : null };
    const r = rank({ ...openS1, appointments: [{ id: "t1", status: "upcoming", date: "2026-08-15" }] }, noneAttested, h);
    ok(r && ["C-01", "C-02", "C-03", "C-04", "C-05", "C-06"].includes(r.promptId), `9 goal ${goal}: S1 outranks boosts (got ${r?.promptId})`);
  }
  const r = rank(openS1, noneAttested, { ...hbBase, goal: "appointment" });
  ok(r.promptId === "C-28", "9b anchor exception: C-28 precedes S1 for goal appointment only, until a target is chosen");
}

// 10. Suffix mapping per goal
{
  const medsGap = { ...fullS1(), meds: [] };
  const cases = [
    ["appointment", "C-27a"], ["profile", "C-27d"], ["organize_meds", "C-27c"],
    ["emergency", "C-27b"], ["meds_labs", "C-27b"], ["skipped", null],
  ];
  for (const [goal, want] of cases) {
    const h = { ...hbBase, goal, targetAppointmentId: goal === "appointment" ? "t1" : null };
    const r = rank({ ...medsGap, appointments: [{ id: "t1", status: "upcoming", date: "2026-08-15" }] }, noneAttested, h);
    ok((r.suffixId || null) === want, `10 goal ${goal}: meds prompt suffix ${want || "none"} (got ${r.suffixId || "none"})`);
  }
  const nonMedGap = { ...fullS1(), careTeam: [] };
  const rOm = rank(nonMedGap, allAttested, { ...hbBase, goal: "organize_meds" });
  ok(rOm.promptId === "C-06" && rOm.suffixId === "C-27b", "10b organize_meds split: non-medication S1 prompts carry C-27b");
}

// 11. Absent or unmapped goal defaults to skipped
ok(hb.mapWizardGoal(undefined) === "skipped" && hb.mapWizardGoal("mystery") === "skipped" && hb.mapWizardGoal("emergency_packet") === "emergency",
  "11 absent or unmapped wizard goal resolves to skipped; known ids map");

// 12. Anchor behavior and C-16 date resolution
{
  const s1done = fullS1();
  const appts = [
    { id: "a1", status: "upcoming", date: "2026-08-21", title: "Hep" },
    { id: "a2", status: "upcoming", date: "2026-08-13", title: "Labs" },
  ];
  const withTarget = rank({ ...s1done, appointments: appts, labs: [] }, allAttested, { ...hbBase, goal: "appointment", targetAppointmentId: "a1", s4Covered: true });
  ok(withTarget.promptId === "C-09a" && withTarget.c16Date === "2026-08-21", `12a C-16 date resolves to the TARGET when set (got ${withTarget.c16Date})`);
  const noTarget = rank({ ...s1done, appointments: appts, labs: [] }, allAttested, { ...hbBase, goal: "skipped", s4Covered: true });
  ok(noTarget.c16Date === "2026-08-13", `12b otherwise the nearest upcoming within the window (got ${noTarget.c16Date})`);
  const anchor = rank({ ...s1done, appointments: [] }, noneAttested, { ...hbBase, goal: "appointment" });
  ok(anchor.promptId === "C-28", "12c zero upcoming appointments still anchors (the card offers the add form)");
}

// Added: staged items one-by-one write-through and the lookup rules
{
  localStorage.clear();
  const item = staged.addStagedItem({ source: "manual", type: "condition", payload: { name: "Gout", status: "active" } });
  staged.acceptStagedItem(item.id);
  const conds = JSON.parse(localStorage.getItem("mi_conditions"));
  ok(conds.length === 1 && conds[0].name === "Gout", "A1 accepted staged item writes through the existing store key");
  ok(staged.listStagedItems("proposed").length === 0, "A2 accept resolves the item");
  const meds = [{ name: "Allopurinol 100mg", status: "active" }];
  const m1 = staged.evaluateMedConditionMap(meds, [], MAP.mappings);
  ok(m1 && m1.condition === "Gout", "A3 med-to-condition matcher proposes from the map");
  ok(staged.evaluateMedConditionMap(meds, [{ name: "gout" }], MAP.mappings) === null, "A4 existing condition suppresses the proposal");
  const p = staged.proposeMedConditionMatch(meds, [], MAP.mappings);
  staged.rejectStagedItem(p.id);
  ok(staged.evaluateMedConditionMap(meds, [], MAP.mappings) === null, "A5 rejected matches are never re-proposed");
  const names = MAP.mappings.map(m => m.medication).join(",");
  ok(!/azathioprine|metoprolol|trazodone|bactrim/i.test(names) && MAP.mappings.length === 14, "A6 map holds exactly the 14 high-specificity entries");
}

// Added: copy hygiene, spec section 11 rules
{
  // Scan the copy STRINGS, not the header comment that names the banned words.
  const stringsOnly = COPY_SRC.split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
  ok(!COPY_SRC.includes("—"), "A7 no em dashes anywhere in History Builder copy");
  ok(!/\b(urgent|critical|overdue|immediately)\b/i.test(stringsOnly), "A8 no urgency vocabulary in History Builder copy strings");
  ok(!/%|percent|progress bar/i.test(stringsOnly), "A9 no completeness percentage language");
}

console.log(`\n${pass} passed, ${fail} failed (history-builder)`);
assert.equal(fail, 0);

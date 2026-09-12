// ── Condition suggestions from the record (v1.57.0) ──────────────────────────
// Greg: suggest conditions from Diagnostics, Labs & Trends (document text
// only — founder decision: no inference from values), Clinical Notes, and
// other record text, working like Calendar Sync: suggestions wait for review,
// Confirm adds through the normal modal, Dismiss tombstones forever.
// These pin the scan engine's safety properties: negation and family-history
// guards, word boundaries, facility names never scanned, existing conditions
// and dismissals excluded, suggestions never touching mi_conditions.
// Run: npm run test:condition-suggest

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

const {
  matchConditionsInText, collectScanSources, runConditionScan,
  readSuggestions, dismissSuggestion, resolveSuggestion, readDismissed,
  existingConditionIds, CONDITION_DICTIONARY,
  normalizeConditionName, conditionEntryIds, linkSuggestionToCondition, CONDITION_PARENT,
} = await import("../src/lib/conditionSuggest.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS — " + m); } else { fail++; console.log("FAIL — " + m); } };
const ids = (list) => list.map(s => s.condId);

// ── Matching fundamentals ────────────────────────────────────────────────────
{
  const hits = matchConditionsInText("CT abdomen: cirrhosis with moderate ascites.");
  ok(ids(hits).includes("cirrhosis") && ids(hits).includes("ascites"),
    "condition names in diagnostic text are found");
  ok(hits.find(h => h.condId === "cirrhosis").snippet.toLowerCase().includes("cirrhosis"),
    "each hit carries a snippet showing the mention in context");
}
{
  const hits = matchConditionsInText("Longstanding HTN, on lisinopril.");
  ok(ids(hits).includes("hypertension"), "abbreviations match (HTN → Hypertension)");
}
{
  const hits = matchConditionsInText("Sequelae of portal hypertension noted.");
  ok(ids(hits).includes("portal-htn") && !ids(hits).includes("hypertension"),
    "the longer phrase wins the overlap — portal hypertension is not also plain hypertension");
}
{
  const hits = matchConditionsInText("A cascade of events; discharge scheduled.");
  ok(!ids(hits).includes("cad"), "abbreviations only match on word boundaries ('cascade' is not CAD)");
}
{
  const hits = matchConditionsInText("History of hypertension, well controlled.");
  ok(ids(hits).includes("hypertension"),
    "'history of X' IS suggested — a past condition belongs on the list (status can be Resolved)");
}

// ── Negation and family-history guards ───────────────────────────────────────
{
  ok(!ids(matchConditionsInText("No evidence of cirrhosis on imaging.")).includes("cirrhosis"),
    "'no evidence of X' is not suggested");
  ok(!ids(matchConditionsInText("Patient denies diabetes.")).includes("diabetes"),
    "'denies X' is not suggested");
  ok(!ids(matchConditionsInText("Negative for hepatitis B and C.")).includes("hep-b"),
    "'negative for X' is not suggested");
  ok(!ids(matchConditionsInText("Ordered to rule out pancreatitis.")).includes("pancreatitis"),
    "'rule out X' is not suggested");
  ok(!ids(matchConditionsInText("Family history of diabetes (mother).")).includes("diabetes"),
    "a family history mention is never suggested as the patient's condition");
  ok(!ids(matchConditionsInText("Mother: hypertension. Father: gout.")).includes("hypertension"),
    "family-member lines are not suggested");
  const twoSentences = matchConditionsInText("No acute findings. Cirrhosis is stable.");
  ok(ids(twoSentences).includes("cirrhosis"),
    "a negation in the PREVIOUS sentence does not kill a mention after the boundary");
}

// ── Sources: what is and is not scanned ──────────────────────────────────────
{
  localStorage.clear();
  localStorage.setItem("mi_diagnostics", JSON.stringify([{ id: 1, name: "CT Abdomen", impression: "Cirrhotic morphology.", date: "2026-03-04" }]));
  localStorage.setItem("mi_notes", JSON.stringify([{ id: 2, title: "Clinic visit", date: "2026-05-01", sections: [{ id: "s1", type: "text", body: "Discussed GERD symptoms." }] }]));
  localStorage.setItem("mi_records", JSON.stringify([{ id: 3, title: "Endoscopy report", date: "2026-02-11", facility: "Diabetes Center of Mississippi" }]));
  localStorage.setItem("mi_surgeries", JSON.stringify([{ id: 4, procedure: "Umbilical hernia repair", date: "2024-06-15" }]));
  localStorage.setItem("mi_ref_docs", JSON.stringify([{ id: "rd1", name: "Lab requisition", addedDate: "2026-08-01", text: "Dx: Essential hypertension. Specimen: serum." }]));
  const { suggestions } = runConditionScan();
  const got = ids(suggestions);
  ok(got.includes("cirrhosis"), "Diagnostics impressions are scanned");
  ok(got.includes("gerd"), "My Notes section bodies are scanned");
  ok(got.includes("hernia"), "Procedures are scanned");
  ok(got.includes("hypertension"), "imported document text is scanned — how Labs & Trends contributes (mentions, never values)");
  ok(!got.includes("diabetes"), "facility names are NEVER scanned ('Diabetes Center of Mississippi' suggests nothing)");
  const hyp = suggestions.find(s => s.condId === "hypertension");
  ok(hyp.sources.some(s => s.store === "Source Documents" && s.title === "Lab requisition"),
    "each suggestion carries provenance: which record, where");
}

// ── Exclusions: existing conditions and dismissals ───────────────────────────
{
  localStorage.clear();
  localStorage.setItem("mi_conditions", JSON.stringify([{ id: 9, name: "Hypertension", status: "resolved" }]));
  localStorage.setItem("mi_notes", JSON.stringify([{ id: 1, title: "n", sections: [{ body: "HTN and GERD discussed." }] }]));
  ok(existingConditionIds().has("hypertension"), "existing conditions canonicalize through the dictionary");
  const { suggestions } = runConditionScan();
  ok(!ids(suggestions).includes("hypertension"),
    "a condition already on the list (ANY status, even resolved) is never re-suggested");
  ok(ids(suggestions).includes("gerd"), "other mentions still suggest");
}
{
  localStorage.clear();
  localStorage.setItem("mi_notes", JSON.stringify([{ id: 1, title: "n", sections: [{ body: "HTN and GERD discussed." }] }]));
  let { suggestions } = runConditionScan();
  const gerd = suggestions.find(s => s.condId === "gerd");
  const after = dismissSuggestion(gerd);
  ok(!ids(after).includes("gerd") && ids(after).includes("hypertension"),
    "Dismiss removes only that suggestion");
  ok(readDismissed().some(t => t.condId === "gerd"), "dismissal is tombstoned");
  const rescan = runConditionScan();
  ok(!ids(rescan.suggestions).includes("gerd"),
    "a dismissed condition never comes back on rescan (calendar-sync tombstone semantics)");
  ok(rescan.added === 0, "rescanning unchanged records reports nothing new");
}

// ── Confirm + lifecycle ──────────────────────────────────────────────────────
{
  localStorage.clear();
  localStorage.setItem("mi_notes", JSON.stringify([{ id: 1, title: "n", sections: [{ body: "cirrhosis noted" }] }]));
  runConditionScan();
  ok(ids(readSuggestions()).includes("cirrhosis"), "scan persists suggestions to their own store");
  ok(localStorage.getItem("mi_conditions") === null,
    "scanning NEVER writes mi_conditions — nothing unreviewed counts as a condition anywhere");
  resolveSuggestion("cirrhosis");
  ok(!ids(readSuggestions()).includes("cirrhosis"), "confirming retires the suggestion card");
}
{
  localStorage.clear();
  localStorage.setItem("mi_notes", JSON.stringify([{ id: 1, title: "n", sections: [{ body: "gout flare" }] }]));
  const first = runConditionScan();
  ok(first.added === 1, "first scan counts new suggestions (drives the landing notice)");
  localStorage.setItem("mi_notes", JSON.stringify([]));
  const second = runConditionScan();
  ok(!ids(second.suggestions).includes("gout"),
    "suggestions never outlive their evidence — deleting the note removes the suggestion on rescan");
}

// ── Dictionary hygiene ───────────────────────────────────────────────────────
{
  const flat = CONDITION_DICTIONARY.flatMap(e => e.terms);
  ok(flat.every(t => t.length >= 3), "no ambiguous two-letter abbreviations in the dictionary");
  ok(new Set(CONDITION_DICTIONARY.map(e => e.id)).size === CONDITION_DICTIONARY.length, "dictionary ids are unique");
}

// ── Structural pins: Tab15 wiring mirrors Calendar Sync ──────────────────────
{
  const tab15 = readFileSync(SRC("components/tabs/Tab15.jsx"), "utf8");
  ok(tab15.includes("⟳ Scan Records"), "manual scan button exists");
  ok(tab15.includes("Suggested from your records"), "the suggested section renders above the list");
  ok(tab15.includes("possible condition") && tab15.includes("Review them now"),
    "a scan that lands suggestions pops the notice (v1.56.1 calendar pattern)");
  ok(tab15.includes("lastScanDay() === todayISO()"), "auto-scan runs at most once a day on tab entry");
  ok(tab15.includes("resolveSuggestion(confirmingSug.condId)"),
    "saving a confirmed suggestion retires its card through the normal Add Condition modal");
  ok(tab15.includes("setConfirmingSug(null)") && tab15.includes("dismissSuggestion(sug)"),
    "cancel clears the pending confirm; Dismiss tombstones");
  const lib = readFileSync(SRC("lib/conditionSuggest.js"), "utf8");
  const scanBody = lib.slice(lib.indexOf("export function runConditionScan"), lib.indexOf("\n}\n", lib.indexOf("export function runConditionScan")));
  const dismissBody = lib.slice(lib.indexOf("export function dismissSuggestion"), lib.indexOf("\n}\n", lib.indexOf("export function dismissSuggestion")));
  ok(lib.includes('"mi_condition_suggestions"') && !scanBody.includes("mi_conditions\"") && !dismissBody.includes("mi_conditions\"") && (lib.match(/setItem\("mi_conditions"/g) || []).length === 1,
    "the engine owns its own store; scan and dismiss never write mi_conditions; only the patient's Same-as link does (one write site)");

// ── Greg, 2026-09-11: one card per condition, cross-referenced by meaning ────
{
  // 1. Cross-reference ignores qualifiers and matches whole words
  ok(normalizeConditionName("Immunosuppression due to medication") === "immunosuppression", "qualifier 'due to medication' is ignored when cross-referencing");
  ok(normalizeConditionName("Post-transplant immunosuppression") === "immunosuppression", "'post-transplant' is ignored too (the History Builder's wording)");
  for (const nm of ["Immunosuppressed", "Immunosuppressed due to medication", "Immunosuppression due to medication", "Post-transplant immunosuppression", "Immunocompromised state"]) {
    ok(conditionEntryIds({ name: nm }).has("immunosuppression"), `"${nm}" on the list is recognized as the immunosuppression entry`);
  }
  ok(!conditionEntryIds({ name: "Bronchitis" }).has("copd"), "whole-word: 'Bronchitis' alone is not COPD (the term is 'chronic bronchitis')");
  ok(!conditionEntryIds({ name: "Prostate cancer" }).has("bph"), "'Prostate cancer' is not the BPH entry");
  ok(conditionEntryIds({ name: "Something unusual", aliases: ["Hepatic encephalopathy"] }).has("encephalopathy"), "an alias on a condition row counts for cross-referencing");

  // 2. Family collapse
  localStorage.clear();
  localStorage.setItem("mi_notes", JSON.stringify([{ id: "n1", title: "Visit", date: "2026-08-01", sections: [{ body: "Assessment: type 2 diabetes. Patient is diabetic; continue metformin." }] }]));
  let r = runConditionScan();
  ok(ids(r.suggestions).includes("diabetes-2") && !ids(r.suggestions).includes("diabetes"), "a note mentioning both 'type 2 diabetes' and 'diabetic' suggests Type 2 diabetes once, not Diabetes mellitus as well");
  localStorage.setItem("mi_conditions", JSON.stringify([{ id: 1, name: "Diabetes mellitus", status: "active" }]));
  r = runConditionScan();
  ok(ids(r.suggestions).includes("diabetes-2") && r.suggestions.find(s => s.condId === "diabetes-2").refines === "Diabetes mellitus", "with the generic on the list, the specific is still suggested and marked as a refinement of it");
  localStorage.setItem("mi_conditions", JSON.stringify([{ id: 1, name: "Type 2 diabetes", status: "active" }]));
  localStorage.setItem("mi_notes", JSON.stringify([{ id: "n1", title: "Visit", date: "2026-08-01", sections: [{ body: "Patient is diabetic; continue metformin." }] }]));
  r = runConditionScan();
  ok(!ids(r.suggestions).includes("diabetes"), "with the specific on the list, a generic mention is not suggested");
  ok(Object.values(CONDITION_PARENT).every(p => CONDITION_DICTIONARY.some(e => e.id === p)) && Object.keys(CONDITION_PARENT).every(c => CONDITION_DICTIONARY.some(e => e.id === c)), "every family pair names real dictionary entries");

  // 3. One document, counted once
  localStorage.clear();
  localStorage.setItem("mi_documents", JSON.stringify([{ id: "d1", title: "Clinic note 2026-08-01", date: "2026-08-01", notes: "Dx: ascites" }]));
  localStorage.setItem("mi_ref_docs", JSON.stringify([{ id: "rd1", name: "Clinic note 2026-08-01", studyDate: "2026-08-01", docType: "Clinical Notes", text: "Dx: ascites, managed with diuretics" }]));
  r = runConditionScan();
  const asc = r.suggestions.find(s => s.condId === "ascites");
  ok(asc && asc.sources.length === 1, "the same note in Documents and Source Documents is one source line, not two");

  // 4. Same as one I have
  localStorage.clear();
  localStorage.setItem("mi_conditions", JSON.stringify([{ id: 7, name: "Weak immune system (transplant meds)", status: "active" }]));
  localStorage.setItem("mi_notes", JSON.stringify([{ id: "n1", title: "Visit", date: "2026-08-01", sections: [{ body: "Patient is immunosuppressed." }] }]));
  r = runConditionScan();
  const sug = r.suggestions.find(s => s.condId === "immunosuppression");
  ok(!!sug, "a wording no dictionary catches is suggested first");
  const remaining = linkSuggestionToCondition(sug, 7);
  const row = JSON.parse(localStorage.getItem("mi_conditions"))[0];
  ok(Array.isArray(remaining) && !remaining.some(s => s.condId === "immunosuppression"), "linking retires the suggestion");
  ok(row.aliases.length === 1 && row.aliases[0] === "Immunosuppressed status" && row.name === "Weak immune system (transplant meds)", "the suggested name is saved as an alias; the row's own name is untouched");
  ok(readDismissed().some(t => t.condId === "immunosuppression" && t.sameAs === 7), "the tombstone records which condition it was linked to");
  ok(!ids(runConditionScan().suggestions).includes("immunosuppression"), "a rescan does not bring it back");
  ok(linkSuggestionToCondition(sug, 999) === null, "linking to a condition that does not exist changes nothing and reports it");
  const t15 = readFileSync(SRC("components/tabs/Tab15.jsx"), "utf8");
  ok(t15.includes(">Same as one I have</button>") && t15.includes("handleLinkSuggestion(sug)") && t15.includes('<option value="">Choose one</option>'),
    "the Conditions screen offers Same as one I have with a picker of the patient's own conditions");
  ok(t15.includes("More specific than {sug.refines}, which is already on your list.") && t15.includes("also: {c.aliases.join(\", \")}"),
    "a refinement is labelled on its card and a condition row shows its other names");
  linkSuggestionToCondition(sug, 7);
  ok(JSON.parse(localStorage.getItem("mi_conditions"))[0].aliases.length === 1, "linking twice does not duplicate the alias");
}
}

console.log(`\n${pass} passed, ${fail} failed (condition-suggest)`);
assert.equal(fail, 0);

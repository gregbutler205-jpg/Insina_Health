// ── Condition suggestions from the record (v1.57.0) ──────────────────────────
// Greg: "For Conditions make Suggestions from Diagnostic Tests, Labs & Trends,
// Clinical Notes, and anywhere appropriate — like Calendar Sync."
//
// Deterministic TEXT-MENTION scan (founder decision 2026-08-30): a built-in
// dictionary of condition names + abbreviations is matched against text the
// patient already has in their record. No AI, no inference from lab VALUES —
// labs contribute only through the text of imported lab documents (a
// requisition that literally says "Dx: Essential hypertension"). The app
// organizes what's written; it never diagnoses.
//
// Calendar-sync-shaped lifecycle:
//   scan → suggestions (own store, NEVER mi_conditions — AI prompts, session
//   hashes, and prep matching read every mi_conditions row, so unconfirmed
//   suggestions must not live there) → patient Confirms (opens the normal Add
//   Condition modal; only Save writes mi_conditions) or Dismisses (tombstoned
//   so a rescan never re-suggests it).

const SUGGESTIONS_KEY = "mi_condition_suggestions";
const DISMISSED_KEY   = "mi_condition_dismissed";
const LAST_SCAN_KEY   = "mi_condsug_last_scan";
const DISMISSED_MAX   = 300;
const DOC_TEXT_CAP    = 30000; // chars scanned per source document

// ── Dictionary ────────────────────────────────────────────────────────────────
// Curated: common chronic conditions + liver-transplant-relevant diagnoses.
// Terms are matched case-insensitively on word boundaries; longer phrases win
// overlaps. Abbreviations are kept ≥3 chars and unambiguous on purpose (no
// "MS"/"PE"-style two-letter traps). Display name = how it enters Conditions.
export const CONDITION_DICTIONARY = [
  { id: "hypertension",       name: "Hypertension",                    terms: ["hypertension", "high blood pressure", "htn"] },
  { id: "portal-htn",         name: "Portal hypertension",             terms: ["portal hypertension"] },
  { id: "diabetes-2",         name: "Type 2 diabetes",                 terms: ["type 2 diabetes", "type ii diabetes", "diabetes mellitus type 2", "t2dm", "dm2", "diabetes type 2"] },
  { id: "diabetes-1",         name: "Type 1 diabetes",                 terms: ["type 1 diabetes", "type i diabetes", "t1dm", "diabetes type 1"] },
  { id: "diabetes",           name: "Diabetes mellitus",               terms: ["diabetes mellitus", "diabetes", "diabetic"] },
  { id: "prediabetes",        name: "Prediabetes",                     terms: ["prediabetes", "pre-diabetes", "impaired fasting glucose"] },
  { id: "hyperlipidemia",     name: "Hyperlipidemia",                  terms: ["hyperlipidemia", "dyslipidemia", "high cholesterol", "hypercholesterolemia"] },
  { id: "cirrhosis",          name: "Cirrhosis",                       terms: ["cirrhosis", "cirrhotic"] },
  { id: "nash",               name: "NASH / MASH (fatty liver)",       terms: ["nash", "mash", "steatohepatitis", "fatty liver", "hepatic steatosis", "nafld", "masld"] },
  { id: "esld",               name: "End-stage liver disease",         terms: ["end-stage liver disease", "end stage liver disease", "esld"] },
  { id: "hep-b",              name: "Hepatitis B",                     terms: ["hepatitis b", "hep b", "hbv"] },
  { id: "hep-c",              name: "Hepatitis C",                     terms: ["hepatitis c", "hep c", "hcv"] },
  { id: "autoimmune-hep",     name: "Autoimmune hepatitis",            terms: ["autoimmune hepatitis"] },
  { id: "hepatitis",          name: "Hepatitis",                       terms: ["hepatitis"] },
  { id: "hcc",                name: "Hepatocellular carcinoma",        terms: ["hepatocellular carcinoma", "hcc", "liver cancer"] },
  { id: "ascites",            name: "Ascites",                         terms: ["ascites"] },
  { id: "varices",            name: "Esophageal varices",              terms: ["esophageal varices", "varices"] },
  { id: "encephalopathy",     name: "Hepatic encephalopathy",          terms: ["hepatic encephalopathy", "encephalopathy"] },
  { id: "ckd",                name: "Chronic kidney disease",          terms: ["chronic kidney disease", "ckd", "chronic renal insufficiency", "renal insufficiency"] },
  { id: "esrd",               name: "End-stage renal disease",        terms: ["end-stage renal disease", "end stage renal disease", "esrd", "kidney failure"] },
  { id: "aki",                name: "Acute kidney injury",             terms: ["acute kidney injury", "aki"] },
  { id: "cad",                name: "Coronary artery disease",         terms: ["coronary artery disease", "cad", "coronary disease"] },
  { id: "chf",                name: "Heart failure",                   terms: ["heart failure", "chf", "cardiomyopathy"] },
  { id: "afib",               name: "Atrial fibrillation",             terms: ["atrial fibrillation", "afib", "a-fib"] },
  { id: "mi",                 name: "Myocardial infarction (heart attack)", terms: ["myocardial infarction", "heart attack", "stemi", "nstemi"] },
  { id: "stroke",             name: "Stroke / TIA",                    terms: ["stroke", "cerebrovascular accident", "transient ischemic attack", "tia"] },
  { id: "pvd",                name: "Peripheral vascular disease",     terms: ["peripheral vascular disease", "peripheral artery disease", "pvd", "pad"] },
  { id: "dvt",                name: "Deep vein thrombosis",            terms: ["deep vein thrombosis", "dvt", "venous thromboembolism"] },
  { id: "copd",               name: "COPD",                            terms: ["copd", "chronic obstructive pulmonary disease", "emphysema", "chronic bronchitis"] },
  { id: "asthma",             name: "Asthma",                          terms: ["asthma", "asthmatic"] },
  { id: "osa",                name: "Obstructive sleep apnea",         terms: ["sleep apnea", "obstructive sleep apnea", "osa"] },
  { id: "gerd",               name: "GERD (acid reflux)",              terms: ["gerd", "gastroesophageal reflux", "acid reflux", "reflux disease"] },
  { id: "ibs",                name: "Irritable bowel syndrome",        terms: ["irritable bowel syndrome", "ibs"] },
  { id: "ibd",                name: "Inflammatory bowel disease",      terms: ["crohn's disease", "crohns disease", "ulcerative colitis", "inflammatory bowel disease"] },
  { id: "diverticulosis",     name: "Diverticulosis / diverticulitis", terms: ["diverticulosis", "diverticulitis"] },
  { id: "pancreatitis",       name: "Pancreatitis",                    terms: ["pancreatitis"] },
  { id: "gallstones",         name: "Gallstones",                      terms: ["cholelithiasis", "gallstones"] },
  { id: "hypothyroid",        name: "Hypothyroidism",                  terms: ["hypothyroidism", "hypothyroid", "hashimoto"] },
  { id: "hyperthyroid",       name: "Hyperthyroidism",                 terms: ["hyperthyroidism", "hyperthyroid", "graves disease", "graves' disease"] },
  { id: "osteoporosis",       name: "Osteoporosis",                    terms: ["osteoporosis"] },
  { id: "osteopenia",         name: "Osteopenia",                      terms: ["osteopenia"] },
  { id: "osteoarthritis",     name: "Osteoarthritis",                  terms: ["osteoarthritis", "degenerative joint disease"] },
  { id: "rheumatoid",         name: "Rheumatoid arthritis",            terms: ["rheumatoid arthritis"] },
  { id: "arthritis",          name: "Arthritis",                       terms: ["arthritis"] },
  { id: "gout",               name: "Gout",                            terms: ["gout", "gouty arthropathy", "hyperuricemia"] },
  { id: "anemia",             name: "Anemia",                          terms: ["anemia", "anemic"] },
  { id: "thrombocytopenia",   name: "Thrombocytopenia",                terms: ["thrombocytopenia", "low platelets", "low platelet count"] },
  { id: "neutropenia",        name: "Neutropenia",                     terms: ["neutropenia"] },
  { id: "bph",                name: "Enlarged prostate (BPH)",         terms: ["benign prostatic hyperplasia", "bph", "enlarged prostate", "prostatic hypertrophy"] },
  { id: "prostate-ca",        name: "Prostate cancer",                 terms: ["prostate cancer", "prostatic carcinoma", "prostate carcinoma"] },
  { id: "skin-ca",            name: "Skin cancer",                     terms: ["skin cancer", "basal cell carcinoma", "squamous cell carcinoma", "melanoma"] },
  { id: "colon-ca",           name: "Colon cancer",                    terms: ["colon cancer", "colorectal cancer"] },
  { id: "depression",         name: "Depression",                      terms: ["depression", "major depressive disorder", "depressive disorder"] },
  { id: "anxiety",            name: "Anxiety",                         terms: ["anxiety disorder", "generalized anxiety", "anxiety"] },
  { id: "insomnia",           name: "Insomnia",                        terms: ["insomnia"] },
  { id: "neuropathy",         name: "Neuropathy",                      terms: ["neuropathy", "peripheral neuropathy", "neuropathic pain"] },
  { id: "migraine",           name: "Migraine",                        terms: ["migraine"] },
  { id: "seizure",            name: "Seizure disorder",                terms: ["seizure disorder", "epilepsy", "seizures"] },
  { id: "obesity",            name: "Obesity",                         terms: ["obesity", "morbid obesity", "obese"] },
  { id: "malnutrition",       name: "Malnutrition",                    terms: ["malnutrition", "protein-calorie malnutrition"] },
  { id: "vitd-def",           name: "Vitamin D deficiency",            terms: ["vitamin d deficiency", "vitamin d insufficiency"] },
  { id: "iron-def",           name: "Iron deficiency",                 terms: ["iron deficiency"] },
  { id: "b12-def",            name: "Vitamin B12 deficiency",          terms: ["b12 deficiency", "vitamin b12 deficiency"] },
  { id: "hernia",             name: "Hernia",                          terms: ["ventral hernia", "inguinal hernia", "umbilical hernia", "hiatal hernia", "incisional hernia"] },
  { id: "cataracts",          name: "Cataracts",                       terms: ["cataract", "cataracts"] },
  { id: "glaucoma",           name: "Glaucoma",                        terms: ["glaucoma"] },
  { id: "hearing-loss",       name: "Hearing loss",                    terms: ["hearing loss"] },
  { id: "allergic-rhinitis",  name: "Allergic rhinitis",               terms: ["allergic rhinitis", "hay fever", "seasonal allergies"] },
  { id: "cmv",                name: "CMV infection",                   terms: ["cmv infection", "cytomegalovirus", "cmv viremia"] },
  { id: "ebv",                name: "EBV infection",                   terms: ["ebv infection", "epstein-barr", "ebv viremia"] },
  { id: "uti",                name: "Urinary tract infection",         terms: ["urinary tract infection", "uti"] },
  { id: "cdiff",              name: "C. diff infection",               terms: ["c. diff", "c diff", "clostridium difficile", "clostridioides difficile"] },
  { id: "rejection",          name: "Transplant rejection episode",    terms: ["acute rejection", "transplant rejection", "acute cellular rejection", "graft rejection"] },
  { id: "graft-dysfunction",  name: "Graft dysfunction",               terms: ["graft dysfunction", "graft failure"] },
  { id: "biliary-stricture",  name: "Biliary stricture",               terms: ["biliary stricture", "bile duct stricture", "anastomotic stricture"] },
  { id: "immunosuppression",  name: "Immunosuppressed status",         terms: ["immunosuppressed", "immunocompromised", "on immunosuppression", "immunosuppression"] },
];

// v1.59.0: the matcher and source collection moved to recordMentions.js so the
// Procedures suggestion flow shares one engine. These wrappers keep this
// module's contract (and its tests) unchanged.
import { matchDictionaryInText, collectRecordSources, safeArr } from "./recordMentions.js";

/** All condition hits in one text: [{condId, name, snippet}], one per condition. */
export function matchConditionsInText(text) {
  return matchDictionaryInText(text, CONDITION_DICTIONARY).map(h => ({ condId: h.id, name: h.name, snippet: h.snippet }));
}

/** The record text sources the scan reads (see recordMentions.js for exclusions). */
export function collectScanSources() { return collectRecordSources(); }

// ── Families (Greg, 2026-09-11) ──────────────────────────────────────────────
// A generic dictionary entry and a specific one for the same condition
// ("Diabetes mellitus" and "Type 2 diabetes") must not both be suggested.
// child id -> parent id. A suggested or listed child suppresses the parent;
// a listed parent leaves the child suggested but marked as a refinement.
export const CONDITION_PARENT = Object.freeze({
  "hep-b": "hepatitis", "hep-c": "hepatitis", "autoimmune-hep": "hepatitis",
  "diabetes-1": "diabetes", "diabetes-2": "diabetes",
  "osteoarthritis": "arthritis", "rheumatoid": "arthritis",
});
export function dictionaryEntry(id) { return CONDITION_DICTIONARY.find(e => e.id === id) || null; }

// ── Exclusions ────────────────────────────────────────────────────────────────
// Qualifiers a patient or a chart adds around a condition name; they never
// change which condition it is, so they are ignored when cross-referencing.
const NAME_QUALIFIERS = /\b(due to (?:a |the )?medications?|due to (?:a |the )?meds?|status|history of|hx of|h\/o|post[- ]transplant|controlled|uncontrolled|stable|resolved|in remission)\b/g;
/** Lowercase, punctuation to spaces, qualifiers removed, whitespace collapsed. */
export function normalizeConditionName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(NAME_QUALIFIERS, " ").replace(/\s+/g, " ").trim();
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word match of a dictionary term inside a normalized name. */
function nameHasTerm(norm, term) {
  const t = normalizeConditionName(term);
  return !!t && new RegExp(`(^|\\s)${escapeRe(t)}(\\s|$)`).test(norm);
}
/** Dictionary ids a single condition row represents: its name and its aliases. */
export function conditionEntryIds(cond) {
  const ids = new Set();
  const names = [cond?.name, ...(Array.isArray(cond?.aliases) ? cond.aliases : [])].map(normalizeConditionName).filter(Boolean);
  for (const norm of names) {
    for (const entry of CONDITION_DICTIONARY) {
      if (normalizeConditionName(entry.name) === norm || entry.terms.some(t => nameHasTerm(norm, t))) ids.add(entry.id);
    }
  }
  return ids;
}
/** Dictionary ids already represented in mi_conditions (any status), by name or alias. */
export function existingConditionIds() {
  const ids = new Set();
  for (const c of safeArr("mi_conditions")) for (const id of conditionEntryIds(c)) ids.add(id);
  return ids;
}

export function readDismissed() { return safeArr(DISMISSED_KEY); }

export function dismissSuggestion(sug) {
  const list = readDismissed().filter(t => t.condId !== sug.condId);
  list.push({ condId: sug.condId, name: sug.name, ts: Date.now() });
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(list.slice(-DISMISSED_MAX))); } catch {}
  const remaining = readSuggestions().filter(s => s.condId !== sug.condId);
  writeSuggestions(remaining);
  return remaining;
}

/**
 * "Same as one I have" (Greg, 2026-09-11): the suggested name becomes an alias
 * of an existing condition row, so it cross-references from now on, and the
 * suggestion is tombstoned with the link. Nothing else on the row changes.
 * Returns the remaining suggestions, or null when the condition is not found.
 */
export function linkSuggestionToCondition(sug, conditionId) {
  const list = safeArr("mi_conditions");
  const idx = list.findIndex(c => String(c?.id) === String(conditionId));
  if (idx < 0) return null;
  const row = list[idx];
  const aliases = Array.isArray(row.aliases) ? row.aliases.slice() : [];
  if (!aliases.some(a => normalizeConditionName(a) === normalizeConditionName(sug.name))) aliases.push(sug.name);
  list[idx] = { ...row, aliases };
  try { localStorage.setItem("mi_conditions", JSON.stringify(list)); } catch {}
  const dismissed = readDismissed().filter(t => t.condId !== sug.condId);
  dismissed.push({ condId: sug.condId, name: sug.name, ts: Date.now(), sameAs: row.id, sameAsName: row.name });
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed.slice(-DISMISSED_MAX))); } catch {}
  const remaining = readSuggestions().filter(s => s.condId !== sug.condId);
  writeSuggestions(remaining);
  return remaining;
}

/** Confirm housekeeping: drop the suggestion once the condition is saved. */
export function resolveSuggestion(condId) {
  const remaining = readSuggestions().filter(s => s.condId !== condId);
  writeSuggestions(remaining);
  return remaining;
}

// ── Store + scan ──────────────────────────────────────────────────────────────
export function readSuggestions() { return safeArr(SUGGESTIONS_KEY); }
export function writeSuggestions(list) { try { localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(list)); } catch {} }

export function lastScanDay() { try { return localStorage.getItem(LAST_SCAN_KEY) || ""; } catch { return ""; } }
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Full scan. Rebuilds the suggestion list from the current record (so
 * suggestions never outlive their evidence), minus existing conditions and
 * dismissals. Returns { suggestions, added } — added counts condition ids
 * that were not suggested before this scan (drives the landing notice).
 */
export function runConditionScan() {
  const before = new Set(readSuggestions().map(s => s.condId));
  const existing = existingConditionIds();
  const dismissed = new Set(readDismissed().map(t => t.condId));
  const byCond = new Map();
  for (const src of collectScanSources()) {
    for (const hit of matchConditionsInText(src.text)) {
      if (existing.has(hit.condId) || dismissed.has(hit.condId)) continue;
      if (!byCond.has(hit.condId)) byCond.set(hit.condId, { condId: hit.condId, name: hit.name, sources: [] });
      const bucket = byCond.get(hit.condId);
      // One document, counted once: the same note can live in Documents and
      // Source Documents (and be attached to a Medical Record) under one title
      // and date. Different stores, same evidence.
      const sameDoc = (s) => (s.store === src.store && s.refId === src.refId) ||
        (!!src.title && s.title === src.title && (s.date || "") === (src.date || ""));
      if (bucket.sources.length < 8 && !bucket.sources.some(sameDoc)) {
        bucket.sources.push({ store: src.store, refId: src.refId, title: src.title, date: src.date, snippet: hit.snippet });
      }
    }
  }
  // Family collapse: a specific condition (suggested here or already listed)
  // suppresses its generic parent; a listed parent marks the child as a
  // refinement of what the list already says.
  for (const [childId, parentId] of Object.entries(CONDITION_PARENT)) {
    if (byCond.has(childId) || existing.has(childId)) byCond.delete(parentId);
    if (byCond.has(childId) && existing.has(parentId)) byCond.get(childId).refines = dictionaryEntry(parentId)?.name || parentId;
  }
  const suggestions = [...byCond.values()].sort((a, b) => b.sources.length - a.sources.length || a.name.localeCompare(b.name));
  writeSuggestions(suggestions);
  try { localStorage.setItem(LAST_SCAN_KEY, todayISO()); } catch {}
  const added = suggestions.filter(s => !before.has(s.condId)).length;
  return { suggestions, added };
}

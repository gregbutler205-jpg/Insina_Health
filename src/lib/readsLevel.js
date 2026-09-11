// ── Reads level (DEC-067) ───────────────────────────────────────────────────
// Kept apart from aiScope.js on purpose: the launcher scope hand-off is
// module memory only and pinned never to touch storage (DEC-P50); this
// preference is meant to persist.
// With no launcher scope, the patient chooses how much of the record a
// question reads. "core" is everything except documents; "full" adds the
// reference documents and the findings extracted from them. Medications,
// allergies and conditions ride on every level (the Clinical Safety Core
// needs them). The choice is a UI preference: no clinical content, so it
// lives outside the vault like insina_ai_mode, and it persists across
// sessions because re-choosing Full for every documents question was the
// cost of the old default. Launcher chips (specific items) override it.
export const READS_KEY = "insina_ai_reads";
export const READS_LEVELS = Object.freeze({
  core: Object.freeze({ label: "Core record", hint: "Profile, conditions, medications, allergies, labs and vitals. Not your documents." }),
  full: Object.freeze({ label: "Full record", hint: "Core record plus your reference documents and the findings extracted from them." }),
});
export const DEFAULT_READS_LEVEL = "core";
export function normalizeReadsLevel(v) { return v === "full" ? "full" : "core"; }
export function loadReadsLevel() {
  try { return normalizeReadsLevel(localStorage.getItem(READS_KEY)); } catch { return DEFAULT_READS_LEVEL; }
}
export function saveReadsLevel(level) {
  try { localStorage.setItem(READS_KEY, normalizeReadsLevel(level)); } catch { /* private mode: the choice lasts the page */ }
}


/** Words that usually mean the question is about a document, not the reconciled record. A hint, never a gate. */
const DOC_WORDS = /\b(notes?|reports?|documents?|discharge|pathology|biops(?:y|ies)|procedure|egd|colonoscopy|endoscopy|imaging|scans?|mri|ct|ultrasound|x-?ray|radiology|operative|op note|letter)\b/i;
export function mentionsDocuments(text) { return DOC_WORDS.test(String(text || "")); }


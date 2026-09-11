// ── AI session lifecycle — AI_SESSION_SPEC v0.3 Part B ──────────────────────
// (DEC-C8/9/10/11/12/15, final IDs merged 2026-08-17.)
// Deterministic shell: sessions, immutable segments, record-state stamps,
// staleness, discard occurrence log. Pure and Node-testable — no React, no
// network. Generation stays the existing Surface A path; nothing here talks
// to the model.
//
// Storage is the vaulted mi_* family (spec Sec 8: session content inherits
// the encryption gate). The legacy feed threads moved into the vault as
// mi_ai_chat_legacy in migration v5 (OPEN-17b, v1.64.0).

const SESSIONS_KEY    = "mi_ai_sessions";
const DISCARD_LOG_KEY = "mi_ai_discard_log";

// No corpus has shipped (LIVER_CORPUS_ROSTER is triage; no thresholds, no
// extraction). Segments still stamp a corpus version so the staleness rule
// (DEC-C12) is exercised from day one; bump when corpus v1 lands.
export const CORPUS_VERSION = "none";

// DEC-C15: the record-state hash covers the reconciled record ONLY —
// the tier the AI reads (Tab11 buildDataSections + prompts/identity). The
// archive tier (mi_lab_archive), session content, reference documents
// (supplied per-turn as delimited documents, not record facts), and UI state
// are excluded by definition. Canonical field order = this sorted list.
export const RECORD_STORES = [
  "mi_allergies",
  "mi_care_team",
  "mi_clinical_findings",
  "mi_conditions",
  "mi_lab_custom_ranges",
  "mi_labs",
  "mi_meds_full",
  "mi_profile_personal",
  "mi_readings",
  "mi_surgeries",
];

/** FNV-1a 32-bit over the canonical serialization. Staleness detection, not
 * security — collisions cost one spurious (or one missed) divider, nothing
 * else. Returns an 8-hex-char string. */
export function recordStateHash() {
  let h = 0x811c9dc5;
  for (const key of RECORD_STORES) {
    let raw = "";
    try { raw = localStorage.getItem(key) || ""; } catch { raw = ""; }
    const s = key + "\u0000" + raw + "\u0000";
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h >>> 0) * 0x01000193;
    }
  }
  return ((h >>> 0).toString(16)).padStart(8, "0");
}

// ── Store access ─────────────────────────────────────────────────────────────

function readStore() {
  try {
    const v = JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
    return Array.isArray(v) ? v.map(normalizeSession).filter(Boolean) : [];
  } catch { return []; }
}
function writeStore(sessions) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch {}
}

/** Read-time normalization: unknown state → "active", missing arrays →
 * empty, so a payload from an older device never throws downstream. */
function normalizeSession(s) {
  if (!s || typeof s !== "object" || !s.id) return null;
  return {
    ...s,
    state: s.state === "saved" ? "saved" : "active",
    segments: Array.isArray(s.segments) ? s.segments.map(normalizeSegment).filter(Boolean) : [],
    savedThrough: typeof s.savedThrough === "number" ? s.savedThrough : 0,
    savedSegments: typeof s.savedSegments === "number" ? s.savedSegments : 0,
    noteId: s.noteId ?? null,
  };
}
function normalizeSegment(g) {
  if (!g || typeof g !== "object") return null;
  return {
    ...g,
    messages: Array.isArray(g.messages) ? g.messages : [],
    stamp: g.stamp && typeof g.stamp === "object" ? g.stamp : { recordHash: "", corpusVersion: "", ts: "" },
  };
}

export function loadSessions() { return readStore(); }

export function getSession(id) { return readStore().find(s => s.id === id) || null; }

/** Upsert one session document. Stamps updatedAt so the DEC-046 Drive merge
 * lets the newer device's copy of the SAME session win instead of
 * local-first freezing a stale one. */
export function saveSession(session) {
  session.updatedAt = Date.now();
  const all = readStore();
  const i = all.findIndex(s => s.id === session.id);
  if (i >= 0) all[i] = session; else all.unshift(session);
  writeStore(all);
  return session;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

function freshStamp() {
  return { recordHash: recordStateHash(), corpusVersion: CORPUS_VERSION, ts: new Date().toISOString() };
}

function newSegment() {
  return {
    id: "seg_" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    openedAt: new Date().toISOString(),
    closedAt: null,
    stamp: freshStamp(),
    messages: [],
  };
}

/** Session title per spec Sec 1: the opening question, truncated. */
export function sessionTitle(openingQuestion) {
  const t = String(openingQuestion || "").replace(/\s+/g, " ").trim();
  if (!t) return "New session";
  return t.length > 80 ? t.slice(0, 77).trimEnd() + "…" : t;
}

/** Start: new session with a stamp captured at segment open (DEC-C12). */
export function newSession(openingQuestion) {
  return {
    id: "sess_" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    title: sessionTitle(openingQuestion),
    state: "active",
    createdAt: new Date().toISOString(),
    savedAt: null,
    noteId: null,
    savedThrough: 0,   // messages persisted to the note so far
    savedSegments: 0,  // segments persisted to the note so far
    segments: [newSegment()],
  };
}

/** The segment new turns append to. Reopening a saved thread leaves closed
 * segments immutable — the first new turn opens a NEW segment with a freshly
 * captured stamp (DEC-C11). Mutates and returns the session. */
export function ensureOpenSegment(session) {
  const last = session.segments[session.segments.length - 1];
  if (!last || last.closedAt) session.segments.push(newSegment());
  return session;
}

/** Append one turn to the open segment. */
export function appendTurn(session, { role, text, mode, ts }) {
  ensureOpenSegment(session);
  const seg = session.segments[session.segments.length - 1];
  seg.messages.push({ role, text, mode: mode || null, ts: ts || new Date().toISOString() });
  return session;
}

/** Close the open segment (save or close). Closed segments are immutable —
 * never re-rendered, recomputed, or regenerated (spec Sec 2 segment rules). */
export function closeOpenSegment(session) {
  const seg = session.segments[session.segments.length - 1];
  if (seg && !seg.closedAt) seg.closedAt = new Date().toISOString();
  return session;
}

export function totalMessages(session) {
  return session.segments.reduce((n, g) => n + g.messages.length, 0);
}

/** Turns not yet persisted to the session's note (drives the warn-on-close). */
export function hasUnsavedTurns(session) {
  return totalMessages(session) > (session.savedThrough || 0);
}

/** Mark persisted-through-current-content after a successful note write. */
export function markSaved(session, noteId) {
  session.state = "saved";
  session.savedAt = new Date().toISOString();
  if (noteId) session.noteId = noteId;
  session.savedThrough = totalMessages(session);
  session.savedSegments = session.segments.length;
  return session;
}

/** Segments the next note write must append (append-only note, spec Sec 7). */
export function unsavedSegments(session) {
  return session.segments.slice(session.savedSegments || 0);
}

/** Discard: remove content, log occurrence only — timestamp, no content
 * (DEC-C10). The log is patient-local like everything else. */
export function discardSession(id) {
  writeStore(readStore().filter(s => s.id !== id));
  try {
    const log = JSON.parse(localStorage.getItem(DISCARD_LOG_KEY) || "[]");
    log.unshift({ ts: new Date().toISOString() });
    localStorage.setItem(DISCARD_LOG_KEY, JSON.stringify(log.slice(0, 200)));
  } catch {}
}

// ── Staleness (DEC-C12) ────────────────────────────────────────────────

/** Compare a session's LAST segment stamp against current state. */
export function stalenessOf(session) {
  const last = session.segments[session.segments.length - 1];
  if (!last) return { stale: false, recordChanged: false, corpusChanged: false };
  const recordChanged = last.stamp.recordHash !== recordStateHash();
  const corpusChanged = last.stamp.corpusVersion !== CORPUS_VERSION;
  return { stale: recordChanged || corpusChanged, recordChanged, corpusChanged };
}

/** Divider between two adjacent segments when either stamp component moved.
 * The divider persists into the note and print (spec Sec 6). */
export function segmentTransition(prevSegment, nextSegment) {
  if (!prevSegment || !nextSegment) return { divider: false };
  const recordChanged = prevSegment.stamp.recordHash !== nextSegment.stamp.recordHash;
  const corpusChanged = prevSegment.stamp.corpusVersion !== nextSegment.stamp.corpusVersion;
  return { divider: recordChanged || corpusChanged, recordChanged, corpusChanged };
}

// ── Copy (PROVISIONAL — every string below is [CONFIRM] pending in the spec;
// drafted for founder approval, flagged in the session report) ──────────────

export const SESSION_COPY = {
  warnOnCloseTitle: "Close without saving?",
  warnOnCloseBody:
    "This session hasn't been saved to Notes. If you close it now, the " +
    "conversation is discarded and can't be recovered. Only the fact that a " +
    "session happened is kept. None of its content.",
  warnOnCloseKeep: "Keep session open",
  warnOnCloseDiscard: "Discard session",
  dividerRecordChanged: (dateStr) =>
    `Continued ${dateStr}. Your record has changed since the previous part of this conversation. Earlier answers reflect the record as it was then.`,
  dividerCorpusChanged: (dateStr) =>
    `Continued ${dateStr}: Insina's reference information has been updated since the previous part of this conversation.`,
  headerFooter: "Informational only. This is not medical advice. Always consult your physician before making any health decisions.",
  staleReopenNotice:
    "Your record has changed since this conversation's last part. Earlier answers reflect the record as it was then; your next question starts a new, freshly-stamped part.",
  warnUnsavedTurnsBody:
    "This conversation was saved to Notes earlier, but the turns you've added since haven't been. Closing now discards only those newest turns. The saved part stays in Notes.",
};

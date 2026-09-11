// ── AI conversation sessions: context isolation + discussion report ──────────
// (2026-07-21 work order Part 2, DEC-042.) Pure and Node-testable — no React,
// no network, no model call. Two jobs:
//
// 1. apiMessagesForConv(): the context rule as a function — per turn, the API
//    sees the patient record (system prompt) + THIS session's turns only.
//    Saved prior conversations rendered above the thread are archive UI and
//    never enter context. Extracted from Tab11's inline filter so the
//    invariant is unit-tested instead of implied.
//
// 2. buildSessionReportText(): the End & Save discussion report. Deliberately
//    NO AI summary step — the transcript is verbatim what the patient saw
//    (assistant turns pass through the same deterministic F-03 output filter
//    the screen applied), and the consolidated "Questions for your care team" /
//    "Why you're asking" sections are extracted and deduplicated in code, so
//    there is no synthesis step where wording or hedges could drift.

import { scanForProhibitedDirectives } from "./aiOutputFilter.js";
import { displayPhone } from "./displaySafe.js";

/** The context rule: only THIS conversation's turns, role-mapped for the API. */
export function apiMessagesForConv(messages, conv) {
  return (messages || [])
    .filter(m => (m.conv ?? 0) === conv)
    .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
}

// ── Section extraction ───────────────────────────────────────────────────────
// The DEC-041 prompt rules mandate exact section titles ("Questions for your
// care team:" / "Why you're asking:"), which is what makes deterministic
// extraction possible. Headings may arrive plain or **bold**, with or without
// a trailing colon. Items are bullet ("-", "•") or numbered lines under the
// heading, ending at the next heading-like line or ----- divider.

const Q_HEAD = /^\**\s*questions for your care team\s*:?\s*\**$/i;
const E_HEAD = /^\**\s*why you'?re asking\s*:?\s*\**$/i;
// The education section's mandated closing line — appended once by the report
// itself, so per-turn copies are filtered out of the item list.
const E_CLOSER = /if your doctor'?s answer doesn'?t cover/i;

function isHeadingLike(trimmed) {
  if (/^-{3,}$/.test(trimmed)) return true;                 // ----- divider
  if (/^\*\*[^*]+\*\*:?$/.test(trimmed)) return true;      // **Any bold header**
  return false;
}

function itemText(trimmed) {
  const m = trimmed.match(/^(?:[-•]|\d+\.)\s+(.*)$/);
  return m ? m[1].trim() : null;
}

/** Parse one assistant message into { questions: [], education: [] }. */
export function extractQuestionSections(text) {
  const questions = [], education = [];
  let mode = null; // null | "q" | "e"
  for (const rawLine of String(text ?? "").split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (Q_HEAD.test(trimmed)) { mode = "q"; continue; }
    if (E_HEAD.test(trimmed)) { mode = "e"; continue; }
    if (mode && isHeadingLike(trimmed)) { mode = null; continue; }
    if (!mode) continue;
    const item = itemText(trimmed);
    if (item == null) continue; // prose inside a section — not an item
    if (mode === "e" && E_CLOSER.test(item)) continue;
    (mode === "q" ? questions : education).push(item);
  }
  return { questions, education };
}

/** Dedup key: case/whitespace/punctuation-insensitive. */
function normKey(s) {
  return String(s).toLowerCase().replace(/["'""'']/g, "").replace(/[.?!,;:]+\s*$/g, "").replace(/\s+/g, " ").trim();
}

/** Consolidate + dedupe questions/education across every assistant turn, in
 * first-appearance order. */
export function consolidateAcrossTurns(convMessages) {
  const seenQ = new Set(), seenE = new Set();
  const questions = [], education = [];
  for (const m of convMessages || []) {
    if (m.role === "user" || !m.text) continue;
    const { questions: q, education: e } = extractQuestionSections(m.text);
    for (const item of q) { const k = normKey(item); if (k && !seenQ.has(k)) { seenQ.add(k); questions.push(item); } }
    for (const item of e) { const k = normKey(item); if (k && !seenE.has(k)) { seenE.add(k); education.push(item); } }
  }
  return { questions, education };
}

// ── Contact routing block (single instance, end of report) ───────────────────
// Deterministic from the care-team record, not model output. Anyone with a
// 24-hour line first (the number that matters at 2 AM), then coordinators,
// then the rest — same ranking the Emergency Card uses.
export function buildContactBlock(careTeam) {
  const team = Array.isArray(careTeam) ? careTeam : [];
  if (team.length === 0) return "**Contact your care team**\n- No care team members are on file.";
  const rank = p => p.phone24 ? 0 : /coordinator/i.test(`${p.role || ""} ${p.specialty || ""}`) ? 1 : 2;
  const rows = [...team].sort((a, b) => rank(a) - rank(b)).map(p => {
    const who = `${p.name || "–"}${p.role || p.specialty ? ` (${p.role || p.specialty})` : ""}`;
    const phones = [
      p.phone24 ? `24 hr: ${displayPhone(p.phone24)}` : "",
      p.phone ? `office: ${displayPhone(p.phone)}` : "",
    ].filter(Boolean).join(" · ");
    return `- ${who}${phones ? ` — ${phones}` : ""}`;
  });
  return `**Contact your care team**\n${rows.join("\n")}`;
}

// ── The discussion report ────────────────────────────────────────────────────

const fmtTs = iso => {
  if (!iso) return "time not recorded";
  try { return new Date(iso).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return "time not recorded"; }
};

/**
 * Build the End & Save discussion report as markdown-ish text (the shared
 * renderer's dialect). Contains, in order: header (session date/time), the
 * verbatim timestamped transcript, consolidated Questions / Why you're asking,
 * and a single contact block.
 * @param {object} opts
 * @param {Array}  opts.convMessages - this session's messages, in order
 * @param {Array}  opts.careTeam     - mi_care_team entries
 * @param {string} [opts.startedAt]  - ISO session start
 * @param {string} [opts.endedAt]    - ISO session end (defaults to last turn's ts)
 */
export function buildSessionReportText({ convMessages = [], careTeam = [], startedAt = null, endedAt = null }) {
  const lastTs = [...convMessages].reverse().find(m => m.ts)?.ts || null;
  const firstTs = convMessages.find(m => m.ts)?.ts || null;

  const header = `**AI Conversation Report**\nSession: ${fmtTs(startedAt || firstTs)}–${fmtTs(endedAt || lastTs)}`;

  const transcript = convMessages.map(m => {
    if (m.role === "user") {
      return `**You asked (${fmtTs(m.ts)}):**\n${m.text}`;
    }
    // Exactly what the patient saw: the screen renders assistant text through
    // the deterministic F-03 filter, so the report applies the same filter —
    // verbatim-as-displayed, never verbatim-raw-model-output.
    const { redactedText } = scanForProhibitedDirectives(m.text || "");
    return `**Insina AI (${fmtTs(m.ts)}):**\n${redactedText}`;
  }).join("\n\n-----\n\n");

  const { questions, education } = consolidateAcrossTurns(convMessages);
  const qSection = questions.length
    ? `**Questions for your care team**\n${questions.map(q => `- ${q}`).join("\n")}`
    : `**Questions for your care team**\n- No care-team questions were generated in this conversation.`;
  const eSection = education.length
    ? `**Why you're asking**\n${education.map(e => `- ${e}`).join("\n")}\n- If your doctor's answer doesn't cover any of these, ask about that one directly.`
    : "";

  return [
    header,
    "-----",
    "**Transcript**",
    transcript || "_(no messages)_",
    "-----",
    qSection,
    eSection,
    "-----",
    buildContactBlock(careTeam),
    "-----",
    "Informational only. This is not medical advice. Always consult your physician before making any health decisions.",
  ].filter(Boolean).join("\n\n");
}

// ── AI_SESSION_SPEC v0.3 segment model (DEC-C11, pre-merge) ─────────────
// Session-document counterparts of the DEC-042 helpers above. The legacy
// conv-id helpers stay for the archived legacy threads (mi_ai_chat_legacy
// since migration v5); nothing new writes that store.

import { segmentTransition, SESSION_COPY } from "./aiSessions.js";
import { stripControlChars } from "../prompts/documents.js";

const PRIOR_OPEN  = "[PRIOR SESSION SEGMENTS: BEGIN]";
const PRIOR_CLOSE = "[PRIOR SESSION SEGMENTS: END]";

/** The reopen context rule (spec Sec 2): prior segments enter context
 * delimited by their stamps and marked as prior-state content. S-07
 * delimiting conventions; control characters stripped so patient text can't
 * fake a delimiter. */
export function buildPriorSegmentBlock(priorSegments) {
  const parts = [PRIOR_OPEN,
    "The following earlier parts of this conversation were generated against " +
    "PREVIOUS states of the patient's record. They are reference context only. " +
    "Values in them may be superseded: always answer from the CURRENT record " +
    "data in the system prompt, and note when something has changed."];
  priorSegments.forEach((seg, i) => {
    parts.push(`--- Segment ${i + 1} · ${seg.stamp?.ts || "undated"} · record-state ${seg.stamp?.recordHash || "unknown"} (superseded) ---`);
    for (const m of seg.messages || []) {
      const who = m.role === "user" ? "Patient" : "Assistant";
      parts.push(`${who}: ${stripControlChars(String(m.text || ""))}`);
    }
  });
  parts.push(PRIOR_CLOSE);
  return parts.join("\n");
}

/** API messages for a session document: delimited prior segments (when any),
 * then the CURRENT segment's turns. Mirrors apiMessagesForConv's contract —
 * the caller supplies the record via the system prompt. */
export function apiMessagesForSession(session) {
  const segs = session?.segments || [];
  if (segs.length === 0) return [];
  const current = segs[segs.length - 1];
  const prior = segs.slice(0, -1).filter(g => (g.messages || []).length > 0);
  const msgs = [];
  if (prior.length > 0) {
    msgs.push({ role: "user", content: buildPriorSegmentBlock(prior) });
    msgs.push({
      role: "assistant",
      content: "Understood. Those earlier segments reflect previous record states; I will treat them as reference only and answer from the current record.",
    });
  }
  for (const m of current.messages || []) {
    msgs.push({ role: m.role === "user" ? "user" : "assistant", content: m.text });
  }
  return msgs;
}

const fmtDay = iso => {
  try { return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  catch { return String(iso || ""); }
};

/** One segment's verbatim transcript text (F-03-filtered, as displayed),
 * prefixed with its stamp line and — when the record or corpus moved between
 * the previous segment and this one — the divider sentence that persists
 * into the note and print (spec Sec 6). */
export function buildSegmentSectionText(segment, prevSegment) {
  const lines = [];
  const tr = segmentTransition(prevSegment, segment);
  if (tr.divider) {
    lines.push(`_${tr.recordChanged
      ? SESSION_COPY.dividerRecordChanged(fmtDay(segment.stamp?.ts))
      : SESSION_COPY.dividerCorpusChanged(fmtDay(segment.stamp?.ts))}_`);
    lines.push("-----");
  }
  lines.push(`Record state ${segment.stamp?.recordHash || "unknown"} · reference set ${segment.stamp?.corpusVersion || "unknown"} · ${fmtTs(segment.stamp?.ts)}`);
  const turns = (segment.messages || []).map(m => {
    if (m.role === "user") return `**You asked (${fmtTs(m.ts)}):**\n${m.text}`;
    const { redactedText } = scanForProhibitedDirectives(m.text || "");
    return `**Insina AI (${fmtTs(m.ts)}):**\n${redactedText}`;
  });
  lines.push(turns.join("\n\n-----\n\n") || "_(no messages)_");
  return lines.join("\n\n");
}

/** Every message across every segment, for cross-segment consolidation. */
export function allSessionMessages(session) {
  return (session?.segments || []).flatMap(g => g.messages || []);
}

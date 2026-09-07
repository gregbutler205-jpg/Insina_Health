// ── A-13 / UI-15: analysis save & export helpers ──────────────────────────────
// One place that turns an AI analysis into (a) a My Notes entry carrying the
// explicit AI-generated label DEC-022 requires, and (b) a dated markdown
// download with the {lastSync} freshness stamp and the standing Surface H
// footer. Both Tab05 (Full Analysis) and Tab11 (open-as-report) route through
// these; nothing else may write AI analyses into mi_notes.

export const ANALYSIS_FOOTER =
  "Compiled by the patient from their own records using Insina Health. " +
  "Informational; verify against source records.";

export function getLastSyncStamp() {
  const raw = localStorage.getItem("mi_last_sync");
  if (!raw) return "never synced";
  const d = new Date(raw);
  return isNaN(d) ? "unknown" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Canonical mi_notes entry for an AI analysis. Uses Tab10's own note shape
 * (sections[].header/body — NOT the `heading`/flat-`content` variants two
 * older writers produced, which Tab10's editor can't open) and carries
 * `aiGenerated: true` so the note is distinguishable at a glance and on
 * export (DEC-022).
 */
export function mkAnalysisNote({ title, content, mode }) {
  return {
    id: Date.now().toString(),
    title,
    pinned: false,
    tag: "General",
    date: new Date().toISOString().slice(0, 10),
    preview: (content || "").replace(/\*\*/g, "").slice(0, 110),
    aiGenerated: true,
    aiMode: mode || "standard",
    sections: [{ id: "s1", type: "text", header: "AI Analysis", body: content || "" }],
  };
}

/** Save an analysis into My Notes. Returns the saved note. */
export function saveAnalysisToNotes({ title, content, mode }) {
  const note = mkAnalysisNote({ title, content, mode });
  let notes;
  try { notes = JSON.parse(localStorage.getItem("mi_notes") || "[]"); } catch { notes = []; }
  notes.unshift(note);
  localStorage.setItem("mi_notes", JSON.stringify(notes));
  return note;
}

// ── AI session transcript notes — AI_SESSION_SPEC v0.3 Sec 7 (DEC-C9) ──
// Verbatim transcript, append-only: the first save creates the note with an
// About section; every save appends one section per newly-saved segment and
// NEVER rewrites an existing section. No AI summary is produced at save time
// (C9) — everything below is deterministic.

import { unsavedSegments, CORPUS_VERSION } from "./aiSessions.js";
import { buildSegmentSectionText } from "./aiSessionReport.js";

/**
 * Create-or-append the session's transcript note. Returns the note id.
 * Mutates nothing on the session — the caller runs markSaved afterwards.
 */
export function saveSessionTranscriptToNotes(session) {
  let notes;
  try { notes = JSON.parse(localStorage.getItem("mi_notes") || "[]"); } catch { notes = []; }

  const newSegs = unsavedSegments(session);
  if (newSegs.length === 0 && session.noteId) return session.noteId;

  let note = session.noteId ? notes.find(n => n.id === session.noteId) : null;
  const today = new Date().toISOString().slice(0, 10);

  if (!note) {
    note = {
      id: Date.now().toString(),
      title: `AI Session: ${session.title}`,
      pinned: false,
      tag: "General",
      date: today,
      preview: session.title.slice(0, 110),
      aiGenerated: true,
      aiMode: session.segments.flatMap(g => g.messages).find(m => m.mode)?.mode || "standard",
      sessionId: session.id,
      sections: [{
        id: "s-about",
        type: "text",
        header: "About this session",
        body:
          `Started ${new Date(session.createdAt).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}. ` +
          `Verbatim transcript — exactly what was asked and shown, in order, nothing summarized. ` +
          `Reference set: ${CORPUS_VERSION}.\n\n${ANALYSIS_FOOTER}`,
      }],
    };
    notes.unshift(note);
  }

  const already = session.savedSegments || 0;
  newSegs.forEach((seg, i) => {
    const absoluteIndex = already + i;               // 0-based across the session
    const prev = absoluteIndex > 0 ? session.segments[absoluteIndex - 1] : null;
    note.sections.push({
      id: "s-seg-" + seg.id,
      type: "text",
      header: `Part ${absoluteIndex + 1}–${new Date(seg.openedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      body: buildSegmentSectionText(seg, prev),
    });
  });
  note.date = today;

  localStorage.setItem("mi_notes", JSON.stringify(notes));
  return note.id;
}

/** Markdown document for one analysis: title, date, freshness stamp, body, Surface H footer. */
export function buildAnalysisMarkdown({ analysisType, content, mode }) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const modeLabel = mode === "advanced" ? "Advanced Mode" : "Standard Mode";
  return `# ${analysisType}: Insina Health

*Generated ${date} · ${modeLabel} · Record last synced: ${getLastSyncStamp()}*

---

${content || ""}

---

*${ANALYSIS_FOOTER}*
`;
}

/** Trigger a browser download of the analysis as a dated .md file named by type and date. */
export function downloadAnalysisMarkdown({ analysisType, content, mode }) {
  const md = buildAnalysisMarkdown({ analysisType, content, mode });
  const slug = (analysisType || "analysis").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Insina-${slug}-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

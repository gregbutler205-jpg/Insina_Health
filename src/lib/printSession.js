// ── Session print — AI_SESSION_SPEC v0.3 Sec 7 (DEC-C13 rev) ───────────
// The REFERENCE implementation of the handoff document format: shield logo,
// patient identity block, generation timestamp, provenance and disclaimer
// furniture. The caregiver handoff feature reuses THIS format when built —
// the dependency runs from caregiver to session.
//
// Reachable only through Save and Print (C9): the caller persists the note
// first, so every printed artifact has a stored, reproducible counterpart.
//
// CSP invariant (S-03 / v1.49.1): ZERO script tags — the opener wires the
// print button via wirePrintWindow. Print styles use colored TYPE and
// borders, never background colors (printers drop backgrounds by default).

import { renderAiMarkdownToHtml } from "./renderAiText.js";
import { scanForProhibitedDirectives } from "./aiOutputFilter.js";
import { segmentTransition, SESSION_COPY, CORPUS_VERSION } from "./aiSessions.js";
import { consolidateAcrossTurns, allSessionMessages } from "./aiSessionReport.js";
import { ageFromDob } from "../store.js";
import { formatDateUS } from "./displaySafe.js";

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STYLE = `
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Georgia,serif; max-width:780px; margin:44px auto; color:#1a1a1a; font-size:13.5px; line-height:1.65; padding:0 24px; }
  .logo { height:50px; margin-bottom:14px; }
  h1 { font-size:26px; font-weight:700; letter-spacing:-.5px; margin-bottom:4px; }
  .identity { border:1.5px solid #2563eb; border-radius:6px; padding:10px 14px; margin:14px 0 6px; font-size:12.5px; }
  .identity b { font-size:14px; }
  .meta { font-size:10.5px; color:#555; font-family:monospace; margin-bottom:18px; }
  .rule { border:none; border-top:2px solid #2563eb; margin:14px 0 20px; }
  .stamp { font-family:monospace; font-size:10px; color:#555; border:1px solid #bbb; border-radius:4px; padding:3px 8px; display:inline-block; margin:16px 0 10px; }
  .divider { border-top:1.5px dashed #b45309; margin:22px 0 10px; padding-top:8px; font-size:12px; color:#b45309; font-style:italic; }
  .q-label { font-weight:700; font-size:12.5px; margin:16px 0 4px; color:#2563eb; }
  .q-text { margin-bottom:6px; }
  .a-block { margin-bottom:8px; padding-bottom:12px; border-bottom:1px solid #eee; }
  .tail { margin-top:26px; border-top:1px solid #999; padding-top:12px; }
  .footer { margin-top:36px; border-top:1px solid #ddd; padding-top:10px; font-size:10px; color:#777; display:flex; justify-content:space-between; gap:16px; }
  @media print { body { margin:26px; } }
`;

const fmtTs = iso => {
  try { return new Date(iso).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
};
const fmtDay = iso => {
  try { return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  catch { return ""; }
};

/**
 * Full session print document. All collapsible content renders expanded;
 * every stamp and divider survives to paper (spec Sec 7).
 */
export function buildSessionPrintHtml(session, { logoUrl } = {}) {
  let profile = {};
  try { profile = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}") || {}; } catch {}
  const age = ageFromDob(profile.dob) ?? profile.age ?? "";
  const identityBits = [
    profile.dob ? `DOB ${esc(formatDateUS(profile.dob))}` : "",
    age !== "" ? `Age ${esc(age)}` : "",
  ].filter(Boolean).join(" · ");

  const segmentsHtml = (session.segments || []).map((seg, i) => {
    const prev = i > 0 ? session.segments[i - 1] : null;
    const tr = segmentTransition(prev, seg);
    const divider = tr.divider
      ? `<div class="divider">${esc(tr.recordChanged
          ? SESSION_COPY.dividerRecordChanged(fmtDay(seg.stamp?.ts))
          : SESSION_COPY.dividerCorpusChanged(fmtDay(seg.stamp?.ts)))}</div>`
      : "";
    const stamp = `<div class="stamp">Part ${i + 1} · record state ${esc(seg.stamp?.recordHash || "unknown")} · reference set ${esc(seg.stamp?.corpusVersion || "unknown")} · ${esc(fmtTs(seg.stamp?.ts))}</div>`;
    const turns = (seg.messages || []).map(m => {
      if (m.role === "user") {
        return `<div class="q-label">You asked${m.ts ? ` (${esc(fmtTs(m.ts))})` : ""}:</div><div class="q-text">${esc(m.text)}</div>`;
      }
      const { redactedText } = scanForProhibitedDirectives(m.text || "");
      return `<div class="a-block">${renderAiMarkdownToHtml(redactedText)}</div>`;
    }).join("");
    return divider + stamp + turns;
  }).join("");

  const msgs = allSessionMessages(session);
  const { questions } = consolidateAcrossTurns(msgs);
  const qHtml = questions.length
    ? `<div class="tail"><div class="q-label">Questions for your care team</div>${questions.map(q => `<div class="q-text">• ${esc(q)}</div>`).join("")}</div>`
    : "";
  // The "Contact your care team" roster was dropped from the handoff document
  // (it re-listed the entire care team on every report; Greg 2026-08-29).

  const now = fmtTs(new Date().toISOString());
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>AI Session: Insina Health</title><style>${STYLE}</style>
  </head><body>
    <img src="${logoUrl}" class="logo" alt="Insina Health" />
    <h1>AI Session</h1>
    <div class="identity"><b>${esc(profile.name || "Patient")}</b>${identityBits ? `: ${identityBits}` : ""}</div>
    <div class="meta">${esc(session.title)} · started ${esc(fmtDay(session.createdAt))} · printed ${esc(now)} · reference set ${esc(CORPUS_VERSION)}</div>
    <hr class="rule" />
    ${segmentsHtml || "<p style='color:#777;font-style:italic'>No conversation content.</p>"}
    ${qHtml}
    <div class="footer">
      <span>${esc(SESSION_COPY.headerFooter)} Compiled by the patient from their own records using Insina Health.</span>
      <span>Generated ${esc(now)}</span>
    </div>
  </body></html>`;
}

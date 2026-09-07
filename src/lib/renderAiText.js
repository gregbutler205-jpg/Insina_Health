// ── AI Text Rendering — HTML escaping (S-02 / PG-02) ────────────────────────
// AI output can echo content that originated in uploaded documents (OCR'd PDFs
// etc). Rendering it via dangerouslySetInnerHTML or document.write without
// escaping first lets an embedded tag execute in the app's origin, which holds
// the full record, mi_ak, and the PIN hash. This is the ONLY place in the
// codebase permitted to turn AI-generated text into HTML — escape first, then
// apply the **bold** / ----- transforms. No other function may build HTML from
// AI output; route new AI-rendering surfaces through this module.
//
// AUDIT_SEC_02 F-03: applyBoldSafe is also the deterministic post-generation
// output filter's (aiOutputFilter.js) one true choke point — every
// AI-rendering surface (Tab05/Tab10/Tab11/Tab14, AnalysisOverlay) calls either
// this function directly or renderAiMarkdownToHtml below, which itself calls
// this function for every line/cell it renders. Scanning here means the CSC's
// "never give specific action guidance" rule has a deterministic backstop, not
// just a system-prompt instruction the model could ignore or be jailbroken
// past.
import { scanForProhibitedDirectives } from "./aiOutputFilter.js";

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escape the whole string FIRST, then convert **bold** markers to <strong>.
// Escaping before the bold transform means a literal "<" in AI text can never
// reach the DOM as a tag, regardless of where it sits relative to ** markers.
export function applyBoldSafe(text, strongStyle) {
  const { redactedText } = scanForProhibitedDirectives(text);
  const escaped = escapeHtml(redactedText);
  const styleAttr = strongStyle ? ` style="${strongStyle}"` : "";
  return escaped.replace(/\*\*(.*?)\*\*/g, (_, m) => `<strong${styleAttr}>${m}</strong>`);
}

export function stripAiEmojis(text) {
  return String(text ?? "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/\u{FE0F}/gu, "")
    .replace(/✦/g, "");
}

/**
 * Shared print/report HTML-string builder — turns AI markdown-ish text into a
 * safe HTML block for window.document.write() (print/share windows). Every
 * text-insertion point is escaped via applyBoldSafe/escapeHtml.
 */
export function renderAiMarkdownToHtml(rawText) {
  if (!rawText) return "";
  const text = stripAiEmojis(rawText);
  return text.split("\n").map(line => {
    const t = line.trim();
    if (/^-{3,}$/.test(t)) return `<hr style="border:none;border-top:1px solid #ddd;margin:14px 0">`;
    if (t.includes("|")) {
      if (/^\|?[\s\-|]+\|?$/.test(t)) return "";
      const cells = t.split("|").map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2)
        return `<div style="display:flex;gap:16px;margin-bottom:6px;padding-left:8px">
          <span style="font-weight:700;min-width:160px;flex-shrink:0">${applyBoldSafe(cells[0])}</span>
          <span>${applyBoldSafe(cells.slice(1).join(": "))}</span></div>`;
    }
    const hm = t.match(/^\*\*([^*]+?)\*\*:?\s*$/);
    if (hm) {
      // The only direct escapeHtml call in this file that bypasses
      // applyBoldSafe (headings have no ** left to re-bold) — scan explicitly
      // so this path isn't the one hole in the F-03 filter's coverage.
      const { redactedText } = scanForProhibitedDirectives(hm[1].replace(/:$/, ""));
      return `<div style="font-weight:700;font-size:15px;margin-top:16px;margin-bottom:6px">${escapeHtml(redactedText)}</div>`;
    }
    if (t.startsWith("- ") || t.startsWith("• ")) {
      const c = t.replace(/^[-•]\s+/, "");
      return `<div style="display:flex;gap:8px;margin-bottom:5px;padding-left:8px">
        <span style="color:#2563eb;flex-shrink:0;font-weight:700">&#9658;</span>
        <span>${applyBoldSafe(c)}</span></div>`;
    }
    const nm = t.match(/^(\d+)\.\s+(.+)/);
    if (nm) return `<div style="display:flex;gap:8px;margin-bottom:6px;padding-left:8px">
      <span style="font-weight:700;flex-shrink:0;min-width:22px;color:#2563eb">${nm[1]}.</span>
      <span>${applyBoldSafe(nm[2])}</span></div>`;
    if (t === "") return `<div style="height:8px"></div>`;
    return `<div style="margin-bottom:4px;line-height:1.75">${applyBoldSafe(line)}</div>`;
  }).join("");
}

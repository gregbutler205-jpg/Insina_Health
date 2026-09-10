// ── A-13 / UI-15: full-screen analysis report overlay ─────────────────────────
// Analysis outputs open here — an in-page modal, NOT window.open, so popup
// blockers and the mobile PWA are non-issues. Print goes through a print
// stylesheet scoped to this overlay (the branded header/footer render only in
// print); Save writes a My Notes entry with the explicit AI-generated label
// (DEC-022) and the analysis stays downloadable as dated markdown.
import { useState } from "react";
import { renderAiMarkdownToHtml } from "../lib/renderAiText.js";
import { saveAnalysisToNotes, downloadAnalysisMarkdown, getLastSyncStamp, ANALYSIS_FOOTER } from "../lib/analysisExport.js";
import { PrintLabel } from "./icons.jsx";
// AUDIT_SEC_02 F-03: the on-screen render already passes through the shared
// filter (renderAiMarkdownToHtml -> applyBoldSafe), but Save-to-Notes and
// Download-as-markdown both used the raw `content` prop directly — bypassing
// it entirely. Redacting ONCE here, and using that single value for the
// render, the saved note, and the downloaded file, guarantees the three can
// never disagree (a downloaded file carrying the raw directive the on-screen
// version had already redacted would be a worse leak than either alone).
import { scanForProhibitedDirectives } from "../lib/aiOutputFilter.js";
// DEC-046: right after a report is saved, offer to mark it for the doctors it
// concerns — the moment the marking decision is freshest.
import PrepMarkPicker from "./PrepMarkPicker.jsx";

const PRINT_LOGO = import.meta.env.BASE_URL + "logo.png";

export default function AnalysisOverlay({ title, content, mode = "standard", timestamp, onClose, savedNoteId = null }) {
  const [saved, setSaved] = useState(false);
  // The saved note's id — either passed in (Tab11's session report is already
  // in mi_notes when this overlay opens) or captured from our own Save.
  const [ownNoteId, setOwnNoteId] = useState(null);
  const markNoteId = savedNoteId || ownNoteId;
  const isAdvanced = mode === "advanced";
  const modeLabel = isAdvanced ? "Advanced Mode" : "Standard Mode";
  const dateLabel = (timestamp ? new Date(timestamp) : new Date())
    .toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const { redactedText: safeContent } = scanForProhibitedDirectives(content);

  const handleSave = () => {
    const note = saveAnalysisToNotes({ title, content: safeContent, mode });
    setOwnNoteId(note?.id ?? null);
    setSaved(true);
  };

  return (
    <div className="analysis-overlay" style={{ position: "fixed", inset: 0, zIndex: 9600, background: "#07090f", display: "flex", flexDirection: "column", fontFamily: "'Sora',sans-serif" }}>
      <style>{`
        .analysis-overlay .ao-body { color:#a8c4dc; font-size:13px; }
        .analysis-overlay .ao-print-header { display:none; }
        .analysis-overlay .ao-print-footer { display:none; }
        @media print {
          /* Scoped print: only the overlay's report area prints, branded light. */
          body * { visibility: hidden; }
          .analysis-overlay, .analysis-overlay * { visibility: visible; }
          .analysis-overlay { position: absolute !important; inset: 0 !important; background: #fff !important; overflow: visible !important; }
          .analysis-overlay .ao-chrome { display: none !important; }
          .analysis-overlay .ao-scroll { overflow: visible !important; padding: 0 !important; }
          .analysis-overlay .ao-report { max-width: 760px; margin: 36px auto; }
          .analysis-overlay .ao-body { color: #1a1a1a !important; font-size: 13px; font-family: Georgia, serif; }
          .analysis-overlay .ao-print-header { display: block; font-family: Georgia, serif; color: #1a1a1a; }
          .analysis-overlay .ao-print-header img { height: 48px; margin-bottom: 14px; }
          .analysis-overlay .ao-print-header h1 { font-size: 26px; font-weight: 700; margin-bottom: 4px; }
          .analysis-overlay .ao-print-header .ao-sub { font-size: 12px; color: #555; font-family: monospace; margin-bottom: 12px; }
          .analysis-overlay .ao-print-header .ao-rule { border: none; border-top: 2px solid #2563eb; margin-bottom: 20px; }
          .analysis-overlay .ao-print-footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 10px; font-size: 12px; color: #777; font-family: Georgia, serif; }
        }
      `}</style>

      {/* Screen chrome: header bar with actions (hidden in print) */}
      <div className="ao-chrome" style={{ height: 56, background: "#080c14", borderBottom: "1px solid #1c2a40", display: "flex", alignItems: "center", padding: "0 22px", gap: 12, flexShrink: 0 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: "#dde8f5", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <span style={{
          fontSize: 12, fontFamily: "'DM Mono',monospace", flexShrink: 0,
          background: isAdvanced ? "rgba(79,142,247,.12)" : "rgba(16,185,129,.10)",
          color: isAdvanced ? "#6ea3ff" : "#2dd4a0",
          border: `1px solid ${isAdvanced ? "rgba(79,142,247,.25)" : "rgba(16,185,129,.25)"}`,
          padding: "2px 8px", borderRadius: 4, letterSpacing: "0.4px", textTransform: "uppercase",
        }}>{modeLabel}</span>
        <span style={{ fontSize: 12, color: "#8299ad", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{dateLabel}</span>
        <button onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(79,142,247,.12)", border: "1px solid rgba(79,142,247,.3)", borderRadius: 8, color: "#7eb8d8", fontSize: 12, fontFamily: "'Sora',sans-serif", cursor: "pointer", flexShrink: 0 }}>
          <PrintLabel />
        </button>
        <button onClick={handleSave} disabled={saved}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: saved ? "rgba(16,185,129,.10)" : "rgba(16,185,129,.14)", border: "1px solid rgba(16,185,129,.35)", borderRadius: 8, color: "#2dd4a0", fontSize: 12, fontFamily: "'Sora',sans-serif", cursor: saved ? "default" : "pointer", flexShrink: 0 }}>
          {saved ? "✓ Saved to My Notes" : "Save to My Notes"}
        </button>
        <button onClick={() => downloadAnalysisMarkdown({ analysisType: title, content: safeContent, mode })}
          title="Download this analysis as a dated markdown file"
          style={{ padding: "7px 14px", background: "transparent", border: "1px solid #1a2f4a", borderRadius: 8, color: "#b0c4d8", fontSize: 12, fontFamily: "'Sora',sans-serif", cursor: "pointer", flexShrink: 0 }}>
          ↓ .md
        </button>
        <button onClick={onClose}
          style={{ padding: "7px 12px", background: "transparent", border: "1px solid #1a2f4a", borderRadius: 8, color: "#b0c4d8", fontSize: 14, cursor: "pointer", flexShrink: 0 }}>
          ✕
        </button>
      </div>

      {/* DEC-046: once the report exists in My Notes, offer prep marking.
          ao-chrome → hidden in print. */}
      {markNoteId && (
        <div className="ao-chrome" style={{ background: "#0a1018", borderBottom: "1px solid #1c2a40", padding: "9px 22px", flexShrink: 0 }}>
          <PrepMarkPicker noteId={markNoteId} reportText={safeContent} />
        </div>
      )}

      {/* Report body */}
      <div className="ao-scroll" style={{ flex: 1, overflowY: "auto", padding: "28px 0" }}>
        <div className="ao-report" style={{ maxWidth: 820, margin: "0 auto", padding: "0 32px" }}>
          {/* Branded header — print only */}
          <div className="ao-print-header">
            <img src={PRINT_LOGO} alt="Insina Health" />
            <h1>{title}</h1>
            <div className="ao-sub">{modeLabel} · Generated {dateLabel} · Record last synced: {getLastSyncStamp()}</div>
            <hr className="ao-rule" />
          </div>

          {/* AI text — rendered ONLY via the shared escaped renderer (S-02/PG-02),
              from the same filtered text used for save/export (F-03). */}
          <div className="ao-body" dangerouslySetInnerHTML={{ __html: renderAiMarkdownToHtml(safeContent) }} />

          {/* Screen footer note */}
          <div className="ao-chrome" style={{ marginTop: 28, paddingTop: 12, borderTop: "1px solid #1c2a40", fontSize: 12, color: "#8299ad", fontFamily: "'DM Mono',monospace", lineHeight: 1.6 }}>
            {ANALYSIS_FOOTER} · Record last synced: {getLastSyncStamp()}
          </div>

          {/* Branded footer — print only */}
          <div className="ao-print-footer">
            <span>{ANALYSIS_FOOTER}</span>
            <span>Insina Health</span>
          </div>
        </div>
      </div>
    </div>
  );
}

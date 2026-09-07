// ── RIE · Preflight modal host ───────────────────────────────────────────────
// Mounted once at the App root. Listens for "rie-preflight" events raised by
// requestReport(), shows a 3-section modal (Critical / Warning / Suggested
// Cleanup), and runs the held generate function on Fix-and-continue or
// Override-and-continue.
import { useState, useEffect, useCallback } from "react";
import { runPreflight, REPORT_LABELS } from "./preflightChecks.js";
import { applyFix, applySafeFixes, logOverride } from "./engine.js";
import { dismissPermanently, ignoreThisSession } from "./reviewQueue.js";

const SEV = {
  critical: { label: "Critical", color: "#ef4444", bg: "rgba(239,68,68,.10)", bd: "rgba(239,68,68,.30)" },
  warning:  { label: "Warning",  color: "#f59e0b", bg: "rgba(245,158,11,.10)", bd: "rgba(245,158,11,.30)" },
  info:     { label: "Info",     color: "#4f8ef7", bg: "rgba(79,142,247,.10)", bd: "rgba(79,142,247,.28)" },
};
const mono = "'DM Mono',monospace";

export default function PreflightHost({ onNavChange }) {
  const [ctx, setCtx] = useState(null);     // { reportType, generateFn }
  const [findings, setFindings] = useState([]);

  const rescan = useCallback((reportType) => setFindings(runPreflight(reportType)), []);

  useEffect(() => {
    const h = (e) => { const { reportType, generateFn } = e.detail || {}; setCtx({ reportType, generateFn }); setFindings(runPreflight(reportType)); };
    window.addEventListener("rie-preflight", h);
    return () => window.removeEventListener("rie-preflight", h);
  }, []);

  if (!ctx) return null;

  const crit = findings.filter(f => f.severity === "critical");
  const warn = findings.filter(f => f.severity === "warning");
  const info = findings.filter(f => f.severity === "info");
  const safeFixable = findings.filter(f => f.severity !== "critical" && f.fix && f.fix.safeBatch !== false && !(f.module === "medications" && f.fix.field === "name")).length;

  const close = () => setCtx(null);
  const proceed = () => {
    if (crit.length) logOverride(ctx.reportType, crit);
    const gen = ctx.generateFn; close();
    setTimeout(() => gen?.(), 60); // let the modal unmount before opening the print window
  };
  const fix = (f) => {
    if (f.fix) { applyFix(f); rescan(ctx.reportType); }
    else { onNavChange?.(f.module); close(); }
  };

  const Section = ({ title, list, color }) => list.length === 0 ? null : (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontFamily: mono, letterSpacing: "1px", textTransform: "uppercase", color, marginBottom: 8 }}>{title}</div>
      {list.map(f => {
        const sv = SEV[f.severity];
        return (
          <div key={f.id} style={{ background: "#0b1220", border: `1px solid ${sv.bd}`, borderLeft: `3px solid ${sv.color}`, borderRadius: 9, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "#c4d8ee", lineHeight: 1.5 }}>{f.message}</div>
            {f.suggestion && (
              <div style={{ marginTop: 5, fontSize: 12, fontFamily: mono, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#f87171", textDecoration: "line-through" }}>{f.original}</span>
                <span style={{ color: "#6a8090" }}>→</span><span style={{ color: "#2dd4a0" }}>{f.suggestion}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={() => fix(f)} style={btn("#6ea3ff")}>{f.fix ? "Fix Now" : "Go fix it"}</button>
              <button onClick={() => { ignoreThisSession(f); rescan(ctx.reportType); }} style={btn("#98afc4")}>Ignore This Time</button>
              <button onClick={() => { dismissPermanently(f); rescan(ctx.reportType); }} style={btn("#6b7a8d")}>Dismiss</button>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#07090f", border: "1px solid #1a2f4a", borderRadius: 16, width: 560, maxWidth: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", fontFamily: "'Sora',sans-serif" }}>
        <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #1c2a40", flexShrink: 0 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: "#dde8f5" }}>Before generating: {REPORT_LABELS[ctx.reportType] || "Report"}</div>
          <div style={{ fontSize: 12, color: "#98afc4", fontFamily: mono, marginTop: 4 }}>
            {crit.length > 0 ? `${crit.length} issue(s) should be resolved or overridden before sharing.` : "A few items to review. None block this report."}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          <Section title="Critical: resolve or override" list={crit} color={SEV.critical.color} />
          <Section title="Warnings" list={warn} color={SEV.warning.color} />
          {info.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              {safeFixable > 0 && (
                <button onClick={() => { applySafeFixes(findings); rescan(ctx.reportType); }}
                  style={{ width: "100%", padding: "7px 0", marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#2dd4a0", background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 7, cursor: "pointer" }}>
                  Apply {safeFixable} safe fix{safeFixable > 1 ? "es" : ""}
                </button>
              )}
              <Section title="Suggested cleanup" list={info} color={SEV.info.color} />
            </div>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid #1c2a40", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
          <button onClick={close} style={{ padding: "9px 18px", background: "transparent", border: "1px solid #1a2f4a", borderRadius: 9, color: "#b0c4d8", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={proceed}
            style={{ padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: crit.length ? "rgba(245,158,11,.15)" : "rgba(16,185,129,.15)",
              border: `1px solid ${crit.length ? "rgba(245,158,11,.45)" : "rgba(16,185,129,.45)"}`,
              color: crit.length ? "#f59e0b" : "#2dd4a0" }}>
            {crit.length ? "Override & Generate" : "Generate Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

function btn(color) {
  return { fontSize: 12, color, background: "transparent", border: `1px solid ${color}55`, borderRadius: 6, padding: "5px 11px", cursor: "pointer", fontFamily: "'Sora',sans-serif" };
}

// ── RIE · Review Queue UI ────────────────────────────────────────────────────
// A root-level widget: a floating button with a Critical+Warning count badge,
// and an overlay listing all active findings with per-item actions.
import { useState, useEffect, useCallback } from "react";
import { runFullScan, counts, applyFix, applySafeFixes } from "./engine.js";
import { dismissPermanently, ignoreThisSession } from "./reviewQueue.js";

const SEV = {
  critical: { label: "Critical", color: "#ef4444", bg: "rgba(239,68,68,.10)", bd: "rgba(239,68,68,.30)" },
  warning:  { label: "Warning",  color: "#f59e0b", bg: "rgba(245,158,11,.10)", bd: "rgba(245,158,11,.30)" },
  info:     { label: "Info",     color: "#4f8ef7", bg: "rgba(79,142,247,.10)", bd: "rgba(79,142,247,.28)" },
};
const mono = "'DM Mono',monospace";

export default function RIEWidget({ onNavChange }) {
  const [findings, setFindings] = useState([]);
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  const rescan = useCallback(() => {
    setScanning(true);
    // let the spinner paint, then scan (synchronous but can be heavy)
    setTimeout(() => { setFindings(runFullScan()); setScanning(false); }, 10);
  }, []);

  useEffect(() => {
    rescan();
    const h = () => setFindings(runFullScan());
    window.addEventListener("mi_rie_changed", h);
    window.addEventListener("mi-data-synced", h);
    return () => { window.removeEventListener("mi_rie_changed", h); window.removeEventListener("mi-data-synced", h); };
  }, [rescan]);

  const c = counts(findings);
  const badge = c.critical + c.warning;
  const dotColor = c.critical ? SEV.critical.color : c.warning ? SEV.warning.color : SEV.info.color;
  const safeFixable = findings.filter(f => f.severity !== "critical" && f.fix && f.fix.safeBatch !== false && !(f.module === "medications" && f.fix.field === "name")).length;

  const doFix = (f) => {
    if (f.fix) { applyFix(f); setFindings(runFullScan()); }
    else { onNavChange?.(f.module); setOpen(false); }
  };

  return (
    <>
      {/* Floating trigger */}
      <button onClick={() => setOpen(o => !o)} title="Record Integrity: Review Queue"
        style={{ position: "fixed", right: 18, bottom: 18, zIndex: 1400, width: 48, height: 48, borderRadius: "50%",
          background: "#0b1220", border: `1px solid ${dotColor}`, color: dotColor, cursor: "pointer",
          boxShadow: `0 0 14px ${dotColor}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>
        ⛨
        {badge > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: dotColor, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: mono, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{badge}</span>
        )}
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1401, display: "flex", justifyContent: "flex-end" }} onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: "100%", height: "100%", background: "#07090f", borderLeft: "1px solid #1a2f4a", display: "flex", flexDirection: "column", fontFamily: "'Sora',sans-serif" }}>
            {/* Header */}
            <div style={{ padding: "16px 18px", borderBottom: "1px solid #1c2a40", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 19, color: "#dde8f5" }}>Record Integrity</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#7eb8d8", fontSize: 18, cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {["critical", "warning", "info"].map(s => (
                  <span key={s} style={{ fontSize: 12, fontFamily: mono, color: SEV[s].color, background: SEV[s].bg, border: `1px solid ${SEV[s].bd}`, borderRadius: 5, padding: "2px 8px" }}>{c[s]} {SEV[s].label}</span>
                ))}
                <span style={{ flex: 1 }} />
                <button onClick={rescan} disabled={scanning} style={{ fontSize: 12, fontFamily: mono, color: "#7eb8d8", background: "rgba(79,142,247,.10)", border: "1px solid rgba(79,142,247,.3)", borderRadius: 6, padding: "4px 9px", cursor: "pointer" }}>{scanning ? "Scanning…" : "↻ Re-scan"}</button>
              </div>
              {safeFixable > 0 && (
                <button onClick={() => { applySafeFixes(findings); setFindings(runFullScan()); }}
                  style={{ marginTop: 10, width: "100%", padding: "7px 0", fontSize: 12, fontFamily: "'Sora',sans-serif", fontWeight: 600, color: "#2dd4a0", background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 7, cursor: "pointer" }}>
                  Apply {safeFixable} safe fix{safeFixable > 1 ? "es" : ""} (excludes medication names &amp; critical)
                </button>
              )}
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
              {findings.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "#98afc4" }}>
                  <div style={{ fontSize: 30, color: "#2dd4a0", marginBottom: 10 }}>✓</div>
                  <div style={{ fontSize: 13 }}>No integrity issues found.</div>
                  <div style={{ fontSize: 12, color: "#8299ad", fontFamily: mono, marginTop: 6 }}>Your record looks clean.</div>
                </div>
              )}
              {findings.map(f => {
                const sv = SEV[f.severity];
                return (
                  <div key={f.id} style={{ background: "#0b1220", border: `1px solid ${sv.bd}`, borderLeft: `3px solid ${sv.color}`, borderRadius: 9, padding: "11px 13px", marginBottom: 9 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontFamily: mono, color: sv.color, background: sv.bg, border: `1px solid ${sv.bd}`, borderRadius: 4, padding: "1px 6px", textTransform: "uppercase", letterSpacing: ".5px" }}>{sv.label}</span>
                      <span style={{ fontSize: 12, color: "#8299ad", fontFamily: mono, textTransform: "uppercase" }}>{f.module}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#c4d8ee", lineHeight: 1.5 }}>{f.message}</div>
                    {f.suggestion && (
                      <div style={{ marginTop: 6, fontSize: 12, fontFamily: mono, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "#f87171", textDecoration: "line-through" }}>{f.original}</span>
                        <span style={{ color: "#8299ad" }}>→</span>
                        <span style={{ color: "#2dd4a0" }}>{f.suggestion}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                      <button onClick={() => doFix(f)} style={btn("#6ea3ff")}>{f.fix ? "Fix Now" : "Go to field"}</button>
                      <button onClick={() => { ignoreThisSession(f); setFindings(runFullScan()); }} style={btn("#98afc4")}>Ignore This Time</button>
                      <button onClick={() => { dismissPermanently(f); setFindings(runFullScan()); }} style={btn("#6b7a8d")}>Dismiss</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "8px 14px", borderTop: "1px solid #1c2a40", fontSize: 12, color: "#8299ad", fontFamily: mono, textAlign: "center", flexShrink: 0 }}>
              Flags issues for your review · never changes data without confirmation
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function btn(color) {
  return { fontSize: 12, fontFamily: "'Sora',sans-serif", color, background: "transparent", border: `1px solid ${color}55`, borderRadius: 6, padding: "5px 11px", cursor: "pointer" };
}

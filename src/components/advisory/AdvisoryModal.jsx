// ── DEC-PNN pending: tripwire advisory — takeover + Emergency Info UI (§4/§5) ─
// One instance mounts at the app root. It listens for the "insina-advisory"
// window event and renders one of three modes:
//   · emergency — full-screen takeover, danger styling, 911 primary & largest
//   · today     — modal, warning styling, coordinator-call primary, inline 911
//   · info      — manual Emergency Info (no triggering value), incl. Emergency Card
// Dismiss ("I understand") logs the dismissal. No snooze, no suppress-future.
// Buttons are plain tel:/maps links — no geolocation call is made from Insina.

import { useEffect, useState } from "react";
import { markAdvisoryDismissed, markAdvisoryVerified, markAdvisoryRejected, markCareTeamContacted } from "../../lib/advisoryLog.js";
import { printEmergency } from "../../lib/printEmergency.js";

function edDirectionsUrl() {
  const ua = `${navigator.userAgent || ""} ${navigator.platform || ""}`;
  const apple = /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua);
  // Maps app resolves the user's location under its own permissions.
  return apple ? "https://maps.apple.com/?q=Emergency+Room" : "https://www.google.com/maps/search/emergency+room/";
}
const telHref = (p) => `tel:${String(p || "").replace(/[^\d+]/g, "")}`;

/** Render a paragraph, turning a "call 911" / "Call 911" phrase into a tel link (TODAY inline 911). */
function withInline911(text, keyBase) {
  const parts = text.split(/(call 911)/i);
  return parts.map((seg, i) =>
    /^call 911$/i.test(seg)
      ? <a key={`${keyBase}-${i}`} href="tel:911" style={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}>{seg}</a>
      : <span key={`${keyBase}-${i}`}>{seg}</span>
  );
}

export default function AdvisoryModal() {
  const [p, setP] = useState(null);
  // DEC-043 item 3: staged values must be verified against the original
  // document BEFORE the advisory workflow renders. Manual values skip this.
  const [verified, setVerified] = useState(false);
  // DEC-043 item 6: optional, self-reported — separate from dismissal.
  const [contacted, setContacted] = useState(false);

  useEffect(() => {
    const h = (e) => { setP(e.detail || null); setVerified(false); setContacted(false); };
    window.addEventListener("insina-advisory", h);
    return () => window.removeEventListener("insina-advisory", h);
  }, []);

  useEffect(() => {
    if (!p) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return null;

  const close = () => { if (p.eventId) markAdvisoryDismissed(p.eventId); setP(null); };
  const mode = p.mode; // "emergency" | "today" | "info"
  const coord = p.coordinator;
  const isEmergency = mode === "emergency";
  // Verify-first (DEC-043 item 3): an in-window staged hit renders the
  // verification prompt until the patient confirms the imported number.
  const needsVerify = !!p.requiresVerification && !verified && mode !== "info";
  const accent = isEmergency ? "var(--red)" : mode === "today" ? "var(--amber)" : "var(--red)";
  const label = needsVerify
    ? "VERIFY IMPORTED VALUE"
    : isEmergency ? "EMERGENCY" : mode === "today" ? "URGENT: CONTACT TODAY" : "EMERGENCY INFO";

  const confirmVerify = () => { if (p.eventId) markAdvisoryVerified(p.eventId); setVerified(true); };
  const rejectVerify = () => { if (p.eventId) markAdvisoryRejected(p.eventId); setP(null); };
  const reportContacted = () => { if (p.eventId) markCareTeamContacted(p.eventId); setContacted(true); };

  const openED = () => window.open(edDirectionsUrl(), "_blank", "noopener,noreferrer");

  const btnBase = { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", borderRadius: 12, fontFamily: "var(--font-sans)", fontWeight: 700, cursor: "pointer", border: "1px solid transparent", textDecoration: "none", boxSizing: "border-box" };
  const btn911 = { ...btnBase, background: "#ef4444", color: "#fff", minHeight: isEmergency ? 68 : 52, fontSize: isEmergency ? 22 : 16 };
  const btnPrimary = { ...btnBase, background: accent, color: "#fff", minHeight: 56, fontSize: 17 };
  const btnSecondary = { ...btnBase, background: "var(--card)", color: "var(--text-bright)", border: "1px solid var(--border-strong)", minHeight: 52, fontSize: 15 };

  const overlay = {
    position: "fixed", inset: 0, zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center",
    padding: 20, background: isEmergency ? "rgba(4,6,12,0.92)" : "rgba(4,6,12,0.7)",
  };
  const panel = {
    width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto",
    background: "var(--bg-deep, #0b1220)", border: `1px solid ${accent}`, borderRadius: 18,
    boxShadow: "0 24px 80px rgba(0,0,0,.6)", display: "flex", flexDirection: "column",
  };

  return (
    <div style={overlay} role="alertdialog" aria-modal="true" aria-label={label}>
      <div style={panel}>
        {/* Header band */}
        <div style={{ background: accent, color: "#fff", padding: "12px 20px", borderRadius: "17px 17px 0 0", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "2px", display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ fontSize: 16 }}>⚠</span> {label}
        </div>

        {needsVerify ? (
          /* DEC-043 item 3 — verify-first for staged/imported values: an
             OCR-extracted number can be wrong (decimal placement, unit
             conversion, column alignment). The standard workflow fires only
             after the patient confirms the number against the original. */
          <div style={{ padding: "20px 22px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--text-bright)" }}>{p.verifyText}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={confirmVerify} style={btnPrimary}>The value is correct</button>
              <button onClick={rejectVerify} style={btnSecondary}>The value is wrong: I'll fix it in Import Review</button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Confirming opens the full alert with emergency contacts and next steps.
            </p>
          </div>
        ) : (
        <div style={{ padding: "20px 22px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Advisory text (emergency/today) */}
          {p.advisory?.paragraphs?.map((para, i) => (
            <p key={i} style={{ fontSize: 15, lineHeight: 1.65, color: "var(--text-bright)" }}>
              {mode === "today" ? withInline911(para, `pt${i}`) : para}
            </p>
          ))}
          {/* DEC-043 item 5: source + verification context, small and factual */}
          {mode !== "info" && p.advisory?.metaLine && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginTop: -6 }}>{p.advisory.metaLine}</p>
          )}
          {mode === "info" && (
            <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--text-secondary)" }}>
              Your emergency actions and card, in one place.
            </p>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(isEmergency || mode === "info") && (
              <a href="tel:911" style={btn911}>Call 911</a>
            )}
            {(isEmergency || mode === "info") && (
              <button onClick={openED} style={btnSecondary}>Directions to nearest ED</button>
            )}
            {mode === "today" && coord && (
              <a href={telHref(coord.phone)} style={btnPrimary}>Call {coord.name}</a>
            )}
            {(isEmergency || mode === "info") && coord && (
              <a href={telHref(coord.phone)} style={btnSecondary}>Call {coord.name}</a>
            )}
            {mode === "today" && (
              <a href="tel:911" style={{ ...btnSecondary, fontSize: 14 }}>Call 911</a>
            )}
            {mode === "info" && (
              <button onClick={() => printEmergency()} style={btnSecondary}>View Emergency Card</button>
            )}
          </div>

          {/* No-coordinator secondary line (§3) */}
          {p.advisory?.secondaryLine && (
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>{p.advisory.secondaryLine}</p>
          )}

          {/* DEC-043 item 6: optional, self-reported, separate from dismissal.
              User-reported only — Insina never verifies contact happened. */}
          {mode !== "info" && (
            contacted ? (
              <p style={{ alignSelf: "center", fontSize: 12, color: "var(--green, #2dd4a0)", fontFamily: "var(--font-mono)" }}>
                ✓ Care team contacted (self-reported)
              </p>
            ) : (
              <button onClick={reportContacted} style={{ alignSelf: "center", background: "none", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)", padding: "7px 14px", minHeight: 36 }}>
                Mark care team contacted: self-reported
              </button>
            )
          )}

          {/* Dismiss — understated, logs, no snooze. Dismissal means only that
              the warning was closed — never that anyone was contacted. */}
          <button onClick={close} style={{ alignSelf: "center", marginTop: 2, background: "none", border: "none", color: "var(--text-dim)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-sans)", textDecoration: "underline", minHeight: 36 }}>
            {mode === "info" ? "Close" : "I understand"}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

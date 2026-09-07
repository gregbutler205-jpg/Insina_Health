// ── Phase 2: Quick Start Basics — Tier 0 (ONBOARDING_SPEC v1.1 §3.2) ─────────
// Name + DOB required before any report generates (v1.1 errata). Transplant
// context feeds the Emergency Card. Coordinator feeds the record's escalation
// contacts (mi_emergency_contacts) and Care Team. Skipping turns the Tier 0
// fields into §7 tasks (T6).

import { useMemo, useState } from "react";
import CENTERS from "../../data/transplantCenters.json";
import { toE164US, maskUSPhone, validateTransplantDate, validateDob } from "../../lib/onboardingState.js";

const ORGANS = ["Liver", "Kidney", "Heart", "Lung", "Pancreas", "Multi-organ", "Other"];

const lbl = { display: "block", fontSize: 12, color: "var(--text-label)", fontFamily: "var(--font-mono)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6 };
const inp = { width: "100%", minHeight: "var(--touch-target)", background: "var(--bg-deep)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 14, outline: "none", colorScheme: "var(--scheme)" };
const errStyle = { fontSize: 12, color: "var(--red)", marginTop: 5 };
const warnStyle = { fontSize: 12, color: "var(--amber)", marginTop: 5 };

// Writes the patient-typed Tier 0 identity into the record. Manual entry is
// pre-confirmed (§3.7 principle) — the patient typed it, no staging round-trip.
function writeTier0ToRecord(t) {
  try {
    const p = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}");
    if (t.name) p.name = t.name;
    if (t.dob) p.dob = t.dob;
    p.updatedAt = Date.now(); // DEC-047: keep the object's merge stamp intact
    localStorage.setItem("mi_profile_personal", JSON.stringify(p));
  } catch { /* locked: unreachable post-unlock, fail quiet */ }

  if (t.coordinator_name) {
    const ROLE = "Transplant Coordinator";
    try {
      const team = JSON.parse(localStorage.getItem("mi_care_team") || "[]");
      const existing = team.find(m => m.role === ROLE);
      if (existing) { existing.name = t.coordinator_name; if (t.coordinator_phone) existing.phone = t.coordinator_phone; }
      else team.push({ id: Date.now(), name: t.coordinator_name, role: ROLE, specialty: ROLE, phone: t.coordinator_phone || "" });
      localStorage.setItem("mi_care_team", JSON.stringify(team));
    } catch { /* fail quiet */ }
    try {
      const contacts = JSON.parse(localStorage.getItem("mi_emergency_contacts") || "[]");
      const existing = contacts.find(c => c.relationship === ROLE);
      if (existing) { existing.name = t.coordinator_name; if (t.coordinator_phone) existing.phone = t.coordinator_phone; }
      else contacts.push({ name: t.coordinator_name, relationship: ROLE, phone: t.coordinator_phone || "" });
      localStorage.setItem("mi_emergency_contacts", JSON.stringify(contacts));
    } catch { /* fail quiet */ }
  }
}

export default function Phase2Basics({ initialTier0, onContinue, onSkip }) {
  const [f, setF] = useState({
    name: "", dob: "", organ: "", tx_date: "", center: "",
    coordinator_name: "", coordinator_phone: "",
    ...(initialTier0 || {}),
  });
  const [errors, setErrors] = useState({});
  const [centerOpen, setCenterOpen] = useState(false);
  // Editing a field clears its error immediately (UI-29 spirit: errors never
  // outlive the input they described — a stale error would also mask the
  // live >50-years warning on the transplant date).
  const set = (k, v) => {
    setF(prev => ({ ...prev, [k]: v }));
    setErrors(prev => { if (!(k in prev)) return prev; const n = { ...prev }; delete n[k]; return n; });
  };

  const centerMatches = useMemo(() => {
    const q = f.center.trim().toLowerCase();
    if (q.length < 2) return [];
    return CENTERS.filter(c =>
      c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q) || c.state.toLowerCase() === q
    ).slice(0, 8);
  }, [f.center]);

  const txCheck = validateTransplantDate(f.tx_date);

  function handleContinue() {
    const errs = {};
    if (!f.name.trim()) errs.name = "Your name is required.";
    const dobCheck = validateDob(f.dob);
    if (!dobCheck.ok) errs.dob = dobCheck.error;
    if (!txCheck.ok) errs.tx_date = txCheck.error;
    if (f.coordinator_phone && !toE164US(f.coordinator_phone)) errs.coordinator_phone = "Enter a 10-digit US phone number.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const tier0 = {
      name: f.name.trim(),
      dob: f.dob,
      organ: f.organ || null,
      tx_date: f.tx_date || null,
      center: f.center.trim() || null,
      coordinator_name: f.coordinator_name.trim() || null,
      coordinator_phone: f.coordinator_phone ? toE164US(f.coordinator_phone) : null,
    };
    writeTier0ToRecord(tier0);
    onContinue(tier0);
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 400, color: "var(--text-bright)", letterSpacing: "-0.5px" }}>
          Quick start basics
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
          A few details every report needs. Two minutes, tops.
        </p>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={lbl} htmlFor="ob-name">Your name *</label>
          <input id="ob-name" style={inp} value={f.name} onChange={e => set("name", e.target.value)} autoComplete="name" />
          {errors.name && <div style={errStyle}>{errors.name}</div>}
        </div>

        <div>
          <label style={lbl} htmlFor="ob-dob">Date of birth *</label>
          <input id="ob-dob" type="date" style={inp} value={f.dob} onChange={e => set("dob", e.target.value)} />
          {errors.dob && <div style={errStyle}>{errors.dob}</div>}
        </div>

        <div>
          <label style={lbl} htmlFor="ob-organ">Organ transplanted</label>
          <select id="ob-organ" style={inp} value={f.organ} onChange={e => set("organ", e.target.value)}>
            <option value="">Select…</option>
            {ORGANS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div>
          <label style={lbl} htmlFor="ob-txdate">Transplant date</label>
          <input id="ob-txdate" type="date" style={inp} value={f.tx_date} onChange={e => set("tx_date", e.target.value)} />
          {errors.tx_date && <div style={errStyle}>{errors.tx_date}</div>}
          {!errors.tx_date && txCheck.warn && <div style={warnStyle}>{txCheck.warn}</div>}
        </div>

        <div style={{ position: "relative" }}>
          <label style={lbl} htmlFor="ob-center">Transplant center</label>
          <input
            id="ob-center" style={inp} value={f.center}
            onChange={e => { set("center", e.target.value); setCenterOpen(true); }}
            onFocus={() => setCenterOpen(true)}
            onBlur={() => setTimeout(() => setCenterOpen(false), 150)}
            placeholder="Start typing. Or enter any name"
            role="combobox" aria-expanded={centerOpen && centerMatches.length > 0} aria-autocomplete="list"
          />
          {centerOpen && centerMatches.length > 0 && (
            <div role="listbox" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 40, background: "var(--card)", border: "1px solid var(--border-strong)", borderRadius: 10, marginTop: 4, maxHeight: 220, overflowY: "auto", boxShadow: "0 12px 32px rgba(0,0,0,.5)" }}>
              {centerMatches.map(c => (
                <div
                  key={`${c.name}-${c.city}`}
                  role="option" aria-selected="false"
                  onMouseDown={() => { set("center", c.name); setCenterOpen(false); }}
                  style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--divider)", fontSize: 13, color: "var(--text-primary)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--accent-tint)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {c.name} <span style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>· {c.city}, {c.state}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label style={lbl} htmlFor="ob-coord">Transplant coordinator <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
          <input id="ob-coord" style={inp} value={f.coordinator_name} onChange={e => set("coordinator_name", e.target.value)} />
        </div>

        <div style={{ gridColumn: "1/-1" }}>
          <label style={lbl} htmlFor="ob-coordphone">Coordinator phone <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
          <input
            id="ob-coordphone" style={{ ...inp, maxWidth: 260 }} inputMode="tel" autoComplete="tel"
            value={f.coordinator_phone} placeholder="(555) 555-1234"
            onChange={e => set("coordinator_phone", maskUSPhone(e.target.value))}
          />
          {errors.coordinator_phone && <div style={errStyle}>{errors.coordinator_phone}</div>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button
          onClick={onSkip}
          style={{ minHeight: "var(--touch-target)", padding: "10px 20px", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 10, color: "var(--text-secondary)", fontFamily: "var(--font-sans)", fontSize: 13, cursor: "pointer" }}
        >
          Skip for now
        </button>
        <button
          onClick={handleContinue}
          style={{ minHeight: "var(--touch-target)", padding: "10px 36px", background: "var(--btn-p-bg)", border: "1px solid var(--btn-p-bd)", borderRadius: 10, color: "var(--btn-p-fg)", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

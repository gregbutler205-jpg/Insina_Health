// ── Guided manual medication entry — Tier 1 (ONBOARDING_SPEC v1.1 §3.7) ─────
// Search-first entry against the bundled drug list (no network — privacy +
// offline). Manually entered meds and allergies are PRE-CONFIRMED: the
// patient typed them, so they write straight to the record with no staging
// round-trip. Unknown drug names are allowed as free text and flagged
// `unverifiedName` for the §7 task engine (T8).

import { useMemo, useState } from "react";
import DRUGS from "../../data/drugList.js";
import ALLERGENS from "../../data/allergenList.json";
import { getMedsFull, setMedsFull } from "../../store.js";
import { evaluateAndFire, clearNkdaAssertion, assertNoKnownAllergies, hasNkdaAssertion } from "../../lib/artifactEngine.js";

const FREQUENCIES = [
  ["QD", "Once daily"], ["BID", "Twice daily"], ["TID", "Three times daily"],
  ["QID", "Four times daily"], ["PRN", "As needed"], ["weekly", "Weekly"], ["custom", "Custom…"],
];

const lbl = { display: "block", fontSize: 12, color: "var(--text-label)", fontFamily: "var(--font-mono)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6 };
const inp = { width: "100%", minHeight: "var(--touch-target)", background: "var(--bg-deep)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 14, outline: "none", colorScheme: "var(--scheme)" };
const primaryBtn = { minHeight: "var(--touch-target)", padding: "10px 28px", background: "var(--btn-p-bg)", border: "1px solid var(--btn-p-bd)", borderRadius: 10, color: "var(--btn-p-fg)", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const ghostBtn = { minHeight: "var(--touch-target)", padding: "10px 20px", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 10, color: "var(--text-secondary)", fontFamily: "var(--font-sans)", fontSize: 13, cursor: "pointer" };

const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

function careTeamNames() {
  try { return JSON.parse(localStorage.getItem("mi_care_team") || "[]").map(m => m.name).filter(Boolean); } catch { return []; }
}

export default function ManualEntry({ onDone, onCancel }) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(null); // { name, brand, strengths, unverified, strength, doseAmount, freqCode, customFreq, prescriber }
  const [meds, setMeds] = useState([]);
  const [allergyQuery, setAllergyQuery] = useState("");
  const [allergyReaction, setAllergyReaction] = useState("");
  const [allergies, setAllergies] = useState([]);
  const [saved, setSaved] = useState(false);
  const [, tick] = useState(0); // re-render after the NKDA assertion writes

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return DRUGS.filter(d => d.name.toLowerCase().includes(q) || d.brand.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  const allergenMatches = useMemo(() => {
    const q = allergyQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return ALLERGENS.filter(a => a.toLowerCase().includes(q)).slice(0, 8);
  }, [allergyQuery]);

  const startDraft = (drug, unverified = false) => {
    setDraft({
      name: drug.name, brand: drug.brand || "", strengths: drug.strengths || [],
      unverified, strength: "", doseAmount: "", freqCode: "QD", customFreq: "", prescriber: "",
    });
    setQuery("");
  };

  const addDraft = () => {
    if (!draft) return;
    const freqLabel = draft.freqCode === "custom"
      ? (draft.customFreq.trim() || "Custom")
      : FREQUENCIES.find(([c]) => c === draft.freqCode)[1];
    setMeds(m => [...m, {
      name: cap(draft.name),
      brand: draft.brand.split(" / ")[0] || "",
      strength: draft.strength === "__other" ? "" : draft.strength,
      dose: draft.doseAmount.trim() || (draft.strength !== "__other" ? draft.strength : ""),
      frequency: freqLabel,
      prescriber: draft.prescriber.trim(),
      unverifiedName: draft.unverified,
    }]);
    setDraft(null);
  };

  const addAllergy = (name) => {
    const n = (name || allergyQuery).trim();
    if (!n) return;
    setAllergies(a => [...a, { name: n, reaction: allergyReaction.trim() }]);
    setAllergyQuery(""); setAllergyReaction("");
  };

  // Pre-confirmed writes — the only WP2 path that touches the record (§3.7).
  const save = () => {
    if (meds.length) {
      const existing = getMedsFull();
      const now = new Date().toISOString();
      const withIds = meds.map((m, i) => ({
        id: Date.now() + i,
        name: m.name, brand: m.brand, dose: m.dose, frequency: m.frequency,
        prescriber: m.prescriber, status: "active", category: "Other",
        source: "Entered manually", addedAt: now,
        ...(m.unverifiedName ? { unverifiedName: true } : {}),
      }));
      setMedsFull([...existing, ...withIds]);
    }
    if (allergies.length) {
      try {
        const existing = JSON.parse(localStorage.getItem("mi_allergies") || "[]");
        const withIds = allergies.map((a, i) => ({ id: Date.now() + 1000 + i, name: a.name, reaction: a.reaction }));
        localStorage.setItem("mi_allergies", JSON.stringify([...existing, ...withIds]));
        clearNkdaAssertion(); // a real allergy supersedes any NKDA assertion
      } catch { /* locked: unreachable post-unlock */ }
    }
    // §6 (C5): pre-confirmed writes count toward the goal minimum immediately.
    evaluateAndFire();
    setSaved(true);
    onDone({ medCount: meds.length, allergyCount: allergies.length });
  };

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 400, color: "var(--text-bright)", letterSpacing: "-0.5px" }}>
          Enter your medications
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
          Type a few letters and pick from the list: about ten minutes, and it unlocks your first report.
        </p>
      </div>

      {/* Med search */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
        {!draft && (
          <div style={{ position: "relative" }}>
            <label style={lbl} htmlFor="me-search">Medication name</label>
            <input id="me-search" style={inp} value={query} onChange={e => setQuery(e.target.value)}
              placeholder="e.g. tac → Tacrolimus" autoComplete="off" />
            {matches.length > 0 && (
              <div role="listbox" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 40, background: "var(--card)", border: "1px solid var(--border-strong)", borderRadius: 10, marginTop: 4, maxHeight: 260, overflowY: "auto", boxShadow: "0 12px 32px rgba(0,0,0,.5)" }}>
                {matches.map(d => (
                  <div key={d.name} role="option" aria-selected="false"
                    onMouseDown={() => startDraft(d)}
                    style={{ padding: "11px 14px", cursor: "pointer", borderBottom: "1px solid var(--divider)", fontSize: 14, color: "var(--text-primary)", minHeight: "var(--touch-target)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--accent-tint)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {cap(d.name)} <span style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>· {d.brand}</span>
                  </div>
                ))}
              </div>
            )}
            {query.trim().length >= 2 && (
              <button onClick={() => startDraft({ name: query.trim(), brand: "", strengths: [] }, true)}
                style={{ ...ghostBtn, marginTop: 10, fontSize: 12 }}>
                Not in the list? Add “{query.trim()}” as typed
              </button>
            )}
          </div>
        )}

        {draft && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1/-1", fontSize: 15, color: "var(--text-bright)", fontWeight: 600 }}>
              {cap(draft.name)}
              {draft.brand && <span style={{ color: "var(--text-dim)", fontWeight: 400, fontSize: 12, fontFamily: "var(--font-mono)" }}> · {draft.brand}</span>}
              {draft.unverified && <span style={{ marginLeft: 8, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--amber)", background: "var(--chip-warn-bg)", padding: "2px 8px", borderRadius: 8 }}>name to verify later</span>}
            </div>
            <div>
              <label style={lbl}>Strength</label>
              {draft.strengths.length ? (
                <select style={inp} value={draft.strength} onChange={e => setDraft(d => ({ ...d, strength: e.target.value }))}>
                  <option value="">Select…</option>
                  {draft.strengths.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="__other">Other</option>
                </select>
              ) : (
                <input style={inp} value={draft.strength} onChange={e => setDraft(d => ({ ...d, strength: e.target.value }))} placeholder="e.g. 5 mg" />
              )}
            </div>
            <div>
              <label style={lbl}>Dose amount</label>
              <input style={inp} value={draft.doseAmount} onChange={e => setDraft(d => ({ ...d, doseAmount: e.target.value }))} placeholder="e.g. 2 mg, or 2 capsules" />
            </div>
            <div>
              <label style={lbl}>How often</label>
              <select style={inp} value={draft.freqCode} onChange={e => setDraft(d => ({ ...d, freqCode: e.target.value }))}>
                {FREQUENCIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
            {draft.freqCode === "custom" ? (
              <div>
                <label style={lbl}>Custom schedule</label>
                <input style={inp} value={draft.customFreq} onChange={e => setDraft(d => ({ ...d, customFreq: e.target.value }))} placeholder="e.g. Mon/Wed/Fri" />
              </div>
            ) : (
              <div>
                <label style={lbl}>Prescriber <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                <input style={inp} list="me-prescribers" value={draft.prescriber} onChange={e => setDraft(d => ({ ...d, prescriber: e.target.value }))} placeholder="e.g. Dr. Chen" />
              </div>
            )}
            {draft.freqCode === "custom" && (
              <div>
                <label style={lbl}>Prescriber <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                <input style={inp} list="me-prescribers" value={draft.prescriber} onChange={e => setDraft(d => ({ ...d, prescriber: e.target.value }))} placeholder="e.g. Dr. Chen" />
              </div>
            )}
            <datalist id="me-prescribers">
              {careTeamNames().map(n => <option key={n} value={n} />)}
            </datalist>
            <div style={{ gridColumn: "1/-1", display: "flex", gap: 10 }}>
              <button onClick={addDraft} style={primaryBtn}>Add medication</button>
              <button onClick={() => setDraft(null)} style={ghostBtn}>Cancel</button>
            </div>
          </div>
        )}

        {meds.length > 0 && !draft && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {meds.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>
                  <strong>{m.name}</strong>{m.dose ? ` ${m.dose}` : ""}: {m.frequency}
                  {m.unverifiedName && <span style={{ marginLeft: 8, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--amber)" }}>name to verify</span>}
                </span>
                <button aria-label={`Remove ${m.name}`} onClick={() => setMeds(list => list.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 14, minWidth: 32, minHeight: 32 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Allergies (§3.7: same screen, after meds) */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, color: "var(--text-bright)", fontWeight: 600, flex: 1 }}>Allergies</div>
          {/* §6: explicit positive assertion — absence of data is not NKDA */}
          {allergies.length === 0 && !hasNkdaAssertion() && (
            <button onClick={() => { assertNoKnownAllergies(); tick(t => t + 1); }}
              style={{ ...ghostBtn, fontSize: 12 }}>
              I have no known allergies
            </button>
          )}
          {hasNkdaAssertion() && allergies.length === 0 && (
            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--green)" }}>✓ No known allergies recorded</span>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <label style={lbl} htmlFor="me-allergy">Substance</label>
            <input id="me-allergy" style={inp} value={allergyQuery} onChange={e => setAllergyQuery(e.target.value)} placeholder="e.g. penicillin" autoComplete="off" />
            {allergenMatches.length > 0 && (
              <div role="listbox" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 40, background: "var(--card)", border: "1px solid var(--border-strong)", borderRadius: 10, marginTop: 4, maxHeight: 200, overflowY: "auto", boxShadow: "0 12px 32px rgba(0,0,0,.5)" }}>
                {allergenMatches.map(a => (
                  <div key={a} role="option" aria-selected="false" onMouseDown={() => setAllergyQuery(a)}
                    style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--divider)", fontSize: 13, color: "var(--text-primary)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--accent-tint)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {a}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>Reaction <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input style={inp} value={allergyReaction} onChange={e => setAllergyReaction(e.target.value)} placeholder="e.g. hives" />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <button onClick={() => addAllergy()} disabled={!allergyQuery.trim()} style={{ ...ghostBtn, opacity: allergyQuery.trim() ? 1 : 0.5 }}>+ Add allergy</button>
          </div>
        </div>
        {allergies.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {allergies.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}><strong>{a.name}</strong>{a.reaction ? `: ${a.reaction}` : ""}</span>
                <button aria-label={`Remove ${a.name}`} onClick={() => setAllergies(list => list.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 14, minWidth: 32, minHeight: 32 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={onCancel} style={ghostBtn}>Back</button>
        <button onClick={save} disabled={saved || (meds.length === 0 && allergies.length === 0)}
          style={{ ...primaryBtn, opacity: (meds.length || allergies.length) && !saved ? 1 : 0.5 }}>
          Save to my record
        </button>
      </div>
    </div>
  );
}

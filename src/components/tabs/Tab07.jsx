import { useState, useEffect } from "react";
import AppSidebar from "../AppSidebar.jsx";
import TopBar from "../TopBar.jsx";
import { safeAverage, safeNumber, formatDateUS } from "../../lib/displaySafe.js";
import { takePendingSelect } from "../../lib/searchSelect.js";



// Common symptoms relevant to transplant / immunosuppressed patients
const COMMON_SYMPTOMS = [
  { id: "fatigue", label: "Fatigue", category: "General" },
  { id: "headache", label: "Headache", category: "Neurological" },
  { id: "nausea", label: "Nausea", category: "GI" },
  { id: "swelling", label: "Swelling / Edema", category: "Cardiovascular" },
  { id: "shortness_breath", label: "Shortness of Breath", category: "Respiratory" },
  { id: "fever", label: "Fever / Chills", category: "Infection" },
  { id: "tremor", label: "Hand Tremor", category: "Neurological" },
  { id: "abdominal_pain", label: "Abdominal Pain", category: "GI" },
  { id: "decreased_urine", label: "Decreased Urine Output", category: "Kidney" },
  { id: "dark_urine", label: "Dark Urine", category: "Kidney" },
  { id: "joint_pain", label: "Joint Pain / Gout", category: "Musculoskeletal" },
  { id: "muscle_weakness", label: "Muscle Weakness", category: "Musculoskeletal" },
  { id: "dizziness", label: "Dizziness", category: "Neurological" },
  { id: "confusion", label: "Brain Fog / Confusion", category: "Neurological" },
  { id: "appetite_loss", label: "Loss of Appetite", category: "GI" },
  { id: "diarrhea", label: "Diarrhea", category: "GI" },
  { id: "skin_changes", label: "Skin Changes / Rash", category: "Dermatological" },
  { id: "cough", label: "Cough", category: "Respiratory" },
  { id: "palpitations", label: "Heart Palpitations", category: "Cardiovascular" },
  { id: "back_pain", label: "Back / Flank Pain", category: "Kidney" },
  { id: "insomnia", label: "Insomnia", category: "General" },
  { id: "weight_gain", label: "Rapid Weight Gain", category: "Cardiovascular" },
];

const BODY_LOCATIONS = [
  "Head", "Neck", "Chest", "Abdomen", "Back / Flank",
  "Arms", "Legs", "Feet / Ankles", "Whole Body", "None / General",
];

const SEVERITY_LABELS = {
  1: "Barely noticeable", 2: "Very mild", 3: "Mild",
  4: "Mild–moderate", 5: "Moderate",
  6: "Moderate–severe", 7: "Severe",
  8: "Very severe", 9: "Intense", 10: "Worst imaginable",
};

const severityColor = s =>
  s <= 3 ? "#10b981" : s <= 5 ? "#f59e0b" : s <= 7 ? "#f97316" : "#ef4444";

let nextId = Date.now();

// Log panel
function LogPanel({ onClose, onSave }) {
  const [step, setStep] = useState(1); // 1 = pick symptom, 2 = details
  const [selected, setSelected] = useState(null);
  const [custom, setCustom] = useState("");
  const [location, setLocation] = useState("");
  const [severity, setSeverity] = useState(5);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("");

  const filtered = COMMON_SYMPTOMS.filter(s =>
    s.label.toLowerCase().includes(filter.toLowerCase())
  );

  const categories = [...new Set(filtered.map(s => s.category))];

  const canProceed = selected || custom.trim();

  const handleSave = () => {
    onSave({
      symptom: selected ? selected.label : custom.trim(),
      custom: selected ? "" : custom.trim(),
      location: location || "None / General",
      severity,
      note,
      status: "active",
    });
    onClose();
  };

  return (
    <div style={{ position: "absolute", top: 0, right: 0, width: 340, height: "100%", background: "#080c14", borderLeft: "1px solid #1c2a40", display: "flex", flexDirection: "column", zIndex: 20, animation: "slideInRight .22s ease both" }}>
      {/* Header */}
      <div style={{ padding: "18px 18px 14px", borderBottom: "1px solid #1c2a40", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 12, color: "#6ea3ff", fontFamily: "'DM Mono',monospace", letterSpacing: "1.5px", marginBottom: 4 }}>
            {step === 1 ? "STEP 1 OF 2" : "STEP 2 OF 2"}
          </div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: "#dde8f5" }}>
            {step === 1 ? "Select Symptom" : selected ? selected.label : custom}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 6, color: "#b0c4d8", fontSize: 14, cursor: "pointer", padding: "4px 8px" }}>✕</button>
      </div>

      {/* Step 1 — symptom picker */}
      {step === 1 && (
        <>
          <div style={{ padding: "14px 18px 10px", flexShrink: 0 }}>
            <input
              placeholder="Search symptoms..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 8, color: "#c4d8ee", fontSize: 12, fontFamily: "'Sora',sans-serif", outline: "none" }}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 14px" }}>
            {/* UI-22: free-form entry prominent at the TOP of symptom
                selection — findable without scrolling the catalog */}
            <div style={{ marginBottom: 16, background: "rgba(79,142,247,.05)", border: "1px solid rgba(79,142,247,.18)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#7eb8d8", fontFamily: "'DM Mono',monospace", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 7 }}>Describe in your own words</div>
              <input
                placeholder="e.g. Tingling in left hand..."
                value={custom}
                onChange={e => { setCustom(e.target.value); if (e.target.value) setSelected(null); }}
                style={{ width: "100%", padding: "9px 12px", background: "#0b1220", border: `1px solid ${custom ? "#4f8ef7" : "#1c2a40"}`, borderRadius: 8, color: "#c4d8ee", fontSize: 12, fontFamily: "'Sora',sans-serif", outline: "none" }}
              />
              <div style={{ fontSize: 12, color: "#6a8090", fontFamily: "'DM Mono',monospace", marginTop: 6 }}>…or pick from the common symptoms below</div>
            </div>

            {categories.map(cat => (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 7 }}>{cat}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {filtered.filter(s => s.category === cat).map(s => (
                    <button key={s.id} onClick={() => { setSelected(selected?.id === s.id ? null : s); if (selected?.id !== s.id) setCustom(""); }}
                      style={{ padding: "5px 11px", borderRadius: 20, border: `1px solid ${selected?.id === s.id ? "#4f8ef7" : "#1c2a40"}`, background: selected?.id === s.id ? "rgba(79,142,247,.15)" : "#0b1220", color: selected?.id === s.id ? "#7eb8d8" : "#b0c4d8", fontSize: 12, cursor: "pointer", fontFamily: "'Sora',sans-serif", transition: "all .12s" }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "14px 18px", borderTop: "1px solid #1c2a40", flexShrink: 0 }}>
            <button onClick={() => canProceed && setStep(2)}
              style={{ width: "100%", padding: "11px", background: canProceed ? "#4f8ef7" : "#0f1e30", border: "none", borderRadius: 9, color: canProceed ? "#fff" : "#98afc4", fontSize: 13, fontFamily: "'Sora',sans-serif", fontWeight: 600, cursor: canProceed ? "pointer" : "default", transition: "all .15s" }}>
              Next →
            </button>
          </div>
        </>
      )}

      {/* Step 2 — details */}
      {step === 2 && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "18px" }}>

            {/* Severity slider */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Severity</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: severityColor(severity), lineHeight: 1 }}>{severity}</span>
                <span style={{ fontSize: 12, color: severityColor(severity), fontWeight: 600 }}>{SEVERITY_LABELS[severity]}</span>
              </div>
              {/* Custom slider track */}
              <div style={{ position: "relative", marginBottom: 8 }}>
                <input type="range" min={1} max={10} value={severity} onChange={e => setSeverity(+e.target.value)}
                  style={{ width: "100%", accentColor: severityColor(severity), cursor: "pointer" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace" }}>
                <span>1: Minimal</span><span>10: Severe</span>
              </div>
              {/* Color bar */}
              <div style={{ height: 4, borderRadius: 4, marginTop: 10, background: "linear-gradient(to right, #10b981, #f59e0b, #f97316, #ef4444)", position: "relative" }}>
                <div style={{ position: "absolute", top: -3, left: `${((severity - 1) / 9) * 100}%`, transform: "translateX(-50%)", width: 10, height: 10, borderRadius: "50%", background: severityColor(severity), border: "2px solid #080c14", boxShadow: `0 0 8px ${severityColor(severity)}` }} />
              </div>
            </div>

            {/* Body location */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Body Location</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {BODY_LOCATIONS.map(loc => (
                  <button key={loc} onClick={() => setLocation(location === loc ? "" : loc)}
                    style={{ padding: "5px 11px", borderRadius: 20, border: `1px solid ${location === loc ? "#4f8ef7" : "#1c2a40"}`, background: location === loc ? "rgba(79,142,247,.15)" : "#0b1220", color: location === loc ? "#7eb8d8" : "#b0c4d8", fontSize: 12, cursor: "pointer", fontFamily: "'Sora',sans-serif", transition: "all .12s" }}>
                    {loc}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>Notes <span style={{ color: "#a0b4c8" }}>· optional</span></div>
              <textarea
                placeholder="Any context. When it started, what makes it better or worse..."
                value={note} onChange={e => setNote(e.target.value)} rows={4}
                style={{ width: "100%", padding: "9px 12px", background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 8, color: "#c4d8ee", fontSize: 12, fontFamily: "'Sora',sans-serif", outline: "none", resize: "none", lineHeight: 1.6 }}
              />
            </div>
          </div>

          <div style={{ padding: "14px 18px", borderTop: "1px solid #1c2a40", display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={() => setStep(1)}
              style={{ padding: "11px 14px", background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 9, color: "#b0c4d8", fontSize: 13, fontFamily: "'Sora',sans-serif", cursor: "pointer" }}>
              ← Back
            </button>
            <button onClick={handleSave}
              style={{ flex: 1, padding: "11px", background: "#10b981", border: "none", borderRadius: 9, color: "#fff", fontSize: 13, fontFamily: "'Sora',sans-serif", fontWeight: 600, cursor: "pointer" }}>
              Save Symptom
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// UI-22: full numbered 1–10 severity scale with marker, score, and label
// ("Moderate · 5/10") on every card that has a recorded severity.
function SeverityBar({ value }) {
  const pct = ((value - 1) / 9) * 100;
  const color = severityColor(value);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1, position: "relative", height: 4, background: "#0d1a28", borderRadius: 4 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4 }} />
          {/* marker */}
          <div style={{ position: "absolute", top: -3, left: `${pct}%`, transform: "translateX(-50%)", width: 10, height: 10, borderRadius: "50%", background: color, border: "2px solid #080c14", boxShadow: `0 0 6px ${color}` }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color, whiteSpace: "nowrap" }}>
          {SEVERITY_LABELS[value]} · {value}/10
        </span>
      </div>
      {/* numbered scale */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingRight: 84 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <span key={n} style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", color: n === value ? color : "#4a5c6a", fontWeight: n === value ? 700 : 400 }}>{n}</span>
        ))}
      </div>
    </div>
  );
}

// Detail side panel
function DetailPanel({ entry, onClose, onResolve, onNavToAI }) {
  return (
    <div style={{ position: "absolute", top: 0, right: 0, width: 320, height: "100%", background: "#080c14", borderLeft: "1px solid #1c2a40", display: "flex", flexDirection: "column", zIndex: 10, animation: "slideInRight .2s ease both" }}>
      <div style={{ padding: "18px 18px 14px", borderBottom: "1px solid #1c2a40", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: entry.status === "active" ? "#f87171" : "#2dd4a0", fontFamily: "'DM Mono',monospace", letterSpacing: "1.5px", marginBottom: 5, fontWeight: 600 }}>
            {entry.status === "active" ? "● ACTIVE" : `✓ RESOLVED${entry.resolvedDate ? ` ${entry.resolvedDate}` : ""}`}
          </div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 19, color: "#dde8f5", lineHeight: 1.2 }}>{entry.symptom}</div>
          <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", marginTop: 5 }}>{formatDateUS(entry.date)} · {entry.location}</div>
        </div>
        <button onClick={onClose} style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 6, color: "#b0c4d8", fontSize: 14, cursor: "pointer", padding: "4px 8px", flexShrink: 0 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "18px" }}>
        {/* Severity */}
        <div style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 12, padding: "16px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Severity</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: severityColor(entry.severity), lineHeight: 1 }}>{entry.severity}</span>
            <span style={{ fontSize: 13, color: severityColor(entry.severity), fontWeight: 600 }}>{SEVERITY_LABELS[entry.severity]}</span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: "linear-gradient(to right,#10b981,#f59e0b,#f97316,#ef4444)", position: "relative" }}>
            <div style={{ position: "absolute", top: -4, left: `${((entry.severity - 1) / 9) * 100}%`, transform: "translateX(-50%)", width: 14, height: 14, borderRadius: "50%", background: severityColor(entry.severity), border: "2px solid #080c14" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", marginTop: 6 }}>
            <span>1</span><span>5</span><span>10</span>
          </div>
        </div>

        {/* Notes */}
        {entry.note && (
          <div style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 12, padding: "14px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>Notes</div>
            <div style={{ fontSize: 12, color: "#a8c4dc", lineHeight: 1.7 }}>{entry.note}</div>
          </div>
        )}

        {/* AI context hint */}
        <div style={{ background: "linear-gradient(135deg,rgba(79,142,247,.08),rgba(167,139,250,.06))", border: "1px solid rgba(79,142,247,.2)", borderRadius: 12, padding: "14px" }}>
          <div style={{ fontSize: 12, color: "#6ea3ff", fontFamily: "'DM Mono',monospace", letterSpacing: "1.2px", marginBottom: 8 }}>✦ AI CONTEXT</div>
          <div style={{ fontSize: 12, color: "#7eb8d8", lineHeight: 1.7, marginBottom: 12 }}>
            {entry.symptom === "Hand Tremor" && "Tacrolimus-induced tremor is common: worth noting if severity increases or correlates with trough levels."}
            {entry.symptom === "Fatigue" && "Fatigue in transplant patients can reflect anemia, tacrolimus levels, poor sleep, or early rejection. Correlates with your recent Hemoglobin and eGFR trends."}
            {entry.symptom === "Swelling / Edema" && "Ankle edema may reflect fluid retention: relevant alongside furosemide dosing and your BP readings."}
            {entry.symptom === "Nausea" && "Nausea is a common mycophenolate and tacrolimus side effect: timing relative to medication doses is useful context."}
            {entry.symptom === "Joint Pain / Gout" && "Uric acid is 5.8 and trending up. Tacrolimus and furosemide both raise uric acid risk. Worth flagging to Dr. Cohen."}
            {entry.symptom === "Decreased Urine Output" && "Decreased output alongside rising creatinine (now 1.42) and falling eGFR (58) is a key concern for the nephrology appointment."}
            {entry.symptom === "Dizziness" && "Orthostatic dizziness correlates with your Mar 3 BP reading of 164/88. May indicate medication timing or volume status."}
            {entry.symptom === "Brain Fog / Confusion" && "Tacrolimus neurotoxicity can present as brain fog. Worth noting if severity increases or correlates with high trough levels."}
            {entry.symptom === "Headache" && "Hypertension is a common cause of headache in transplant patients: correlates with BP readings above 140."}
            {!["Hand Tremor","Fatigue","Swelling / Edema","Nausea","Joint Pain / Gout","Decreased Urine Output","Dizziness","Brain Fog / Confusion","Headache"].includes(entry.symptom) && "This symptom has been logged. The AI Analysis tab can cross-reference it against your labs, vitals, and medications for deeper insights."}
          </div>
          <button
            onClick={() => {
              const loc = entry.location && entry.location !== "None / General" ? ` in my ${entry.location.toLowerCase()}` : "";
              const prompt = `I've been experiencing ${entry.symptom}${loc}, severity ${entry.severity}/10.${entry.note ? ` Notes: ${entry.note}.` : ""} Please cross-reference this symptom with my current labs, vitals, and medications to identify possible causes and what I should discuss with my care team.`;
              localStorage.setItem("mi_ai_pending", prompt);
              onNavToAI?.();
              onClose();
            }}
            style={{ width: "100%", padding: "8px", background: "rgba(79,142,247,.08)", border: "1px solid rgba(79,142,247,.3)", borderRadius: 8, color: "#6ea3ff", fontSize: 12, fontFamily: "'Sora',sans-serif", cursor: "pointer", fontWeight: 600 }}>
            ✦ Analyze in AI tab →
          </button>
        </div>
      </div>

      {entry.status === "active" && (
        <div style={{ padding: "14px 18px", borderTop: "1px solid #1c2a40", flexShrink: 0 }}>
          <button onClick={() => onResolve(entry.id)}
            style={{ width: "100%", padding: "10px", background: "#0b1220", border: "1px solid #10b981", borderRadius: 9, color: "#2dd4a0", fontSize: 12, fontFamily: "'Sora',sans-serif", fontWeight: 600, cursor: "pointer" }}>
            ✓ Mark as Resolved
          </button>
        </div>
      )}
    </div>
  );
}

export default function App({ onNavChange }) {
  const [activeNav, setActiveNav] = useState("symptoms");
  const handleNav = (id) => { if (id !== "symptoms") { onNavChange?.(id); } else { setActiveNav(id); } };
  const [entries, setEntries] = useState(() => { try { const r = localStorage.getItem("mi_symptoms"); return r ? JSON.parse(r) : []; } catch { return []; } });
  const [showLog, setShowLog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [filter, setFilter] = useState("all"); // all | active | resolved
  const [time, setTime] = useState(new Date());

  useEffect(() => { const t = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(t); }, []);

  // UI-26: a search result targeting a symptom opens that entry's detail.
  // Entries store the symptom name as `symptom` (companion imports may use
  // `name`). Runs on mount and on the event (already the visible tab).
  useEffect(() => {
    const apply = () => {
      const title = takePendingSelect("symptoms");
      if (!title) return;
      let all = [];
      try { all = JSON.parse(localStorage.getItem("mi_symptoms") || "[]"); } catch { /* locked */ }
      const hit = all.find(e => (e.symptom || e.name) === title);
      if (hit) { setSelectedEntry(hit); setShowLog(false); }
    };
    apply();
    window.addEventListener("insina-pending-select", apply);
    return () => window.removeEventListener("insina-pending-select", apply);
  }, []);
  const fmt = d => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const fmtDate = d => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const saveToStorage = (updated) => { try { localStorage.setItem("mi_symptoms", JSON.stringify(updated)); } catch {} };

  const handleSave = (data) => {
    const now = new Date();
    const dateLabel = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const entry = { id: nextId++, date: dateLabel, ts: now.toISOString(), ...data };
    setEntries(e => { const updated = [entry, ...e]; saveToStorage(updated); return updated; });
    setSelectedEntry(entry);
  };

  const handleResolve = (id) => {
    // UI-22: record the resolution date so resolved cards stay understandable
    const resolvedDate = new Date().toISOString().slice(0, 10);
    setEntries(e => { const updated = e.map(x => x.id === id ? { ...x, status: "resolved", resolvedDate } : x); saveToStorage(updated); return updated; });
    setSelectedEntry(prev => prev?.id === id ? { ...prev, status: "resolved", resolvedDate } : prev);
  };

  // Hand a symptom straight to the AI Analysis tab with a pre-filled prompt.
  const askAIAbout = (entry) => {
    const loc = entry.location && entry.location !== "None / General" ? ` in my ${entry.location.toLowerCase()}` : "";
    const prompt = `I've been experiencing ${entry.symptom}${loc}, severity ${entry.severity}/10.${entry.note ? ` Notes: ${entry.note}.` : ""} Please cross-reference this symptom with my current labs, vitals, and medications to identify possible causes and what I should discuss with my care team.`;
    localStorage.setItem("mi_ai_pending", prompt);
    onNavChange?.("ai");
  };

  const displayed = entries.filter(e => filter === "all" ? true : e.status === filter);
  const active = entries.filter(e => e.status === "active");
  // UI-2: average only the numeric severities — companion entries store text
  // ("Moderate"), which used to turn the whole average into NaN on screen.
  const avgSeverity = safeAverage(entries.map(e => e.severity)) ?? "No severity recorded";
  // UI-2: peak over numeric severities only (text severities from the
  // companion would turn Math.max into NaN); null when none are numeric.
  const maxSeverity = (() => {
    const nums = entries.map(e => safeNumber(e.severity)).filter(n => n !== null);
    return nums.length ? Math.max(...nums) : null;
  })();

  // Group by date
  const grouped = displayed.reduce((acc, entry) => {
    if (!acc[entry.date]) acc[entry.date] = [];
    acc[entry.date].push(entry);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", height: "100vh", background: "#07090f", color: "#d4e2f0", fontFamily: "'Sora',sans-serif", overflow: "hidden" }}>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1a2840;border-radius:4px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes slideInRight{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .section-label{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#a0b4c8;font-family:'DM Mono',monospace;margin-bottom:10px}
        .entry-row{background:#0b1220;border:1px solid #1c2a40;border-radius:11px;padding:14px 16px;cursor:pointer;transition:all .15s;animation:fadeUp .3s ease both;margin-bottom:7px}
        .entry-row:hover{border-color:#1a2f4a}
        .entry-row.sel{border-color:#6ea3ff;background:rgba(79,142,247,.06)}
        .filter-btn{padding:5px 13px;border-radius:20px;border:1px solid #1c2a40;background:transparent;color:#b0c4d8;font-size:12px;font-family:'Sora',sans-serif;cursor:pointer;transition:all .12s}
        .filter-btn:hover{color:#7eb8d8;border-color:#1a2f4a}
        .filter-btn.on{background:rgba(79,142,247,.12);border-color:#6ea3ff;color:#7eb8d8}
      `}</style>

      {/* Sidebar */}
      <AppSidebar activeNav={activeNav} onNav={handleNav} />

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Top bar: shared (WO_DASHBOARD_POLISH_02 item 4; DEC-059) */}
        <TopBar activeNav={activeNav} onNav={handleNav} />
        {/* Screen actions */}
        <div className="screen-bar">
          <button onClick={()=>{ setShowLog(true); setSelectedEntry(null); }}
            style={{ padding:"9px 20px", background:"#4f8ef7", border:"none", borderRadius:8, color:"#fff", fontSize:13, fontFamily:"'Sora',sans-serif", fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:8, boxShadow:"0 0 18px rgba(79,142,247,.35)" }}>
            <span style={{ fontSize:17, lineHeight:1 }}>+</span> Log Symptom
          </button>
        </div>

        {/* Content */}
        <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative" }}>
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px" }}>

            {/* Page header */}
            <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:20 }}>
              <div>
                <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, color:"#dde8f5", fontWeight:400, letterSpacing:"-0.5px", marginBottom:4 }}>Symptoms</h1>
                <p style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>{entries.length} logged · {active.length} active</p>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {[["all","All"],["active","Active"],["resolved","Resolved"]].map(([v,l]) => (
                  <button key={v} className={`filter-btn ${filter===v?"on":""}`} onClick={()=>setFilter(v)}>{l}</button>
                ))}
              </div>
            </div>

            {/* Stat chips */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:24 }}>
              {[
                { label:"Active", value: active.length, color: active.length > 0 ? "#ef4444" : "#10b981" },
                { label:"Total Logged", value: entries.length, color:"#4f8ef7" },
                { label:"Avg Severity", value: avgSeverity, color: safeNumber(avgSeverity) == null ? "#98afc4" : safeNumber(avgSeverity) >= 6 ? "#ef4444" : safeNumber(avgSeverity) >= 4 ? "#f59e0b" : "#10b981" },
                { label:"Peak Severity", value: maxSeverity ?? "–", color: severityColor(maxSeverity ?? 5) },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background:"#0b1220", border:"1px solid #1c2a40", borderRadius:12, padding:"14px 16px", animation:"fadeUp .3s ease both" }}>
                  <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", marginBottom:6 }}>{label}</div>
                  <div style={{ fontSize:24, fontWeight:700, color, lineHeight:1 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Log CTA */}
            <div
              onClick={()=>{ setShowLog(true); setSelectedEntry(null); }}
              style={{ background:"linear-gradient(135deg,rgba(79,142,247,.1),rgba(167,139,250,.07))", border:"1px dashed rgba(79,142,247,.4)", borderRadius:14, padding:"18px 22px", marginBottom:24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", transition:"all .15s", animation:"fadeUp .35s ease both" }}
              onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(79,142,247,.7)"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(79,142,247,.4)"}
            >
              <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:"rgba(79,142,247,.18)", border:"1px solid rgba(79,142,247,.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, color:"#6ea3ff", lineHeight:1, flexShrink:0 }}>+</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:600, color:"#7eb8d8", marginBottom:3 }}>Log a new symptom</div>
                  <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>Quick-select or describe in your own words · takes 30 seconds</div>
                </div>
              </div>
              <div style={{ fontSize:18, color:"#6ea3ff", opacity:0.6 }}>→</div>
            </div>

            {/* Timeline */}
            {displayed.length === 0 && (
              <div style={{ textAlign:"center", padding:"40px 20px", color:"#a0b4c8", fontFamily:"'DM Mono',monospace", fontSize:12 }}>
                No symptoms logged yet. Use the &ldquo;Log Symptom&rdquo; button to record your first entry.
              </div>
            )}
            {Object.entries(grouped).map(([date, dayEntries]) => (
              <div key={date} style={{ marginBottom:22 }}>
                {/* Date header with timeline dot */}
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"#1a2840", flexShrink:0 }}/>
                  <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", letterSpacing:"0.5px", fontWeight:600 }}>{date}</div>
                  <div style={{ flex:1, height:1, background:"#0d1a28" }}/>
                </div>

                {dayEntries.map((entry, i) => {
                  const isSelected = selectedEntry?.id === entry.id;
                  return (
                    <div
                      key={entry.id}
                      className={`entry-row ${isSelected ? "sel" : ""}`}
                      style={{ animationDelay:`${i * 40}ms`, marginLeft:18, borderLeft:`3px solid ${severityColor(entry.severity)}` }}
                      onClick={() => { setSelectedEntry(isSelected ? null : entry); setShowLog(false); }}
                    >
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, marginBottom:10 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                            <span style={{ fontSize:14, fontWeight:600, color:"#c4d8ee" }}>{entry.symptom}</span>
                            <span style={{ fontSize:12, background: entry.status==="active" ? "rgba(239,68,68,.12)" : "rgba(16,185,129,.1)", color: entry.status==="active" ? "#f87171" : "#2dd4a0", padding:"2px 7px", borderRadius:20, fontFamily:"'DM Mono',monospace", fontWeight:600 }}>
                              {entry.status === "active" ? "ACTIVE" : entry.resolvedDate ? `RESOLVED ${entry.resolvedDate}` : "RESOLVED"}
                            </span>
                          </div>
                          <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>
                            {entry.location}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); askAIAbout(entry); }}
                          title="Cross-reference this symptom with your labs, vitals, and medications"
                          style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", background:"rgba(79,142,247,.14)", border:"1px solid rgba(79,142,247,.4)", borderRadius:8, color:"#7eb8d8", fontSize:12, fontFamily:"'Sora',sans-serif", fontWeight:600, cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" }}
                        >
                          ✦ Ask AI
                        </button>
                      </div>
                      <SeverityBar value={entry.severity} />
                      {entry.note && (
                        <div style={{ fontSize:12, color:"#b0c4d8", marginTop:9, lineHeight:1.55, borderTop:"1px solid #1c2a40", paddingTop:9 }}>
                          {entry.note}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {displayed.length === 0 && (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#a0b4c8", fontFamily:"'DM Mono',monospace", fontSize:12 }}>
                No symptoms logged yet.
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedEntry && !showLog && (
            <DetailPanel
              entry={selectedEntry}
              onClose={() => setSelectedEntry(null)}
              onResolve={handleResolve}
              onNavToAI={() => onNavChange?.("ai")}
            />
          )}

          {/* Log panel */}
          {showLog && (
            <LogPanel onClose={() => setShowLog(false)} onSave={handleSave} />
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { formatDateUS } from "../../lib/displaySafe.js";
import { PrintLabel } from "../icons.jsx";
import CPT_COMMON from "../../data/cpt_common.json";
import { tombstoneRecord } from "../../lib/recordTombstones.js";
// v1.59.0: calendar-sync-style procedure suggestions from the record text
// (same engine as Conditions); nothing enters mi_surgeries unreviewed.
import { runProcedureScan, readProcedureSuggestions, dismissProcedureSuggestion, resolveProcedureSuggestion, lastProcedureScanDay, todayISO } from "../../lib/procedureSuggest.js";

const ANESTHESIA = ["General", "Regional", "Local", "Spinal", "Epidural", "Sedation", "None / N/A"];
const OUTCOMES   = ["Successful", "Successful with complications", "Incomplete", "Cancelled", "Unknown"];

const BLANK = {
  id: null, procedure: "", cpt: "", icd10: "", date: "", surgeon: "", facility: "",
  anesthesia: "General", outcome: "Successful", duration: "", notes: "",
};
function genId() { return Math.random().toString(36).slice(2); }
function load() {
  try { const r = localStorage.getItem("mi_surgeries"); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
function saveSurgeries(list) {
  localStorage.setItem("mi_surgeries", JSON.stringify(list));
}
function fmtDate(iso) {
  return formatDateUS(iso, "–"); // v1.56.2: date fields read mm/dd/yyyy
}
function outcomeColor(o) {
  if (o === "Successful") return "#10b981";
  if (o === "Successful with complications") return "#f59e0b";
  if (o === "Cancelled") return "#6b7a8d";
  return "#ef4444";
}

// ── CPT Lookup (WO-2) ─────────────────────────────────────────────────────────
// Surgeries are procedures, coded with CPT, not ICD-10. Local bundled subset
// (~150 common procedures, lay descriptions) — no network call; the previous
// NIH ICD-10 API lookup is removed. Debounced 250ms type-ahead matching BOTH
// code prefix and description substring; code-prefix matches rank first.
export const CPT_RE = /^\d{4}[0-9A-Z]$/;

function searchCpt(term) {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return [];
  const codeHits = [];
  const descHits = [];
  for (const item of CPT_COMMON) {
    if (item.code.startsWith(t.toUpperCase()) || item.code.toLowerCase().startsWith(t)) codeHits.push(item);
    else if (item.desc.toLowerCase().includes(t)) descHits.push(item);
  }
  return [...codeHits, ...descHits].slice(0, 8);
}

function CptLookup({ value, onChange, onPick, inp }) {
  const [query, setQuery]     = useState(value || "");
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const timerRef = useRef(null);
  const wrapRef  = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);
  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleInput(e) {
    const v = e.target.value.toUpperCase(); // uppercase-normalize on entry
    setQuery(v);
    onChange(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const items = searchCpt(v);
      setResults(items);
      setOpen(items.length > 0);
    }, 250);
  }

  function pick(item) {
    setQuery(item.code);
    onPick(item); // fills both code and procedure name
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position:"relative" }}>
      <input style={inp} value={query} onChange={handleInput} onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Type a code or procedure name to search…" maxLength={40} />
      {open && results.length > 0 && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:8, zIndex:400, maxHeight:240, overflowY:"auto", boxShadow:"0 8px 24px rgba(0,0,0,.5)" }}>
          {results.map(item => (
            <div key={item.code} onMouseDown={() => pick(item)}
              style={{ padding:"9px 14px", cursor:"pointer", borderBottom:"1px solid #1c2a40", display:"flex", gap:10, alignItems:"flex-start" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(79,142,247,.07)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:"#6ea3ff", flexShrink:0, minWidth:52 }}>{item.code}</span>
              <span style={{ fontSize:12, color:"#c4d8ee", lineHeight:1.4 }}>{item.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function SurgeryModal({ surgery, onSave, onClose }) {
  const [form, setForm] = useState({ ...BLANK, ...surgery });
  const [cptError, setCptError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
      <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, padding:28, width:540, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:"#dde8f5", marginBottom:20 }}>
          {form.id ? "Edit Procedure" : "Add Procedure"}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          {/* Procedure */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Procedure Name *</label>
            <input style={inp} value={form.procedure} onChange={e => set("procedure", e.target.value)} placeholder="e.g. Kidney Transplant (Living Donor)" />
          </div>
          {/* WO-2: CPT (procedures are CPT-coded; optional — uncoded allowed) */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>CPT Code</label>
            <CptLookup
              value={form.cpt || ""}
              onChange={v => { set("cpt", v); setCptError(""); }}
              onPick={item => { set("cpt", item.code); set("procedure", form.procedure || item.desc); setCptError(""); }}
              inp={inp}
            />
            {cptError && <div style={{ fontSize:12, color:"#f87171", marginTop:5 }}>{cptError}</div>}
            {form.icd10 && !form.cpt && (
              <div style={{ fontSize:12, color:"#98afc4", marginTop:6, fontFamily:"'DM Mono',monospace" }}>
                Legacy ICD-10 on this entry: {form.icd10}
              </div>
            )}
          </div>
          {/* Date */}
          <div>
            <label style={lbl}>Date of Procedure</label>
            <input style={inp} type="date" value={form.date} onChange={e => set("date", e.target.value)} />
          </div>
          {/* Duration */}
          <div>
            <label style={lbl}>Duration</label>
            <input style={inp} value={form.duration} onChange={e => set("duration", e.target.value)} placeholder="e.g. 4 hrs 30 min" />
          </div>
          {/* Surgeon */}
          <div>
            <label style={lbl}>Surgeon</label>
            <input style={inp} value={form.surgeon} onChange={e => set("surgeon", e.target.value)} placeholder="e.g. Dr. Jane Smith" />
          </div>
          {/* Facility */}
          <div>
            <label style={lbl}>Facility / Hospital</label>
            <input style={inp} value={form.facility} onChange={e => set("facility", e.target.value)} placeholder="e.g. Ochsner Medical Center" />
          </div>
          {/* Anesthesia */}
          <div>
            <label style={lbl}>Anesthesia Type</label>
            <select style={inp} value={form.anesthesia} onChange={e => set("anesthesia", e.target.value)}>
              {ANESTHESIA.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {/* Outcome */}
          <div>
            <label style={lbl}>Outcome</label>
            <select style={inp} value={form.outcome} onChange={e => set("outcome", e.target.value)}>
              {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {/* Notes */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Notes / Post-op Details</label>
            <textarea style={{ ...inp, height:80, resize:"vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Recovery notes, complications, follow-up instructions, etc." />
          </div>
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={() => {
            if (!form.procedure) return;
            const cpt = (form.cpt || "").trim().toUpperCase();
            if (cpt && !CPT_RE.test(cpt)) { setCptError("CPT codes are 5 characters: four digits then a digit or letter (e.g. 47135). Leave blank to save uncoded."); return; }
            onSave({ ...form, cpt, id: form.id || genId() });
          }} style={btnPrimary}>
            {form.id ? "Save Changes" : "Add Procedure"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SurgeriesTab() {
  const [surgeries, setSurgeries] = useState(load);
  const [modal, setModal]         = useState(null);
  const [deleteId, setDeleteId]   = useState(null);

  // v1.59.0: suggested procedures (own store; only Confirm + Save writes mi_surgeries)
  const [suggestions, setSuggestions]     = useState(() => readProcedureSuggestions());
  const [scanMsg, setScanMsg]             = useState(null);
  const [scanNotice, setScanNotice]       = useState(null);   // { count }
  const [confirmingSug, setConfirmingSug] = useState(null);
  const [savedMsg, setSavedMsg]           = useState(null);
  const autoScanRanRef = useRef(false);

  const handleScan = (auto = false) => {
    const { suggestions: next, added } = runProcedureScan();
    setSuggestions(next);
    if (added > 0) setScanNotice({ count: added });
    else if (!auto) setScanMsg("No new procedure mentions found in your records. You're up to date.");
  };
  // Auto-scan once a day on tab entry; the ran-flag is set when the scan FIRES
  // (StrictMode's dev double-mount cancels the first timer).
  useEffect(() => {
    if (autoScanRanRef.current) return;
    if (lastProcedureScanDay() === todayISO()) return;
    const t = setTimeout(() => { autoScanRanRef.current = true; handleScan(true); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!scanMsg && !savedMsg) return;
    const t = setTimeout(() => { setScanMsg(null); setSavedMsg(null); }, 6000);
    return () => clearTimeout(t);
  }, [scanMsg, savedMsg]);

  const openConfirmSuggestion = (sug) => {
    setConfirmingSug(sug);
    // Pre-fill the name and the source document's date; the rest is reviewed in the modal.
    setModal({ ...BLANK, procedure: sug.name, date: sug.date || "" });
  };
  const handleDismissSuggestion = (sug) => setSuggestions(dismissProcedureSuggestion(sug));

  // Procedure-type entries from Medical Records belong here too (things done to
  // intervene/biopsy/treat) — shown read-only; owned and edited in Records.
  // Same merge the Health Profile and the printed report use.
  const recordProcedures = (() => {
    try {
      return JSON.parse(localStorage.getItem("mi_records") || "[]")
        .filter(r => r.type === "Procedure")
        .map(r => ({ id: `rec-${r.id}`, procedure: r.title || "Procedure", date: r.date || "", facility: r.facility || "", fromRecords: true }));
    } catch { return []; }
  })();
  const allProcedures = [...surgeries, ...recordProcedures];

  function handleSave(s) {
    const updated = s.id && surgeries.some(x => x.id === s.id)
      ? surgeries.map(x => x.id === s.id ? s : x)
      : [...surgeries, s];
    // Keep sorted by date descending
    updated.sort((a, b) => new Date(b.date) - new Date(a.date));
    setSurgeries(updated);
    saveSurgeries(updated);
    setModal(null);
    // Confirming a suggestion: the procedure is saved, so retire its card.
    if (confirmingSug) {
      setSuggestions(resolveProcedureSuggestion(confirmingSug.procId));
      setConfirmingSug(null);
      setSavedMsg("Procedure added from your records.");
    }
  }
  function handleDelete(id) {
    tombstoneRecord("mi_surgeries", surgeries.find(x => x.id === id));
    const updated = surgeries.filter(x => x.id !== id);
    setSurgeries(updated);
    saveSurgeries(updated);
    setDeleteId(null);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1 }}>
      <style>{`
        * { box-sizing:border-box; }
        @media print {
          body * { visibility:hidden; }
          #surgeries-print, #surgeries-print * { visibility:visible; }
          #surgeries-print { position:absolute; top:0; left:0; width:100%; }
          .no-print { display:none !important; }
        }
        .surg-card { background:#0b1220; border:1px solid #1c2a40; border-radius:12px; padding:18px 20px; margin-bottom:10px; transition:border-color .15s; }
        .surg-card:hover { border-color:#1a2f4a; }
      `}</style>

      <div id="surgeries-print" style={{ padding:"24px 28px", overflowY:"auto", flex:1 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:22 }} className="no-print">
          <div>
            <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:28, color:"#dde8f5", fontWeight:400, letterSpacing:"-0.5px" }}>Procedures</h1>
            <p style={{ fontSize:12, color:"#98afc4", marginTop:4, fontFamily:"'DM Mono',monospace" }}>
              {allProcedures.length} procedure{allProcedures.length !== 1 ? "s" : ""} on record · sorted most recent first
            </p>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => handleScan(false)} style={btnGhost} title="Scan Diagnostics, Notes, Records, and imported documents for procedures">⟳ Scan Records</button>
            <button onClick={() => window.print()} style={btnGhost}><PrintLabel /></button>
            <button onClick={() => setModal(BLANK)} style={btnPrimary}>+ Add Procedure</button>
          </div>
        </div>

        {(scanMsg || savedMsg) && (
          <div role="status" aria-live="polite" className="no-print" style={{ padding:"8px 14px", borderRadius:9, fontSize:12, fontFamily:"'DM Mono',monospace", background: savedMsg ? "rgba(16,185,129,.08)" : "rgba(79,142,247,.08)", border:`1px solid ${savedMsg ? "rgba(16,185,129,.25)" : "rgba(79,142,247,.25)"}`, color: savedMsg ? "#2dd4a0" : "#7eb8d8", marginBottom:16 }}>
            {savedMsg ? `✓ ${savedMsg}` : scanMsg}
          </div>
        )}

        {/* v1.59.0: suggested procedures found in the record, pending review */}
        {suggestions.length > 0 && (
          <div className="no-print" style={{ background:"rgba(245,158,11,.05)", border:"1px solid rgba(245,158,11,.25)", borderRadius:12, padding:"16px 18px", marginBottom:22 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:12, color:"#f59e0b" }}>✦</span>
              <span style={{ fontSize:12, color:"#f59e0b", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", fontWeight:600 }}>
                Suggested from your records ({suggestions.length})
              </span>
            </div>
            <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'Sora',sans-serif", marginBottom:14, lineHeight:1.5 }}>
              These procedures are described in your records but aren't on your Procedures list. Nothing is added until you review it: 
              Confirm to add one (the date comes from the document; edit anything first), or Dismiss it and it won't be suggested again.
            </div>
            {suggestions.map(sug => (
              <div key={sug.procId} style={{ background:"#0b1220", border:"1px solid rgba(245,158,11,.18)", borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:160 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:"#dde8f5" }}>{sug.name}</div>
                    {sug.date && <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", marginTop:2 }}>{formatDateUS(sug.date)}</div>}
                  </div>
                  <button onClick={() => openConfirmSuggestion(sug)} style={{ padding:"6px 14px", background:"rgba(16,185,129,.12)", border:"1px solid rgba(16,185,129,.35)", borderRadius:8, color:"#2dd4a0", fontFamily:"'Sora',sans-serif", fontSize:12, fontWeight:600, cursor:"pointer" }}>Confirm &amp; review</button>
                  <button onClick={() => handleDismissSuggestion(sug)} style={{ padding:"6px 14px", background:"transparent", border:"1px solid #1a2f4a", borderRadius:8, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer" }}>Dismiss</button>
                </div>
                <div style={{ marginTop:8 }}>
                  {sug.sources.slice(0, 3).map((s, i) => (
                    <div key={i} style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", lineHeight:1.6, marginBottom:2 }}>
                      <span style={{ color:"#f59e0b" }}>{s.store}</span>
                      {": "}{s.title}{s.date ? ` (${formatDateUS(s.date)})` : ""}
                      {s.snippet ? <span style={{ color:"#6a8090" }}>{" · “"}{s.snippet}{"”"}</span> : null}
                    </div>
                  ))}
                  {sug.sources.length > 3 && (
                    <div style={{ fontSize:12, color:"#6a8090", fontFamily:"'DM Mono',monospace" }}>+ {sug.sources.length - 3} more place{sug.sources.length - 3 !== 1 ? "s" : ""} in your records</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Print header */}
        <div style={{ display:"none" }}>
          <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, marginBottom:4 }}>Procedure History</h2>
          <p style={{ fontSize:12, color:"#666", marginBottom:20 }}>Printed {new Date().toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}</p>
        </div>

        {/* List */}
        {allProcedures.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:"#a0b4c8", fontFamily:"'DM Mono',monospace", fontSize:12 }}>
            No procedures added yet. Click Add Procedure to get started.
          </div>
        ) : (
          // UI-24: reverse-chronological at render time too — restored/legacy
          // data isn't guaranteed to arrive pre-sorted.
          [...allProcedures].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).map((s, i) => (
            <div key={s.id} className="surg-card">
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                <div style={{ flex:1 }}>
                  {/* Top row */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#a0b4c8", background:"#07090f", border:"1px solid #1c2a40", borderRadius:20, padding:"2px 10px" }}>#{allProcedures.length - i}</span>
                    <span style={{ fontSize:16, fontWeight:600, color:"#c4d8ee" }}>{s.procedure}</span>
                    {s.outcome && (
                      <span style={{ fontSize:12, color:outcomeColor(s.outcome), fontFamily:"'DM Mono',monospace", background:"rgba(0,0,0,.3)", borderRadius:10, padding:"2px 8px" }}>
                        {s.outcome}
                      </span>
                    )}
                  </div>
                  {/* Details row */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:18, fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", marginBottom:s.notes?8:0 }}>
                    {/* WO-2: CPT going forward; legacy entries keep their stored code labeled ICD-10 */}
                    {s.cpt      && <span style={{ color:"#7eb8d8" }}>CPT {s.cpt}</span>}
                    {!s.cpt && s.icd10 && <span>ICD-10 {s.icd10}</span>}
                    {s.date     && <span>📅 {fmtDate(s.date)}</span>}
                    {s.surgeon  && <span>👨‍⚕️ {s.surgeon}</span>}
                    {s.facility && <span>🏥 {s.facility}</span>}
                    {s.anesthesia && <span>💉 {s.anesthesia}</span>}
                    {s.duration && <span>⏱ {s.duration}</span>}
                  </div>
                  {s.notes && <div style={{ fontSize:12, color:"#7eb8d8", lineHeight:1.55 }}>{s.notes}</div>}
                </div>
                <div style={{ display:"flex", gap:8, flexShrink:0, marginLeft:16, alignItems:"center" }} className="no-print">
                  {s.fromRecords
                    ? <span style={{ fontSize:12, color:"#4a5c6a", fontFamily:"'DM Mono',monospace" }}>from Medical Records ↗</span>
                    : <>
                        <button onClick={() => setModal(s)} style={{ ...btnGhost, padding:"5px 12px", fontSize:12 }}>Edit</button>
                        <button onClick={() => setDeleteId(s.id)} style={{ padding:"5px 12px", background:"transparent", border:"1px solid rgba(239,68,68,.3)", borderRadius:7, color:"#f87171", fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>Delete</button>
                      </>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* v1.59.0: scan landing notice (calendar-sync pattern) */}
      {scanNotice && (
        <div role="alertdialog" aria-modal="true" aria-label="Possible procedures found in your records" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, width:"100%", maxWidth:460, padding:28, textAlign:"center" }}>
            <div style={{ fontSize:30, marginBottom:10 }}>✦</div>
            <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#dde8f5", fontWeight:400, marginBottom:10 }}>
              {scanNotice.count} possible procedure{scanNotice.count !== 1 ? "s" : ""} found in your records
            </h2>
            <div style={{ fontSize:13, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", lineHeight:1.6, marginBottom:20 }}>
              They're listed under <b style={{ color:"#f59e0b" }}>Suggested from your records</b> at the top of this page: 
              nothing goes on your Procedures list until you review each one.
              <b style={{ color:"#7eb8d8" }}> Confirm</b> to add it, or <b style={{ color:"#7eb8d8" }}>Dismiss</b> it.
            </div>
            <button onClick={() => setScanNotice(null)} style={{ padding:"10px 26px", background:"rgba(79,142,247,.18)", border:"1px solid rgba(79,142,247,.45)", borderRadius:9, color:"#7eb8d8", fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:600, cursor:"pointer" }}>Review them now</button>
          </div>
        </div>
      )}

      {modal && <SurgeryModal surgery={modal} onSave={handleSave} onClose={() => { setModal(null); setConfirmingSug(null); }} />}

      {deleteId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
          <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:14, padding:28, width:380 }}>
            <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#dde8f5", marginBottom:10 }}>Delete Procedure?</div>
            <div style={{ fontSize:13, color:"#98afc4", marginBottom:22 }}>This cannot be undone.</div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={() => setDeleteId(null)} style={btnGhost}>Cancel</button>
              <button onClick={() => handleDelete(deleteId)} style={{ ...btnPrimary, background:"rgba(239,68,68,.15)", borderColor:"rgba(239,68,68,.35)", color:"#f87171" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl = { display:"block", fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", marginBottom:5 };
const inp = { width:"100%", background:"#07090f", border:"1px solid #1c2a40", borderRadius:8, padding:"8px 10px", color:"#a8c4dc", fontFamily:"'DM Mono',monospace", fontSize:12, outline:"none" };
const btnPrimary = { padding:"8px 16px", background:"rgba(79,142,247,.15)", border:"1px solid rgba(79,142,247,.35)", borderRadius:8, color:"#6ea3ff", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer" };
const btnGhost   = { padding:"8px 16px", background:"transparent", border:"1px solid #1c2a40", borderRadius:8, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer" };

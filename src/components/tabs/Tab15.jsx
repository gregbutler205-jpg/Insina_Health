import { useState, useEffect, useRef, useCallback } from "react";
import PrintButton from "../PrintButton.jsx";
import { printConditionsReport } from "../../lib/printReports.js";
import { formatDateUS } from "../../lib/displaySafe.js";
import { takePendingSelect } from "../../lib/searchSelect.js";
import { tombstoneRecord } from "../../lib/recordTombstones.js";
// v1.57.0: calendar-sync-style condition suggestions — a deterministic
// text-mention scan over the record; nothing enters mi_conditions unreviewed.
import { runConditionScan, readSuggestions, dismissSuggestion, resolveSuggestion, linkSuggestionToCondition, lastScanDay, todayISO } from "../../lib/conditionSuggest.js";

const STATUS_CFG = {
  active:   { color: "#f87171", bg: "rgba(239,68,68,.10)",   border: "rgba(239,68,68,.25)",   label: "Active"   },
  managed:  { color: "#f59e0b", bg: "rgba(245,158,11,.10)",  border: "rgba(245,158,11,.25)",  label: "Managed"  },
  resolved: { color: "#2dd4a0", bg: "rgba(16,185,129,.10)",  border: "rgba(16,185,129,.25)",  label: "Resolved" },
};
const SEVERITY_CFG = {
  mild:     { color: "#2dd4a0" },
  moderate: { color: "#f59e0b" },
  severe:   { color: "#f87171" },
};
const BLANK = {
  id: null, name: "", icd10: "", diagnosedDate: "", provider: "",
  status: "active", severity: "moderate", notes: "",
};
function genId() { return Math.random().toString(36).slice(2); }
function load() {
  try { const r = localStorage.getItem("mi_conditions"); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
function save(list) {
  localStorage.setItem("mi_conditions", JSON.stringify(list));
  // Sync summary for Dashboard + AI
  const summary = list.filter(c => c.status === "active").map(c => c.name);
  localStorage.setItem("mi_conditions_summary", JSON.stringify(summary));
}
function fmtDate(iso) {
  return formatDateUS(iso, "–"); // v1.56.2: date fields read mm/dd/yyyy
}

// ── ICD-10 Lookup ──────────────────────────────────────────────────────────────
function Icd10Lookup({ value, onChange, inp }) {
  const [query, setQuery]       = useState(value || "");
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const timerRef = useRef(null);
  const wrapRef  = useRef(null);

  // Sync if parent clears the value
  useEffect(() => { setQuery(value || ""); }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((term) => {
    if (!term || term.length < 2) { setResults([]); setOpen(false); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name&terms=${encodeURIComponent(term)}&maxList=8`;
        const res  = await fetch(url);
        const data = await res.json();
        // data = [total, [codes], null, [[code, name], ...]]
        const items = (data[3] || []).map(([code, name]) => ({ code, name }));
        setResults(items);
        setOpen(items.length > 0);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
  }, []);

  function handleInput(e) {
    const v = e.target.value;
    setQuery(v);
    onChange(v);       // keep raw text in sync
    search(v);
  }

  function pick(item) {
    const combined = `${item.code}: ${item.name}`;
    setQuery(combined);
    onChange(combined);
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position:"relative" }}>
      <input
        style={inp}
        value={query}
        onChange={handleInput}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Type code or diagnosis name to search…"
      />
      {loading && (
        <div style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"#8299ad" }}>…</div>
      )}
      {open && results.length > 0 && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:8, zIndex:400, maxHeight:240, overflowY:"auto", boxShadow:"0 8px 24px rgba(0,0,0,.5)" }}>
          {results.map(item => (
            <div
              key={item.code}
              onMouseDown={() => pick(item)}
              style={{ padding:"9px 14px", cursor:"pointer", borderBottom:"1px solid #1c2a40", display:"flex", gap:10, alignItems:"flex-start" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(79,142,247,.07)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:"#6ea3ff", flexShrink:0, minWidth:52 }}>{item.code}</span>
              <span style={{ fontSize:12, color:"#c4d8ee", lineHeight:1.4 }}>{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function ConditionModal({ condition, onSave, onClose }) {
  const [form, setForm] = useState({ ...BLANK, ...condition });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // UI-29: closing a dirty form prompts before discarding.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const initialRef = useRef(JSON.stringify({ ...BLANK, ...condition }));
  const dirty = JSON.stringify(form) !== initialRef.current;
  const requestClose = () => { if (dirty) setConfirmDiscard(true); else onClose(); };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
      <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, padding:28, width:520, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:"#dde8f5", marginBottom:20 }}>
          {form.id ? "Edit Condition" : "Add Condition"}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          {/* Name */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Condition Name *</label>
            <input style={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Chronic Kidney Disease Stage 3" />
          </div>
          {/* ICD-10 */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>ICD-10 Code: type code or diagnosis name to search</label>
            <Icd10Lookup value={form.icd10} onChange={v => set("icd10", v)} inp={inp} />
          </div>
          {/* Diagnosed */}
          <div>
            <label style={lbl}>Date Diagnosed</label>
            <input style={inp} type="date" value={form.diagnosedDate} onChange={e => set("diagnosedDate", e.target.value)} />
          </div>
          {/* Provider */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Diagnosing Provider</label>
            <input style={inp} value={form.provider} onChange={e => set("provider", e.target.value)} placeholder="e.g. Dr. Ari Cohen" />
          </div>
          {/* Status */}
          <div>
            <label style={lbl}>Status</label>
            <select style={inp} value={form.status} onChange={e => set("status", e.target.value)}>
              <option value="active">Active</option>
              <option value="managed">Managed</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          {/* Severity */}
          <div>
            <label style={lbl}>Severity</label>
            <select style={inp} value={form.severity} onChange={e => set("severity", e.target.value)}>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </div>
          {/* Notes */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Notes</label>
            <textarea style={{ ...inp, height:80, resize:"vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Additional details, treatment context, etc." />
          </div>
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={requestClose} style={btnGhost}>Cancel</button>
          <button onClick={() => { if (!form.name) return; onSave({ ...form, id: form.id || genId() }); }} style={btnPrimary}>
            {form.id ? "Save Changes" : "Add Condition"}
          </button>
        </div>

        {/* UI-29: discard prompt for a dirty form */}
        {confirmDiscard && (
          <div role="alertdialog" aria-modal="true" aria-label="Discard unsaved changes?" style={{ position:"fixed", inset:0, zIndex:500, background:"rgba(8,12,20,.88)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:16, color:"#dde8f5", marginBottom:8 }}>Discard unsaved changes?</div>
              <div style={{ fontSize:12, color:"#98afc4", marginBottom:18 }}>This condition has changes that haven't been saved.</div>
              <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                <button onClick={() => setConfirmDiscard(false)} style={btnPrimary}>Keep editing</button>
                <button onClick={onClose} style={btnGhost}>Discard</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ConditionsTab() {
  const [conditions, setConditions] = useState(load);
  const [filter, setFilter]         = useState("all");
  const [modal, setModal]           = useState(null);   // null | condition obj
  const [deleteId, setDeleteId]     = useState(null);
  // UI-24: condition search + per-card expand/collapse for long notes
  const [condSearch, setCondSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  // v1.57.0: suggested conditions (own store — never mi_conditions until Confirm)
  const [suggestions, setSuggestions]   = useState(() => readSuggestions());
  const [scanMsg, setScanMsg]           = useState(null);   // inline "up to date" strip
  const [scanNotice, setScanNotice]     = useState(null);   // { count } — landing pop-up
  const [confirmingSug, setConfirmingSug] = useState(null); // suggestion being confirmed via the modal
  const autoScanRanRef = useRef(false);

  const handleScan = (auto = false) => {
    const { suggestions: next, added } = runConditionScan();
    setSuggestions(next);
    if (added > 0) {
      setScanNotice({ count: added });
    } else if (!auto) {
      setScanMsg("No new condition mentions found in your records. You're up to date.");
    }
  };

  // Auto-scan once a day on tab entry — same cadence as Calendar Sync.
  // The ran-flag is set when the scan FIRES, not when it's scheduled —
  // StrictMode's dev double-mount cancels the first timer, and arming the
  // flag early would leave the second mount blocked (scan never runs).
  useEffect(() => {
    if (autoScanRanRef.current) return;
    if (lastScanDay() === todayISO()) return;
    const t = setTimeout(() => { autoScanRanRef.current = true; handleScan(true); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!scanMsg) return;
    const t = setTimeout(() => setScanMsg(null), 6000);
    return () => clearTimeout(t);
  }, [scanMsg]);

  const openConfirmSuggestion = (sug) => {
    setConfirmingSug(sug);
    setModal({ ...BLANK, name: sug.name });
  };
  const handleDismissSuggestion = (sug) => {
    setSuggestions(dismissSuggestion(sug));
  };
  // Greg, 2026-09-11: "Same as one I have" links a suggested wording to a
  // condition already on the list (saved as an alias) so it never resurfaces.
  const [linkingSug, setLinkingSug] = useState(null);   // condId of the card showing the picker
  const [linkTarget, setLinkTarget] = useState("");
  const handleLinkSuggestion = (sug) => {
    const remaining = linkSuggestionToCondition(sug, linkTarget);
    if (remaining === null) return;
    setSuggestions(remaining);
    setConditions(load());
    setLinkingSug(null); setLinkTarget("");
    const target = conditions.find(c => String(c.id) === String(linkTarget));
    setSavedMsg(`"${sug.name}" is now another name for ${target?.name || "that condition"}.`);
  };
  const toggleExpanded = (id) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // UI-26: a search result targeting a condition filters to it and expands
  // its card (long notes are collapsed by default). Runs on mount and on the
  // event (already the visible tab).
  useEffect(() => {
    const apply = () => {
      const title = takePendingSelect("conditions");
      if (!title) return;
      setCondSearch(title);
      setFilter("all");
      const hit = load().find(c => c.name === title);
      if (hit?.id != null) setExpandedIds(prev => new Set(prev).add(hit.id));
    };
    apply();
    window.addEventListener("insina-pending-select", apply);
    return () => window.removeEventListener("insina-pending-select", apply);
  }, []);

  // UI-29: brief success confirmation, announced to screen readers.
  const [savedMsg, setSavedMsg] = useState(null);
  useEffect(() => {
    if (!savedMsg) return;
    const t = setTimeout(() => setSavedMsg(null), 4000);
    return () => clearTimeout(t);
  }, [savedMsg]);

  function handleSave(c) {
    const updated = c.id && conditions.some(x => x.id === c.id)
      ? conditions.map(x => x.id === c.id ? c : x)
      : [...conditions, c];
    setConditions(updated);
    save(updated);
    setModal(null);
    // Confirming a suggestion: the condition is saved, so retire its card.
    if (confirmingSug) {
      setSuggestions(resolveSuggestion(confirmingSug.condId));
      setConfirmingSug(null);
      setSavedMsg("Condition added from your records.");
    } else {
      setSavedMsg("Condition saved.");
    }
  }
  function handleDelete(id) {
    tombstoneRecord("mi_conditions", conditions.find(x => x.id === id));
    const updated = conditions.filter(x => x.id !== id);
    setConditions(updated);
    save(updated);
    setDeleteId(null);
  }

  const SEVERITY_ORDER = { severe: 0, moderate: 1, mild: 2 };
  const STATUS_ORDER   = { active: 0, managed: 1, resolved: 2 };
  const sortConditions = (list) => [...list].sort((a, b) => {
    const statusDiff = (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1);
    if (statusDiff !== 0) return statusDiff;
    return (SEVERITY_ORDER[a.severity] ?? 1) - (SEVERITY_ORDER[b.severity] ?? 1);
  });
  const q = condSearch.trim().toLowerCase();
  const searched = q
    ? conditions.filter(c => (c.name || "").toLowerCase().includes(q) || (c.icd10 || "").toLowerCase().includes(q) || (c.notes || "").toLowerCase().includes(q))
    : conditions;
  const filtered = sortConditions(filter === "all" ? searched : searched.filter(c => c.status === filter));
  const activeCt  = conditions.filter(c => c.status === "active").length;
  const managedCt = conditions.filter(c => c.status === "managed").length;
  const resolvedCt= conditions.filter(c => c.status === "resolved").length;

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1 }}>
      <style>{`
        * { box-sizing:border-box; }
        @media print {
          body * { visibility:hidden; }
          #conditions-print, #conditions-print * { visibility:visible; }
          #conditions-print { position:absolute; top:0; left:0; width:100%; }
          .no-print { display:none !important; }
        }
        .cond-card { background:#0b1220; border:1px solid #1c2a40; border-radius:12px; padding:16px 18px; margin-bottom:10px; transition:border-color .15s; }
        .cond-card:hover { border-color:#1a2f4a; }
        .filter-btn { padding:6px 14px; border-radius:20px; border:1px solid #1c2a40; background:transparent; color:#b0c4d8; font-family:'DM Mono',monospace; font-size:12px; cursor:pointer; transition:all .15s; }
        .filter-btn.active { background:rgba(79,142,247,.15); border-color:rgba(79,142,247,.4); color:#6ea3ff; }
      `}</style>

      <div id="conditions-print" style={{ padding:"24px 28px", overflowY:"auto", flex:1 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:22 }} className="no-print">
          <div>
            <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:28, color:"#dde8f5", fontWeight:400, letterSpacing:"-0.5px" }}>Conditions</h1>
            <p style={{ fontSize:12, color:"#98afc4", marginTop:4, fontFamily:"'DM Mono',monospace" }}>
              {activeCt} active · {managedCt} managed · {resolvedCt} resolved
            </p>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => handleScan(false)} style={btnGhost} title="Scan Diagnostics, Notes, Records, Procedures, and imported documents for condition mentions">⟳ Scan Records</button>
            <PrintButton reportType="conditions" onPrint={() => printConditionsReport(conditions)} />
            <button onClick={() => setModal(BLANK)} style={btnPrimary}>+ Add Condition</button>
          </div>
        </div>

        {/* v1.57.0: scan result strip (mirrors the calendar-sync message) */}
        {scanMsg && (
          <div role="status" aria-live="polite" className="no-print" style={{ padding:"8px 14px", borderRadius:9, fontSize:12, fontFamily:"'DM Mono',monospace", background:"rgba(79,142,247,.08)", border:"1px solid rgba(79,142,247,.25)", color:"#7eb8d8", marginBottom:16 }}>
            {scanMsg}
          </div>
        )}

        {/* v1.57.0: suggested conditions — found in the record, pending review */}
        {suggestions.length > 0 && (
          <div className="no-print" style={{ background:"rgba(245,158,11,.05)", border:"1px solid rgba(245,158,11,.25)", borderRadius:12, padding:"16px 18px", marginBottom:22 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:12, color:"#f59e0b" }}>✦</span>
              <span style={{ fontSize:12, color:"#f59e0b", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", fontWeight:600 }}>
                Suggested from your records ({suggestions.length})
              </span>
            </div>
            <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'Sora',sans-serif", marginBottom:14, lineHeight:1.5 }}>
              These condition names appear in your records but aren't on your Conditions list. Nothing is added until you review it: 
              Confirm to add one (you can edit details first), Dismiss it so it isn't suggested again, or mark it as the same as a condition you already have.
            </div>
            {suggestions.map(sug => (
              <div key={sug.condId} style={{ background:"#0b1220", border:"1px solid rgba(245,158,11,.18)", borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:160 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:"#dde8f5" }}>{sug.name}</div>
                    {sug.refines && <div style={{ fontSize:12, color:"#a8c4dc", marginTop:2 }}>More specific than {sug.refines}, which is already on your list.</div>}
                  </div>
                  <button onClick={() => openConfirmSuggestion(sug)} style={{ padding:"6px 14px", background:"rgba(16,185,129,.12)", border:"1px solid rgba(16,185,129,.35)", borderRadius:8, color:"#2dd4a0", fontFamily:"'Sora',sans-serif", fontSize:12, fontWeight:600, cursor:"pointer" }}>Confirm &amp; review</button>
                  <button onClick={() => handleDismissSuggestion(sug)} style={{ padding:"6px 14px", background:"transparent", border:"1px solid #1a2f4a", borderRadius:8, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer" }}>Dismiss</button>
                  {conditions.length > 0 && (
                    <button onClick={() => { setLinkingSug(linkingSug === sug.condId ? null : sug.condId); setLinkTarget(""); }} aria-expanded={linkingSug === sug.condId}
                      style={{ padding:"6px 14px", background:"transparent", border:"1px solid #1a2f4a", borderRadius:8, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer" }}>Same as one I have</button>
                  )}
                </div>
                {linkingSug === sug.condId && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginTop:10, padding:"10px 12px", background:"#07090f", border:"1px solid #1c2a40", borderRadius:8 }}>
                    <label htmlFor={`same-as-${sug.condId}`} style={{ fontSize:12, color:"#c4d8ee" }}>Which condition on your list is this?</label>
                    <select id={`same-as-${sug.condId}`} value={linkTarget} onChange={e => setLinkTarget(e.target.value)}
                      style={{ minHeight:36, padding:"4px 8px", background:"#0b1220", color:"#dde8f5", border:"1px solid #1c2a40", borderRadius:6, fontSize:13, fontFamily:"'Sora',sans-serif" }}>
                      <option value="">Choose one</option>
                      {conditions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button disabled={!linkTarget} onClick={() => handleLinkSuggestion(sug)}
                      style={{ padding:"6px 14px", background: linkTarget ? "rgba(79,142,247,.15)" : "transparent", border:"1px solid rgba(79,142,247,.4)", borderRadius:8, color: linkTarget ? "#9ecbff" : "#6f8aa5", fontFamily:"'Sora',sans-serif", fontSize:12, fontWeight:600, cursor: linkTarget ? "pointer" : "default" }}>Link</button>
                    <button onClick={() => { setLinkingSug(null); setLinkTarget(""); }} style={{ padding:"6px 10px", background:"transparent", border:"none", color:"#98afc4", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer" }}>Cancel</button>
                    <div style={{ flexBasis:"100%", fontSize:11, color:"#8299ad", fontFamily:"'DM Mono',monospace" }}>The name from your records is saved as another name for that condition. Nothing else changes.</div>
                  </div>
                )}
                <div style={{ marginTop:8 }}>
                  {sug.sources.slice(0, 3).map((s, i) => (
                    <div key={i} style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", lineHeight:1.6, marginBottom:2 }}>
                      <span style={{ color:"#f59e0b" }}>{s.store}</span>
                      {": "}{s.title}{s.date ? ` (${formatDateUS(s.date)})` : ""}
                      {s.snippet ? <span style={{ color:"#8299ad" }}>{" · “"}{s.snippet}{"”"}</span> : null}
                    </div>
                  ))}
                  {sug.sources.length > 3 && (
                    <div style={{ fontSize:12, color:"#8299ad", fontFamily:"'DM Mono',monospace" }}>+ {sug.sources.length - 3} more place{sug.sources.length - 3 !== 1 ? "s" : ""} in your records</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* UI-29: save confirmation strip */}
        {savedMsg && (
          <div role="status" aria-live="polite" className="no-print" style={{ padding:"8px 14px", borderRadius:9, fontSize:12, fontFamily:"'DM Mono',monospace", background:"rgba(16,185,129,.08)", border:"1px solid rgba(16,185,129,.25)", color:"#2dd4a0", marginBottom:16 }}>
            ✓ {savedMsg}
          </div>
        )}

        {/* Print header (only visible when printing) */}
        <div style={{ display:"none" }} className="print-only">
          <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, marginBottom:4 }}>Medical Conditions</h2>
          <p style={{ fontSize:12, color:"#666", marginBottom:20 }}>Printed {new Date().toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}</p>
        </div>

        {/* Summary stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:22 }}>
          {[
            { label:"Active",   count:activeCt,   ...STATUS_CFG.active   },
            { label:"Managed",  count:managedCt,  ...STATUS_CFG.managed  },
            { label:"Resolved", count:resolvedCt, ...STATUS_CFG.resolved },
          ].map(s => (
            <div key={s.label} style={{ background:"#0b1220", border:"1px solid #1c2a40", borderRadius:10, padding:"14px 16px" }}>
              <div style={{ fontSize:22, fontWeight:700, color:s.color, letterSpacing:"-0.5px" }}>{s.count}</div>
              <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters + search (UI-24) */}
        <div style={{ display:"flex", gap:8, marginBottom:18, alignItems:"center", flexWrap:"wrap" }} className="no-print">
          {["all","active","managed","resolved"].map(f => (
            <button key={f} className={`filter-btn${filter===f?" active":""}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
          <input
            value={condSearch}
            onChange={e => setCondSearch(e.target.value)}
            placeholder="Search conditions…"
            style={{ flex:1, minWidth:160, background:"#0b1220", border:"1px solid #1c2a40", borderRadius:8, padding:"7px 12px", color:"#c4d8ee", fontFamily:"'Sora',sans-serif", fontSize:12, outline:"none" }}
          />
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"48px 0", color:"#a0b4c8", fontFamily:"'DM Mono',monospace", fontSize:12 }}>
            {conditions.length === 0 ? "No conditions added yet. Click Add Condition to get started." : `No ${filter} conditions.`}
          </div>
        ) : (
          filtered.map(c => {
            const s = STATUS_CFG[c.status] ?? STATUS_CFG.active;
            const sev = SEVERITY_CFG[c.severity] ?? SEVERITY_CFG.moderate;
            return (
              <div key={c.id} className="cond-card">
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                      <span style={{ fontSize:15, fontWeight:600, color:"#c4d8ee" }}>{c.name}</span>
                      {Array.isArray(c.aliases) && c.aliases.length > 0 && (
                        <span style={{ fontSize:12, color:"#8299ad", fontFamily:"'DM Mono',monospace" }} title="Other names for this condition found in your records">also: {c.aliases.join(", ")}</span>
                      )}
                      {c.icd10 && <span style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", background:"#07090f", border:"1px solid #1c2a40", borderRadius:4, padding:"1px 6px" }}>{c.icd10}</span>}
                      <span style={{ fontSize:12, background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:"2px 8px", color:s.color, fontFamily:"'DM Mono',monospace" }}>{s.label}</span>
                      <span style={{ fontSize:12, color:sev.color, fontFamily:"'DM Mono',monospace" }}>▪ {c.severity.charAt(0).toUpperCase()+c.severity.slice(1)}</span>
                    </div>
                    <div style={{ display:"flex", gap:20, fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", marginBottom:c.notes?8:0 }}>
                      {c.diagnosedDate && <span>Dx: {fmtDate(c.diagnosedDate)}</span>}
                      {c.provider && <span>Provider: {c.provider}</span>}
                    </div>
                    {/* UI-24: long details collapse so cards stay short */}
                    {c.notes && (() => {
                      const LONG = 140;
                      const isLong = c.notes.length > LONG;
                      const open = expandedIds.has(c.id);
                      return (
                        <div style={{ fontSize:12, color:"#7eb8d8", marginTop:4, lineHeight:1.55 }}>
                          {isLong && !open ? `${c.notes.slice(0, LONG).trimEnd()}…` : c.notes}
                          {isLong && (
                            <button onClick={() => toggleExpanded(c.id)} className="no-print"
                              style={{ marginLeft:8, background:"none", border:"none", color:"var(--accent-blue)", fontSize:12, fontFamily:"'DM Mono',monospace", cursor:"pointer", padding:0 }}>
                              {open ? "Show less" : "Show more"}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{ display:"flex", gap:8, flexShrink:0, marginLeft:16 }} className="no-print">
                    <button onClick={() => setModal(c)} style={{ ...btnGhost, padding:"5px 12px", fontSize:12 }}>Edit</button>
                    <button onClick={() => setDeleteId(c.id)} style={{ padding:"5px 12px", background:"transparent", border:"1px solid rgba(239,68,68,.3)", borderRadius:7, color:"#f87171", fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>Delete</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add/Edit modal */}
      {/* v1.57.0: scan landing notice — mirrors the calendar-sync pop-up */}
      {scanNotice && (
        <div role="alertdialog" aria-modal="true" aria-label="Possible conditions found in your records" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, width:"100%", maxWidth:460, padding:28, textAlign:"center" }}>
            <div style={{ fontSize:30, marginBottom:10 }}>✦</div>
            <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#dde8f5", fontWeight:400, marginBottom:10 }}>
              {scanNotice.count} possible condition{scanNotice.count !== 1 ? "s" : ""} found in your records
            </h2>
            <div style={{ fontSize:13, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", lineHeight:1.6, marginBottom:20 }}>
              They're listed under <b style={{ color:"#f59e0b" }}>Suggested from your records</b> at the top of this page: 
              nothing goes on your Conditions list until you review each one.
              <b style={{ color:"#7eb8d8" }}> Confirm</b> to add it, or <b style={{ color:"#7eb8d8" }}>Dismiss</b> it.
            </div>
            <button
              onClick={() => setScanNotice(null)}
              style={{ padding:"10px 26px", background:"rgba(79,142,247,.18)", border:"1px solid rgba(79,142,247,.45)", borderRadius:9, color:"#7eb8d8", fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:600, cursor:"pointer" }}
            >Review them now</button>
          </div>
        </div>
      )}

      {modal && <ConditionModal condition={modal} onSave={handleSave} onClose={() => { setModal(null); setConfirmingSug(null); }} />}

      {/* Delete confirm */}
      {deleteId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
          <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:14, padding:28, width:380 }}>
            <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#dde8f5", marginBottom:10 }}>Delete Condition?</div>
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

// ── Shared styles ──────────────────────────────────────────────────────────────
const lbl = { display:"block", fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", marginBottom:5 };
const inp = { width:"100%", background:"#07090f", border:"1px solid #1c2a40", borderRadius:8, padding:"8px 10px", color:"#a8c4dc", fontFamily:"'DM Mono',monospace", fontSize:12, outline:"none" };
const btnPrimary = { padding:"8px 16px", background:"rgba(79,142,247,.15)", border:"1px solid rgba(79,142,247,.35)", borderRadius:8, color:"#6ea3ff", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer" };
const btnGhost   = { padding:"8px 16px", background:"transparent", border:"1px solid #1c2a40", borderRadius:8, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer" };

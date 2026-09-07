// ── Lab batch review (WO_LAB_BATCH_CONFIRM_01 / DEC-P43) ───────────────────
// Row-level review of one extracted lab/vitals document before anything
// reaches the reconciled record. Left pane: the source document's pages
// (rendered from the in-session File; on a later revisit the file is gone and
// a fallback panel points at Source Documents / the Drive archive copy).
// Right pane: one row per analyte — include/exclude, inline correction with
// originals preserved, flag badges, and per-row acknowledgment. The confirm
// control stays disabled until every included flagged row is acknowledged.
//
// Cancel persists the working state (toggles + corrections) back to the
// archive: exclusion is not deletion, and the document re-enters this same
// flow from the Import Records screen.

import { useState, useEffect, useRef } from "react";
import { loadPdfjs } from "../lib/pdfjs.js";
import {
  confirmGate, confirmDoc, persistConfirmation, upsertArchiveDoc,
  applyCorrection, setRowIncluded,
} from "../lib/labBatchConfirm.js";

const FLAG_LABELS = {
  out_of_range: "OUT OF RANGE",
  low_confidence: "LOW CONFIDENCE",
  monitored_analyte: "MONITORED",
};

const mono = "'DM Mono',monospace";

export default function LabBatchReview({ doc, file, onDone, onClose }) {
  const [rows, setRows] = useState(doc.rows);
  const [acks, setAcks] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [pages, setPages] = useState(null); // null = rendering/none, [] = failed, [dataUrl...] = rendered
  const cancelled = useRef(false);

  // Render source pages from the in-session file (capped — review, not archival).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!file) { setPages([]); return; }
      try {
        const pdfjsLib = await loadPdfjs();
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const n = Math.min(pdf.numPages, 12);
        const out = [];
        for (let i = 1; i <= n; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.15 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          out.push(canvas.toDataURL("image/jpeg", 0.82));
          if (!alive) return;
        }
        if (alive) setPages(out);
      } catch { if (alive) setPages([]); }
    })();
    return () => { alive = false; };
  }, [file]);

  const workingDoc = { ...doc, rows };
  const gate = confirmGate(workingDoc, acks);

  function toggleInclude(row) {
    setRows(rs => rs.map(r => (r.id === row.id ? setRowIncluded(r, r.state === "excluded") : r)));
    // Un-including removes any acknowledgment (it belongs to the included decision).
    setAcks(a => { const next = new Set(a); next.delete(row.id); return next; });
  }
  function toggleAck(rowId) {
    setAcks(a => { const next = new Set(a); next.has(rowId) ? next.delete(rowId) : next.add(rowId); return next; });
  }
  function startEdit(row) {
    setEditingId(row.id);
    setEditVals({ value: String(row.value ?? ""), unit: row.unit || "", date: row.date || "" });
  }
  function saveEdit(row) {
    setRows(rs => rs.map(r => (r.id === row.id ? applyCorrection(r, editVals) : r)));
    setEditingId(null);
    // The corrected value may change the out-of-range flag — any prior
    // acknowledgment was for the old value, so it resets.
    setAcks(a => { const next = new Set(a); next.delete(row.id); return next; });
  }

  function handleCancel() {
    cancelled.current = true;
    upsertArchiveDoc(workingDoc); // exclusion is not deletion — state persists for revisit
    onClose();
  }
  function handleConfirm() {
    if (!gate.canConfirm) return;
    const result = confirmDoc(workingDoc, acks);
    const stamped = persistConfirmation(result);
    onDone({ ...result, doc: stamped });
  }

  const flagged = r => r.flags.length > 0;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.8)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, width:"min(1500px, 98vw)", height:"min(880px, 94vh)", display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"16px 20px", borderBottom:"1px solid #1c2a40", flexWrap:"wrap" }}>
          <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#dde8f5", flex:1, minWidth:200 }}>
            Review before adding to your record
          </div>
          <div style={{ fontSize:12, color:"#98afc4", fontFamily:mono }}>{doc.title}</div>
        </div>

        {/* Body: source left, rows right */}
        <div style={{ display:"flex", flex:1, minHeight:0 }}>
          <div style={{ width:"42%", minWidth:280, borderRight:"1px solid #1c2a40", overflowY:"auto", padding:14, background:"#07090f" }}>
            <div style={{ fontSize:12, letterSpacing:"1.5px", textTransform:"uppercase", color:"#a0b4c8", fontFamily:mono, marginBottom:10 }}>Source Document</div>
            {pages === null && <div style={{ fontSize:12, color:"#98afc4", fontFamily:mono, padding:"20px 0", textAlign:"center" }}>Rendering pages…</div>}
            {pages && pages.length === 0 && (
              <div style={{ fontSize:12, color:"#98afc4", fontFamily:mono, lineHeight:1.7, background:"#0b1220", border:"1px solid #1c2a40", borderRadius:10, padding:"14px 16px" }}>
                The original file isn't held in this session{doc.fileName ? ` (${doc.fileName})` : ""}.
                Open it from Source Documents or your Drive report archive to compare against the rows.
              </div>
            )}
            {pages && pages.map((src, i) => (
              <img key={i} src={src} alt={`page ${i + 1}`} style={{ width:"100%", borderRadius:6, border:"1px solid #1c2a40", marginBottom:10 }} />
            ))}
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>
            <div style={{ fontSize:12, letterSpacing:"1.5px", textTransform:"uppercase", color:"#a0b4c8", fontFamily:mono, marginBottom:10 }}>
              Extracted rows: include, correct, acknowledge
            </div>

            {rows.filter(r => r.state !== "promoted").map(r => {
              const included = r.state === "pending";
              const isMonitored = r.flags.includes("monitored_analyte");
              const border = flagged(r) && included
                ? (acks.has(r.id) ? "1px solid rgba(16,185,129,.35)" : `1px solid ${isMonitored && r.flags.length === 1 ? "rgba(79,142,247,.45)" : "rgba(245,158,11,.45)"}`)
                : "1px solid #111e30";
              return (
                <div key={r.id} style={{ background: included ? "#0b1220" : "#080c14", border, borderRadius:10, padding:"10px 14px", marginBottom:8, opacity: included ? 1 : 0.62 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                    <label style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", flexShrink:0 }}>
                      <input type="checkbox" checked={included} onChange={() => toggleInclude(r)} style={{ accentColor:"#6ea3ff", width:14, height:14 }} />
                      <span style={{ fontSize:12, color: included ? "#7eb8d8" : "#6a8090", fontFamily:mono }}>{included ? "include" : "excluded"}</span>
                    </label>
                    <span style={{ fontSize:13, fontWeight:600, color: isMonitored ? "#6ea3ff" : "#c4d8ee", minWidth:120 }}>{r.name}</span>
                    {r.flags.map(f => (
                      <span key={f} style={{ fontSize:12, fontFamily:mono, borderRadius:9, padding:"1px 8px",
                        background: f === "monitored_analyte" ? "rgba(79,142,247,.12)" : "rgba(245,158,11,.12)",
                        color: f === "monitored_analyte" ? "#6ea3ff" : "#f59e0b",
                        border: `1px solid ${f === "monitored_analyte" ? "rgba(79,142,247,.35)" : "rgba(245,158,11,.35)"}` }}>
                        {FLAG_LABELS[f] || f}
                      </span>
                    ))}
                    {r.correction && <span style={{ fontSize:12, fontFamily:mono, color:"#2dd4a0", border:"1px solid rgba(16,185,129,.3)", borderRadius:9, padding:"1px 8px" }}>CORRECTED</span>}
                  </div>

                  {editingId === r.id ? (
                    <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap", alignItems:"center" }}>
                      {["value", "unit", "date"].map(k => (
                        <input key={k} value={editVals[k]} onChange={e => setEditVals(v => ({ ...v, [k]: e.target.value }))}
                          placeholder={k} type={k === "date" ? "date" : "text"}
                          style={{ background:"#07090f", border:"1px solid #1a2f4a", borderRadius:7, padding:"5px 9px", color:"#c4d8ee", fontFamily:mono, fontSize:12, width: k === "value" ? 90 : k === "unit" ? 80 : 140 }} />
                      ))}
                      <button onClick={() => saveEdit(r)} style={btn("#6ea3ff")}>Save</button>
                      <button onClick={() => setEditingId(null)} style={btn("#98afc4")}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display:"flex", gap:16, marginTop:6, flexWrap:"wrap", alignItems:"baseline", fontFamily:mono }}>
                      <span style={{ fontSize:14, fontWeight:700, color: r.flags.includes("out_of_range") ? "#f59e0b" : "#2dd4a0" }}>
                        {String(r.value)}{r.unit ? ` ${r.unit}` : ""}
                      </span>
                      {r.refRange && <span style={{ fontSize:12, color:"#98afc4" }}>ref {r.refRange}</span>}
                      {r.date && <span style={{ fontSize:12, color:"#98afc4" }}>{r.date}</span>}
                      <span style={{ fontSize:12, color:"#6a8090" }}>{r.category}</span>
                      {included && (
                        <button onClick={() => startEdit(r)} style={{ background:"transparent", border:"none", color:"#4a6a8a", cursor:"pointer", fontSize:12, fontFamily:mono, textDecoration:"underline", padding:0 }}>
                          correct
                        </button>
                      )}
                      {r.correction && (
                        <span style={{ fontSize:12, color:"#6a8090" }}>
                          was {String(r.correction.originalValue)}{r.correction.originalUnit ? ` ${r.correction.originalUnit}` : ""}
                        </span>
                      )}
                    </div>
                  )}

                  {flagged(r) && included && (
                    <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, cursor:"pointer" }}>
                      <input type="checkbox" checked={acks.has(r.id)} onChange={() => toggleAck(r.id)} style={{ accentColor:"#f59e0b", width:13, height:13 }} />
                      <span style={{ fontSize:12, color: acks.has(r.id) ? "#2dd4a0" : "#f59e0b", fontFamily:mono }}>
                        I've reviewed this {r.flags.includes("monitored_analyte") ? "monitored" : "flagged"} value against the source document
                      </span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer: summary + gated confirm */}
        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 20px", borderTop:"1px solid #1c2a40", flexWrap:"wrap" }}>
          <div style={{ flex:1, fontSize:12, color:"#98afc4", fontFamily:mono, minWidth:220 }}>
            {gate.summary.promoteCount} row{gate.summary.promoteCount !== 1 ? "s" : ""} will be added to your record · {gate.summary.excludeCount} excluded
            {gate.unacknowledged.length > 0 && (
              <span style={{ color:"#f59e0b" }}> · {gate.unacknowledged.length} flagged row{gate.unacknowledged.length !== 1 ? "s" : ""} need{gate.unacknowledged.length === 1 ? "s" : ""} acknowledgment</span>
            )}
          </div>
          <button onClick={handleCancel} style={{ padding:"9px 18px", background:"transparent", border:"1px solid #1c2a40", borderRadius:8, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer" }}>
            Review later
          </button>
          <button onClick={handleConfirm} disabled={!gate.canConfirm}
            style={{ padding:"9px 22px", borderRadius:8, fontFamily:"'Sora',sans-serif", fontSize:12, fontWeight:600,
              background: gate.canConfirm ? "rgba(16,185,129,.15)" : "rgba(16,185,129,.05)",
              border: `1px solid ${gate.canConfirm ? "rgba(16,185,129,.4)" : "rgba(16,185,129,.15)"}`,
              color: gate.canConfirm ? "#2dd4a0" : "#2a4a3a", cursor: gate.canConfirm ? "pointer" : "not-allowed" }}>
            ✓ Confirm batch
          </button>
        </div>
      </div>
    </div>
  );
}

const btn = (color) => ({ padding:"5px 12px", background:"transparent", border:`1px solid ${color}40`, borderRadius:7, color, fontFamily:mono, fontSize:12, cursor:"pointer" });

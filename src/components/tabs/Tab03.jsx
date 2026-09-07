import { useState } from "react";
import { formatDateUS } from "../../lib/displaySafe.js";

import { getRecords, setRecords } from "../../store.js";
import { tombstoneRecord } from "../../lib/recordTombstones.js";
import { sanitizeReportUrl } from "../../lib/driveReports.js";

const TYPE_COLORS = {
  "Visit Note": "#4f8ef7",
  "Lab Report": "#10b981",
  "Imaging":    "#a78bfa",
  "Procedure":  "#f59e0b",
  "Hospital":   "#ef4444",
};

const FILTERS = ["All", "Visit Note", "Lab Report", "Imaging", "Procedure", "Hospital"];

function Badge({ type }) {
  const c = TYPE_COLORS[type] || "#4f8ef7";
  return (
    <span style={{
      fontSize: 12, fontFamily: "'DM Mono',monospace",
      background: `${c}18`, color: c, border: `1px solid ${c}30`,
      padding: "2px 7px", borderRadius: 4, letterSpacing: "0.5px",
      textTransform: "uppercase", flexShrink: 0,
    }}>
      {type}
    </span>
  );
}

export default function Records({ onNavChange }) {
  const [records, setRecordsState] = useState(() => getRecords());
  const [filter, setFilter]     = useState("All");
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(() => getRecords()[0] ?? null);
  const [showAdd, setShowAdd]   = useState(false);
  const [addType, setAddType]   = useState(null);
  const [addForm, setAddForm]   = useState({ title: "", facility: "", provider: "", date: "" });
  const [deleteId, setDeleteId] = useState(null);
  // UI-19: inline source-document viewer toggle (reset per selection)
  const [showSourceDoc, setShowSourceDoc] = useState(false);

  // UI-19: look up the Source Document an imported record links to.
  function getRefDoc(refDocId) {
    try { return (JSON.parse(localStorage.getItem("mi_ref_docs") || "[]")).find(d => d.id === refDocId) || null; } catch { return null; }
  }

  // ── Ask AI about a record ─────────────────────────────────────────────────
  const handleAskAI = (record) => {
    let docId = null;
    try {
      const refDocs = JSON.parse(localStorage.getItem("mi_ref_docs") || "[]");
      // 1. Prefer the directly-linked ref doc (set when user clicked "Interpret with AI ▸")
      if (record.refDocId) {
        const linked = refDocs.find(d => d.id === record.refDocId);
        if (linked) docId = linked.id;
      }
      // 2. Fall back to a ref doc with the same name
      if (!docId) {
        const byName = refDocs.find(d => d.name === record.title);
        if (byName) docId = byName.id;
      }
      // 3. Build a ref doc from whatever metadata + summary we have
      if (!docId) {
        const newId = Date.now().toString();
        const text = [
          `Document: ${record.title}`,
          record.type     && `Type: ${record.type}`,
          record.date     && `Date: ${record.date}`,
          record.facility && `Facility: ${record.facility}`,
          record.provider && `Provider: ${record.provider}`,
          "",
          record.summary || "(No summary available)",
        ].filter(Boolean).join("\n");
        const newDoc = { id: newId, name: record.title, text, addedDate: new Date().toLocaleDateString() };
        localStorage.setItem("mi_ref_docs", JSON.stringify([newDoc, ...refDocs]));
        docId = newId;
      }
    } catch { return; }
    localStorage.setItem("mi_auto_analyze_doc", docId);
    if (onNavChange) onNavChange("ai");
  };

  // v1.48.0: attach/replace the link to the original report in the patient's
  // own Drive. Auto-filled by the import pass-through; this hand path covers
  // reports the patient uploaded to Drive directly (invisible to the app's
  // deliberately narrow drive.file scope). updatedAt stamp = DEC-046 opt-in
  // so the edit survives a two-device sync.
  function editReportLink(rec) {
    const entered = window.prompt("Paste the report's link (https…: Google Drive “Copy link” works; empty clears):", rec.reportLink || "");
    if (entered === null) return;
    const clean = sanitizeReportUrl(entered);
    if (entered.trim() && !clean) { alert("Only https:// links can be saved."); return; }
    const patched = { ...rec, reportLink: clean, updatedAt: Date.now() };
    const next = records.map(r => r.id === rec.id ? patched : r);
    setRecords(next);
    setRecordsState(next);
    setSelected(patched);
  }

  const filtered = records.filter(r => {
    const matchType   = filter === "All" || r.type === filter;
    const matchSearch = !search
      || r.title.toLowerCase().includes(search.toLowerCase())
      || r.provider.toLowerCase().includes(search.toLowerCase())
      || r.facility.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#07090f", fontFamily: "'Sora',sans-serif", color: "#d4e2f0", overflow: "hidden", position: "relative" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #1a2840; border-radius: 4px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .rec-row { padding: 13px 16px; border-bottom: 1px solid #1c2a40; cursor: pointer; transition: background .1s; border-left: 2px solid transparent; }
        .rec-row:hover { background: #0b1220; }
        .rec-row.active { background: #0d1525; border-left-color: #6ea3ff; }
        .filter-chip { padding: 5px 13px; border-radius: 20px; font-size: 12px; border: 1px solid #1c2a40; background: #0b1220; color: #b0c4d8; cursor: pointer; transition: all .15s; font-family: 'DM Mono',monospace; white-space: nowrap; }
        .filter-chip:hover { color: #7eb8d8; border-color: #1a2f4a; }
        .filter-chip.active { color: #6ea3ff; border-color: #6ea3ff; background: rgba(79,142,247,.08); }
        .type-chip { padding: 5px 13px; border-radius: 20px; font-size: 12px; border: 1px solid #1c2a40; background: #0b1220; color: #b0c4d8; cursor: pointer; transition: all .15s; font-family: 'DM Mono',monospace; white-space: nowrap; }
        .type-chip:hover { color: #7eb8d8; border-color: #1a2f4a; }
        .type-chip.active { color: #6ea3ff; border-color: #6ea3ff; background: rgba(79,142,247,.08); }
        .detail-line { display: flex; align-items: flex-start; gap: 8px; padding: 8px 0; border-bottom: 1px solid #1c2a40; font-size: 12px; }
        .detail-line:last-child { border-bottom: none; }
        .search-input { background: #0b1220; border: 1px solid #1c2a40; color: #c4d8ee; padding: 7px 12px 7px 32px; border-radius: 8px; font-family: 'Sora',sans-serif; font-size: 12px; outline: none; width: 220px; transition: border-color .15s; }
        .search-input::placeholder { color: #98afc4; }
        .search-input:focus { border-color: #1a2f4a; }
        .modal-input { width: 100%; background: #07090f; border: 1px solid #1c2a40; color: #c4d8ee; padding: 8px 12px; border-radius: 8px; font-family: 'Sora',sans-serif; font-size: 12px; outline: none; transition: border-color .15s; }
        .modal-input::placeholder { color: #a0b4c8; }
        .modal-input:focus { border-color: #1a2f4a; }
        .epic-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; background: rgba(79,142,247,.08); border: 1px solid rgba(79,142,247,.25); border-radius: 8px; color: #6ea3ff; font-size: 12px; font-family: 'DM Mono',monospace; cursor: pointer; transition: all .15s; text-decoration: none; }
        .epic-btn:hover { background: rgba(79,142,247,.15); border-color: rgba(79,142,247,.4); }
        .add-badge-btn { display: inline-flex; align-items: center; gap: 5px; padding: 4px 11px; background: rgba(79,142,247,.08); border: 1px solid rgba(79,142,247,.25); border-radius: 12px; color: #6ea3ff; font-size: 12px; font-family: 'DM Mono',monospace; cursor: pointer; transition: all .15s; letter-spacing: 0.3px; }
        .add-badge-btn:hover { background: rgba(79,142,247,.16); border-color: rgba(79,142,247,.45); }
      `}</style>

      {/* Topbar */}
      <div style={{ height: 54, background: "#080c14", borderBottom: "1px solid #1c2a40", display: "flex", alignItems: "center", padding: "0 24px", gap: 12, flexShrink: 0 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: "#dde8f5", fontWeight: 400, letterSpacing: "-0.3px" }}>
          Medical Records
        </div>
        <button className="add-badge-btn" onClick={() => setShowAdd(true)}>
          <span style={{ fontSize: 15, lineHeight: 1, marginTop: -1 }}>+</span>
          Add Record
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: 10, fontSize: 13, color: "#98afc4" }}>⌕</span>
          <input
            className="search-input"
            placeholder="Search records…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", background: "#0b1220", border: "1px solid #1c2a40", padding: "5px 12px", borderRadius: 6 }}>
          {records.length} records · Epic FHIR
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ background: "#080c14", borderBottom: "1px solid #1c2a40", padding: "10px 24px", display: "flex", gap: 8, flexShrink: 0, overflowX: "auto", alignItems: "center" }}>
        {FILTERS.map(f => (
          <button key={f} className={`filter-chip${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#1e4030", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block", boxShadow: "0 0 6px #10b981" }} />
          Epic connected
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Record list */}
        <div style={{ width: 320, minWidth: 320, borderRight: "1px solid #1c2a40", overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>
              No records found
            </div>
          )}
          {filtered.map(r => (
            <div
              key={r.id}
              className={`rec-row${selected?.id === r.id ? " active" : ""}`}
              onClick={() => { setSelected(r); setShowSourceDoc(false); }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7, gap: 8 }}>
                <Badge type={r.type} />
                <span style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{formatDateUS(r.date)}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#c4d8ee", marginBottom: 3, lineHeight: 1.3 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>{r.facility}</div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected ? (
          <div key={selected.id} style={{ flex: 1, overflowY: "auto", padding: 28, animation: "fadeUp .25s ease both" }}>

            {/* Header */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Badge type={selected.type} />
                <span style={{ fontSize: 12, color: "#b0c4d8", fontFamily: "'DM Mono',monospace" }}>{formatDateUS(selected.date)}</span>
              </div>
              <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, color: "#dde8f5", fontWeight: 400, letterSpacing: "-0.3px", marginBottom: 10 }}>
                {selected.title}
              </h2>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                {selected.facility && <div style={{ fontSize: 12, color: "#b0c4d8", fontFamily: "'DM Mono',monospace" }}>{selected.facility}</div>}
                {selected.provider && <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>{selected.provider}</div>}
                {/* UI-19: truthful metadata — the old "Open in Epic" pointed at a
                    fake example.com URL; the id is shown as plain text instead. */}
                {selected.epicId && (
                  <span style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", background: "#0b1220", border: "1px solid #1c2a40", padding: "2px 8px", borderRadius: 5 }}>
                    Epic ID: {selected.epicId}
                  </span>
                )}
                <button
                  onClick={() => handleAskAI(selected)}
                  style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "rgba(79,142,247,.1)", border: "1px solid rgba(79,142,247,.3)", borderRadius: 7, color: "#6ea3ff", fontSize: 12, fontFamily: "'DM Mono',monospace", cursor: "pointer" }}
                >
                  ✦ Ask AI
                </button>
                <button
                  onClick={() => setDeleteId(selected.id)}
                  style={{ padding: "5px 12px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 7, color: "#f87171", fontSize: 12, fontFamily: "'DM Mono',monospace", cursor: "pointer" }}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* UI-19: source line — truthful label, always present */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16, fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>
              <span>
                Source: {selected.source || (selected.refDocId ? "Imported from PDF" : selected.epicId ? "Imported from Epic export" : "Entered manually")}
              </span>
              {selected.addedAt && (
                <span style={{ color: "#6a8090" }}>· Added {new Date(selected.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              )}
              {selected.refDocId && getRefDoc(selected.refDocId) && (
                <button onClick={() => setShowSourceDoc(s => !s)}
                  style={{ background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.3)", borderRadius: 6, color: "#a78bfa", fontSize: 12, fontFamily: "'DM Mono',monospace", padding: "3px 10px", cursor: "pointer" }}>
                  {showSourceDoc ? "Hide source document" : "View source document →"}
                </button>
              )}
              {/* v1.48.0: original report in the patient's own Drive */}
              {sanitizeReportUrl(selected.reportLink) && (
                <a href={sanitizeReportUrl(selected.reportLink)} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#7eb8d8", background: "rgba(79,142,247,.08)", border: "1px solid rgba(79,142,247,.25)", borderRadius: 6, fontSize: 12, fontFamily: "'DM Mono',monospace", padding: "3px 10px", textDecoration: "none" }}>
                  Open original report ↗
                </a>
              )}
              <button onClick={() => editReportLink(selected)}
                style={{ background: "transparent", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 12, fontFamily: "'DM Mono',monospace", padding: 0, textDecoration: "underline" }}>
                {selected.reportLink ? "edit link" : "add report link"}
              </button>
            </div>

            {/* UI-19: inline source-document viewer (the extracted text stored at import) */}
            {showSourceDoc && selected.refDocId && (() => {
              const doc = getRefDoc(selected.refDocId);
              if (!doc) return null;
              return (
                <div style={{ background: "#0b1220", border: "1px solid rgba(167,139,250,.25)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: "#a78bfa", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>
                    Source Document: {doc.name}{doc.addedDate ? ` · added ${formatDateUS(doc.addedDate)}` : ""}
                  </div>
                  <pre style={{ fontSize: 12, color: "#a8c4dc", fontFamily: "'DM Mono',monospace", whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 300, overflowY: "auto", margin: 0 }}>
                    {doc.text || "(no extracted text stored)"}
                  </pre>
                </div>
              );
            })()}

            {/* Summary — only when there is one (UI-19: no empty headings) */}
            {selected.summary && (
              <div style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: "#a0b4c8", fontFamily: "'DM Mono',monospace", marginBottom: 10 }}>
                  Summary
                </div>
                <p style={{ fontSize: 13, color: "#a8c4dc", lineHeight: 1.65 }}>{selected.summary}</p>
              </div>
            )}

            {/* Key details */}
            {(selected.details ?? []).length > 0 && <div style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: "#a0b4c8", fontFamily: "'DM Mono',monospace", marginBottom: 10 }}>
                Key Details
              </div>
              {(selected.details ?? []).map((d, i) => {
                const isFlag = d.includes("(H)") || d.includes("(L)");
                return (
                  <div key={i} className="detail-line">
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: isFlag ? "#f59e0b" : "#a0b4c8", flexShrink: 0, marginTop: 5 }} />
                    <span style={{ color: isFlag ? "#f5c97a" : "#7eb8d8", fontFamily: "'DM Mono',monospace" }}>{d}</span>
                  </div>
                );
              })}
            </div>}

            {/* Tags */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(selected.tags ?? []).map(t => (
                <span key={t} style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", background: "#0b1220", border: "1px solid #1c2a40", color: "#98afc4", padding: "3px 9px", borderRadius: 4, letterSpacing: "0.5px" }}>
                  #{t}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#a0b4c8", fontSize: 12, fontFamily: "'DM Mono',monospace", gap: 8 }}>
            {records.length === 0
              ? <><div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>▤</div><div>No records yet</div><div style={{ fontSize: 12, color: "#6a8090" }}>Import XML or PDF files on the Import Records tab</div></>
              : "Select a record to view details"
            }
          </div>
        )}
      </div>

      {/* Add Record modal */}
      {showAdd && (
        <div
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
          onClick={() => { setShowAdd(false); setAddForm({ title: "", facility: "", provider: "", date: "" }); setAddType(null); }}
        >
          <div
            style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 16, padding: 28, width: 420, animation: "fadeUp .2s ease both" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: "#dde8f5", marginBottom: 20 }}>Add Record</div>

            {[
              { label: "Title",    key: "title",    placeholder: "e.g. Cardiology Follow-Up" },
              { label: "Facility", key: "facility", placeholder: "e.g. Baptist Medical Center" },
              { label: "Provider", key: "provider", placeholder: "e.g. Dr. Jane Smith, MD" },
              { label: "Date",     key: "date",     placeholder: "e.g. Apr 8, 2026" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
                <input
                  className="modal-input"
                  placeholder={placeholder}
                  value={addForm[key]}
                  onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}

            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 8 }}>Record Type</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {FILTERS.filter(f => f !== "All").map(f => (
                  <button
                    key={f}
                    className={`type-chip${addType === f ? " active" : ""}`}
                    onClick={() => setAddType(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowAdd(false); setAddForm({ title: "", facility: "", provider: "", date: "" }); setAddType(null); }}
                style={{ padding: "8px 18px", background: "transparent", border: "1px solid #1c2a40", borderRadius: 8, color: "#b0c4d8", fontFamily: "'Sora',sans-serif", fontSize: 12, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!addForm.title.trim()) return;
                  const newRec = {
                    id: Date.now(),
                    title: addForm.title.trim(),
                    facility: addForm.facility.trim() || "Unknown",
                    provider: addForm.provider.trim() || "Unknown",
                    date: addForm.date.trim() || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                    type: addType || "Visit Note",
                    summary: "",
                    details: [],
                    tags: [],
                    source: "Entered manually", // UI-19: truthful source label
                    addedAt: new Date().toISOString(),
                  };
                  const updated = [newRec, ...records];
                  setRecordsState(updated);
                  setRecords(updated);
                  setSelected(newRec);
                  setShowAdd(false);
                  setAddForm({ title: "", facility: "", provider: "", date: "" });
                  setAddType(null);
                }}
                style={{ padding: "8px 18px", background: "rgba(79,142,247,.12)", border: "1px solid rgba(79,142,247,.35)", borderRadius: 8, color: "#6ea3ff", fontFamily: "'Sora',sans-serif", fontSize: 12, cursor: "pointer" }}
              >
                Save Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteId !== null && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 14, padding: 28, width: 380 }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: "#dde8f5", marginBottom: 10 }}>Delete Record?</div>
            <div style={{ fontSize: 13, color: "#98afc4", marginBottom: 22 }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteId(null)} style={{ padding: "8px 18px", background: "transparent", border: "1px solid #1c2a40", borderRadius: 8, color: "#b0c4d8", fontFamily: "'Sora',sans-serif", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => {
                tombstoneRecord("mi_records", records.find(r => r.id === deleteId));
                const updated = records.filter(r => r.id !== deleteId);
                setRecordsState(updated);
                setRecords(updated);
                if (selected?.id === deleteId) setSelected(updated[0] ?? null);
                setDeleteId(null);
              }} style={{ padding: "8px 18px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, color: "#f87171", fontFamily: "'Sora',sans-serif", fontSize: 12, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

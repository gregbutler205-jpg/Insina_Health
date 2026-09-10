// ── Phase 4: Review & Confirm — staging queue UI (ONBOARDING_SPEC v1.1 §3.4, §5) ──
import { formatDateUS } from "../../lib/displaySafe.js";
// Category summary → per-category review in the fixed high-consequence-first
// order. The §5.2 matrix is enforced on two layers: structurally, the
// bulk-accept control renders only when CONFIRMATION_MATRIX[cat].bulk is true;
// and in the write layer, bulk-accept routes through bulkConfirmItems(), which
// refuses meds/allergies/conditions regardless of config (AUDIT_SEC_02 F-04, C3).
// Source panel is mandatory on every item (§3.4). Also used standalone from
// Import Records (§2: the queue stays reachable after onboarding).

import { useEffect, useMemo, useState } from "react";
import { CONFIRMATION_MATRIX, CATEGORY_REVIEW_ORDER, CONFIDENCE_HIGH, CONFIDENCE_LOW, REJECT_RETENTION_DAYS } from "../../config/onboardingConfig.js";
import { getStagedStore, getDocument, setItemStatus, updateItem, stagedCounts } from "../../lib/onboardingStaging.js";
import { findMatchCandidate, analyzeLabs } from "../../lib/onboardingDuplicates.js";
import { confirmItemToRecord, bulkConfirmItems, recordShapeFor, recordEntriesFor, resolveKeepCurrent, resolveReplaceWithNew, resolveKeepBoth, resolveMerge } from "../../lib/onboardingConfirm.js";
import { assertNoKnownAllergies, hasNkdaAssertion } from "../../lib/artifactEngine.js";

const CAT_LABEL = {
  medication: "Medications", allergy: "Allergies", condition: "Conditions",
  care_team: "Care Team", lab: "Labs", procedure: "Procedures", immunization: "Immunizations", vital: "Vitals",
  record: "Medical Records", // DEC-P53: History Builder 'event' items share this queue
};

const card = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 };
const primaryBtn = { minHeight: 40, padding: "8px 20px", background: "var(--btn-p-bg)", border: "1px solid var(--btn-p-bd)", borderRadius: 9, color: "var(--btn-p-fg)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const ghostBtn = { minHeight: 40, padding: "8px 14px", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 9, color: "var(--text-secondary)", fontFamily: "var(--font-sans)", fontSize: 12.5, cursor: "pointer" };
const dangerBtn = { ...ghostBtn, color: "var(--red)", borderColor: "rgba(239,68,68,.3)" };
const inp = { width: "100%", minHeight: 38, background: "var(--bg-deep)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none", colorScheme: "var(--scheme)" };
const lbl = { display: "block", fontSize: 12, color: "var(--text-label)", fontFamily: "var(--font-mono)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 };
const modalWrap = { position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };

// §8 confidence chips; §4.4 duplicate detection overrides the badge.
function Chip({ item, match }) {
  if (match) return <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", padding: "3px 10px", borderRadius: 9, background: "var(--chip-dup-bg)", border: "1px solid var(--chip-dup-bd)", color: "var(--chip-dup-fg)" }}>{match.type === "duplicate" ? "Possible duplicate" : "Possible conflict"}</span>;
  if (item.confidence >= CONFIDENCE_HIGH) return <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", padding: "3px 10px", borderRadius: 9, background: "var(--chip-hi-bg)", color: "var(--chip-hi-fg)" }}>High confidence</span>;
  return <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", padding: "3px 10px", borderRadius: 9, background: "var(--chip-warn-bg)", color: "var(--chip-warn-fg)" }}>Needs review</span>;
}

function fieldSummary(item) {
  const f = item.fields;
  switch (item.category) {
    case "medication": return `${f.name || "?"}${f.strength ? ` ${f.strength}` : ""}${f.dose && f.dose !== f.strength ? `: ${f.dose}` : ""}${f.frequency ? ` ${f.frequency}` : ""}`;
    case "allergy": return `${f.substance || "?"}${f.reaction ? `: ${f.reaction}` : ""}`;
    case "condition": return `${f.name || "?"}${f.onset_date ? ` · since ${f.onset_date}` : ""}`;
    case "care_team": return `${f.name || "?"}${f.credential ? `, ${f.credential}` : ""}${f.specialty ? `: ${f.specialty}` : ""}`;
    case "lab": return `${f.test || "?"}: ${f.value ?? "?"}${f.unit ? ` ${f.unit}` : ""}${f.ref_low || f.ref_high ? ` (ref ${f.ref_low || "–"}–${f.ref_high || "–"})` : ""}${f.collected_date ? ` · ${f.collected_date}` : ""}`;
    case "procedure": return `${f.name || "?"}${f.date ? ` · ${formatDateUS(f.date)}` : ""}`;
    case "immunization": return `${f.name || "?"}${f.date ? ` · ${formatDateUS(f.date)}` : ""}`;
    case "vital": return `${f.type || "?"}: ${f.value ?? "?"}${f.unit ? ` ${f.unit}` : ""}${f.date ? ` · ${formatDateUS(f.date)}` : ""}`;
    default: return JSON.stringify(f);
  }
}

const EDITABLE_FIELDS = {
  medication: ["name", "strength", "dose", "frequency", "route"],
  allergy: ["substance", "reaction"],
  condition: ["name", "onset_date"],
  care_team: ["name", "credential", "specialty", "phone"],
  lab: ["test", "value", "unit", "ref_low", "ref_high", "collected_date"],
  procedure: ["name", "date"],
  immunization: ["name", "date"],
  vital: ["type", "value", "unit", "date"],
  record: ["title", "type", "date", "facility"],
};

// ── Source side-by-side panel (§3.4 — mandatory for every item) ──────────────
function SourcePanel({ item, onZoom }) {
  const doc = getDocument(item.docId);
  const entry = useMemo(() => {
    if (doc?.documentsModuleId == null) return null;
    try { return JSON.parse(localStorage.getItem("mi_documents") || "[]").find(d => d.id === doc.documentsModuleId) || null; } catch { return null; }
  }, [doc?.documentsModuleId]);
  const img = entry?.pageImages?.[Math.min((item.source_page || 1) - 1, (entry?.pageImages?.length || 1) - 1)] || entry?.pageImages?.[0];
  const region = item.source_region;
  return (
    <div style={{ width: 120, flexShrink: 0 }}>
      {img ? (
        <button onClick={() => onZoom({ img, region, title: doc?.source_name })} aria-label="View source document"
          style={{ position: "relative", display: "block", width: 120, padding: 0, background: "none", border: "1px solid var(--border-strong)", borderRadius: 8, overflow: "hidden", cursor: "zoom-in" }}>
          <img src={img} alt={`Source: ${doc?.source_name || "document"}`} style={{ width: "100%", display: "block" }} />
          {region && (
            <span aria-hidden="true" style={{ position: "absolute", left: `${region[0] * 100}%`, top: `${region[1] * 100}%`, width: `${region[2] * 100}%`, height: `${region[3] * 100}%`, border: "2px solid var(--amber)", background: "rgba(245,158,11,.15)", borderRadius: 2 }} />
          )}
        </button>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)", lineHeight: 1.6, border: "1px dashed var(--border-strong)", borderRadius: 8, padding: 8, maxHeight: 130, overflow: "hidden" }}>
          {doc?.source_name || "Source"}{item.source_page ? ` · p.${item.source_page}` : ""}
          {entry?.extractedText ? <div style={{ marginTop: 4, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{entry.extractedText.slice(0, 160)}…</div> : null}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginTop: 4, textAlign: "center" }}>
        {doc?.source_name}{doc?.doc_date ? ` · ${doc.doc_date}` : ""}
      </div>
    </div>
  );
}

// ── One staged item ───────────────────────────────────────────────────────────
function ItemCard({ item, match, conflict, onAction, onZoom, onCompare }) {
  const lowConf = item.confidence < CONFIDENCE_LOW;
  const midConf = item.confidence < CONFIDENCE_HIGH;
  const [editing, setEditing] = useState(midConf); // §4.4: needs-review pre-expands for editing
  const [fields, setFields] = useState({ ...item.fields });
  const [status, setStatus] = useState(item.default_historical ? "inactive" : "active");
  const effectiveMatch = match || conflict;

  const accept = () => onAction("accept", item, { fieldsOverride: fields, statusOverride: item.category === "medication" ? status : undefined });

  return (
    <div style={{ ...card, display: "flex", gap: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: "var(--text-bright)", fontWeight: 600 }}>{fieldSummary({ ...item, fields })}</span>
          <Chip item={item} match={effectiveMatch} />
        </div>

        {item.staleness_badge && (
          <div style={{ marginTop: 8, padding: "7px 12px", borderRadius: 8, fontSize: 12, background: "var(--stale-bg)", border: "1px solid var(--stale-bd)", color: "var(--stale-fg)" }}>
            {item.staleness_badge}
          </div>
        )}

        {/* §2 tripwire advisory: a critical value older than 14 days — flagged,
            not taken over. (advisory_hit is only set when the flag is enabled.) */}
        {item.advisory_hit && !item.advisory_hit.takeover && (
          <div style={{ marginTop: 8, padding: "7px 12px", borderRadius: 8, fontSize: 12, background: "var(--stale-bg)", border: "1px solid var(--stale-bd)", color: "var(--stale-fg)" }}>
            ⚠ Historical critical value ({item.advisory_hit.tier === "EMERGENCY" ? "emergency" : "urgent"} range): from an older document. Verify it against the original report and discuss with your care team.
          </div>
        )}

        {editing && (
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {EDITABLE_FIELDS[item.category].map(fld => (
              <div key={fld}>
                <label style={lbl} htmlFor={`ed-${item.id}-${fld}`}>{fld.replace(/_/g, " ")}</label>
                <input id={`ed-${item.id}-${fld}`} value={fields[fld] ?? ""}
                  onChange={e => setFields(prev => ({ ...prev, [fld]: e.target.value }))}
                  style={{ ...inp, ...(lowConf ? { borderColor: "rgba(245,158,11,.5)" } : {}) }} />
              </div>
            ))}
            {item.category === "medication" && (
              <div>
                <label style={lbl}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} style={inp}>
                  <option value="active">Active</option>
                  <option value="inactive">Historical</option>
                </select>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {effectiveMatch
            ? <button style={primaryBtn} onClick={() => onCompare(item, effectiveMatch)}>Compare…</button>
            : <button style={primaryBtn} onClick={accept}>Accept</button>}
          <button style={ghostBtn} onClick={() => setEditing(e => !e)}>{editing ? "Hide details" : "Edit"}</button>
          <button style={dangerBtn} onClick={() => onAction("reject", item)}>Reject</button>
          <button style={ghostBtn} onClick={() => onAction("defer", item)}>Not sure</button>
        </div>
      </div>
      <SourcePanel item={item} onZoom={onZoom} />
    </div>
  );
}

// ── Compare modal (§5.3) ──────────────────────────────────────────────────────
function CompareModal({ item, match, onResolve, onClose }) {
  const staged = recordShapeFor(item);
  const existing = match.source === "staged" ? recordShapeFor(match.against) : match.against;
  const [mergeMode, setMergeMode] = useState(false);
  const [picks, setPicks] = useState({});
  const stagedVsStaged = match.source === "staged";
  const fieldsToShow = [...new Set([...Object.keys(staged || {}), ...Object.keys(existing || {})])]
    .filter(k => !["id", "addedAt", "refDocId", "source"].includes(k))
    .filter(k => (staged?.[k] ?? "") !== "" || (existing?.[k] ?? "") !== "");
  const differing = fieldsToShow.filter(k => String(staged?.[k] ?? "") !== String(existing?.[k] ?? ""));
  const stagedDoc = getDocument(item.docId);
  const existingSource = stagedVsStaged ? getDocument(match.against.docId)?.source_name : (existing?.source || "Already in your record");

  return (
    <div style={modalWrap}>
      <div role="dialog" aria-modal="true" aria-label="Compare entries" style={{ background: "var(--card)", border: "1px solid var(--border-strong)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 640, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, color: "var(--text-bright)", fontWeight: 600, marginBottom: 4 }}>
          {match.type === "duplicate" ? "Looks like a duplicate" : "These don't quite match"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
          Compare the two and choose what to keep. Nothing changes until you decide.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: mergeMode ? "1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 0, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", background: "var(--bg-deep)", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-label)", textTransform: "uppercase" }}>Field</div>
          <div style={{ padding: "8px 12px", background: "var(--bg-deep)", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-label)", textTransform: "uppercase" }}>Current: {existingSource}</div>
          <div style={{ padding: "8px 12px", background: "var(--bg-deep)", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-label)", textTransform: "uppercase" }}>New: {stagedDoc?.source_name || "imported"}{stagedDoc?.doc_date ? ` (${stagedDoc.doc_date})` : ""}</div>
          {fieldsToShow.map(k => {
            const differs = differing.includes(k);
            return (
              <FragmentRow key={k} k={k} differs={differs} mergeMode={mergeMode} pick={picks[k]}
                current={String(existing?.[k] ?? "–")} staged={String(staged?.[k] ?? "–")}
                onPick={side => setPicks(p => ({ ...p, [k]: side }))} />
            );
          })}
        </div>

        {!mergeMode ? (
          <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button style={ghostBtn} onClick={onClose}>Back</button>
            <button style={ghostBtn} onClick={() => onResolve("keepCurrent")}>Keep current</button>
            <button style={ghostBtn} onClick={() => onResolve("replace")}>Replace with new</button>
            <button style={ghostBtn} onClick={() => onResolve("keepBoth")}>Keep both</button>
            {!stagedVsStaged && differing.length > 0 && (
              <button style={primaryBtn} onClick={() => { setMergeMode(true); setPicks(Object.fromEntries(differing.map(k => [k, "current"]))); }}>Merge…</button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
            <button style={ghostBtn} onClick={() => setMergeMode(false)}>Back</button>
            <button style={primaryBtn} onClick={() => onResolve("merge", picks)}>Apply merge</button>
          </div>
        )}
      </div>
    </div>
  );
}

function FragmentRow({ k, differs, mergeMode, pick, current, staged, onPick }) {
  const cellBase = { padding: "8px 12px", fontSize: 12.5, borderTop: "1px solid var(--divider)", color: "var(--text-primary)" };
  const hl = differs ? { color: "var(--amber)" } : {};
  return (
    <>
      <div style={{ ...cellBase, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-label)" }}>{k.replace(/_/g, " ")}</div>
      <div style={{ ...cellBase, ...hl, cursor: mergeMode && differs ? "pointer" : "default", background: mergeMode && pick === "current" ? "var(--accent-tint)" : "transparent" }}
        onClick={() => mergeMode && differs && onPick("current")}>
        {mergeMode && differs && <input type="radio" readOnly checked={pick === "current"} style={{ marginRight: 6 }} />}{current}
      </div>
      <div style={{ ...cellBase, ...hl, cursor: mergeMode && differs ? "pointer" : "default", background: mergeMode && pick === "staged" ? "var(--accent-tint)" : "transparent" }}
        onClick={() => mergeMode && differs && onPick("staged")}>
        {mergeMode && differs && <input type="radio" readOnly checked={pick === "staged"} style={{ marginRight: 6 }} />}{staged}
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReviewQueue({ onDone, embedded = false }) {
  const [store, setStore] = useState(() => getStagedStore());
  const [view, setView] = useState("summary"); // summary | <category> | rejected
  const [zoom, setZoom] = useState(null);
  const [compare, setCompare] = useState(null); // { item, match }
  const refresh = () => { setStore(getStagedStore()); stagedCounts(); };

  // §5.3: exact-duplicate labs auto-collapse silently, once per queue entry.
  useEffect(() => {
    const stagedLabs = store.items.filter(i => i.category === "lab" && i.status === "staged");
    if (!stagedLabs.length) return;
    const { collapse } = analyzeLabs(stagedLabs, recordEntriesFor("lab"));
    if (collapse.length) {
      collapse.forEach(id => updateItem(id, { status: "collapsed" }));
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingByCat = useMemo(() => {
    const by = {};
    CATEGORY_REVIEW_ORDER.concat(["vital"]).forEach(c => { by[c] = { staged: [], deferred: [], total: 0 }; });
    store.items.forEach(i => {
      if (!by[i.category]) by[i.category] = { staged: [], deferred: [], total: 0 };
      if (i.status === "staged") by[i.category].staged.push(i);
      if (i.status === "deferred") by[i.category].deferred.push(i);
      if (["staged", "deferred", "confirmed"].includes(i.status)) by[i.category].total++;
    });
    return by;
  }, [store]);

  const categoriesWithWork = CATEGORY_REVIEW_ORDER.filter(c => pendingByCat[c] && (pendingByCat[c].staged.length + pendingByCat[c].deferred.length) > 0);
  const rejected = store.items.filter(i => i.status === "rejected");

  const labConflicts = useMemo(() => {
    const stagedLabs = store.items.filter(i => i.category === "lab" && i.status === "staged");
    return analyzeLabs(stagedLabs, recordEntriesFor("lab")).conflicts;
  }, [store]);

  function matchFor(item) {
    if (item.category === "lab") {
      const c = labConflicts.get(item.id);
      return c ? { type: "conflict", ...c } : null;
    }
    const others = store.items.filter(i => i.category === item.category && i.status === "staged");
    return findMatchCandidate(item, recordEntriesFor(item.category), others);
  }

  function handleAction(kind, item, opts = {}) {
    if (kind === "accept") confirmItemToRecord(item, opts);
    if (kind === "reject") setItemStatus(item.id, "rejected");
    if (kind === "defer") setItemStatus(item.id, "deferred");
    if (kind === "restore") setItemStatus(item.id, "staged");
    refresh();
  }

  function handleResolve(resolution, picks) {
    const { item, match } = compare;
    const against = match.source === "staged" ? null : match.against;
    if (resolution === "keepCurrent") {
      // staged-vs-staged: keeping "current" keeps the other staged item pending
      resolveKeepCurrent(item);
    } else if (resolution === "replace") {
      if (against) resolveReplaceWithNew(item, against);
      else { setItemStatus(match.against.id, "rejected"); confirmItemToRecord(item); }
    } else if (resolution === "keepBoth") {
      if (against) resolveKeepBoth(item, against);
      else confirmItemToRecord(item); // both staged items stay independently reviewable
    } else if (resolution === "merge" && against) {
      resolveMerge(item, against, picks);
    }
    setCompare(null);
    refresh();
  }

  // ── Rejected recovery (§5.1 / §11.13) ──────────────────────────────────────
  if (view === "rejected") {
    return (
      <div className="ob-focus" style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 400, color: "var(--text-bright)", textAlign: "center" }}>Recently rejected</h2>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>
          Rejected items stay recoverable for {REJECT_RETENTION_DAYS} days, then are removed for good.
        </p>
        {rejected.length === 0 && <div style={{ ...card, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Nothing here.</div>}
        {rejected.map(item => {
          const daysLeft = item.rejected_at ? Math.max(0, REJECT_RETENTION_DAYS - Math.floor((Date.now() - new Date(item.rejected_at)) / 86400000)) : REJECT_RETENTION_DAYS;
          return (
            <div key={item.id} style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)", marginRight: 8 }}>{CAT_LABEL[item.category]}</span>
                {fieldSummary(item)}
              </span>
              <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>{daysLeft}d left</span>
              <button style={ghostBtn} onClick={() => handleAction("restore", item)}>Restore</button>
            </div>
          );
        })}
        <button style={{ ...ghostBtn, alignSelf: "center" }} onClick={() => setView("summary")}>Back to summary</button>
      </div>
    );
  }

  // ── Category review screen ──────────────────────────────────────────────────
  if (view !== "summary") {
    const cat = view;
    const { staged, deferred, total } = pendingByCat[cat] || { staged: [], deferred: [], total: 0 };
    const remaining = staged.length + deferred.length;
    const idx = categoriesWithWork.indexOf(cat);
    const next = categoriesWithWork.slice(idx + 1).find(c => (pendingByCat[c].staged.length + pendingByCat[c].deferred.length) > 0);
    const matrix = CONFIRMATION_MATRIX[cat] || { bulk: false };

    // §5.2 bulk: labs/vitals per SOURCE DOCUMENT; others one control.
    const bulkGroups = [];
    if (matrix.bulk) {
      if (cat === "lab" || cat === "vital") {
        const byDoc = new Map();
        staged.forEach(i => { if (!byDoc.has(i.docId)) byDoc.set(i.docId, []); byDoc.get(i.docId).push(i); });
        byDoc.forEach((items, docId) => {
          const high = items.filter(i => i.confidence >= CONFIDENCE_HIGH && !matchFor(i));
          if (high.length) bulkGroups.push({ docId, label: getDocument(docId)?.source_name || "document", items: high });
        });
      } else {
        const high = staged.filter(i => i.confidence >= CONFIDENCE_HIGH && !matchFor(i));
        if (high.length) bulkGroups.push({ docId: null, label: null, items: high });
      }
    }

    return (
      <div className="ob-focus" style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 400, color: "var(--text-bright)" }}>{CAT_LABEL[cat]}</h2>
          <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", marginTop: 4 }}>
            Showing {remaining} of {total}
          </div>
          {(cat === "medication" || cat === "allergy" || cat === "condition") && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
              These affect your reports directly, so each one needs your individual OK.
            </div>
          )}
        </div>

        {/* §6: "allergies reviewed" can also be the explicit NKDA assertion —
            absence of data is not the same as no known allergies. */}
        {cat === "allergy" && (() => {
          let recorded = [];
          try { recorded = JSON.parse(localStorage.getItem("mi_allergies") || "[]"); } catch { /* locked */ }
          if (recorded.length > 0) return null;
          return hasNkdaAssertion() ? (
            <div role="status" style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--green)", textAlign: "center" }}>
              ✓ “No known allergies” is recorded on your record.
            </div>
          ) : (
            <button style={{ ...ghostBtn, alignSelf: "center" }}
              onClick={() => { assertNoKnownAllergies(); refresh(); }}>
              I have no known allergies
            </button>
          );
        })()}

        {bulkGroups.map(g => (
          <button key={g.docId || "all"} style={{ ...primaryBtn, alignSelf: "flex-start" }}
            onClick={() => { bulkConfirmItems(g.items); refresh(); }}>
            Accept all {g.items.length} high-confidence {CAT_LABEL[cat].toLowerCase()}{g.label ? `: ${g.label}` : ""}
          </button>
        ))}

        {staged.map(item => (
          <ItemCard key={item.id} item={item} match={item.category === "lab" ? null : matchFor(item)} conflict={item.category === "lab" ? matchFor(item) : null}
            onAction={handleAction} onZoom={setZoom} onCompare={(it, m) => setCompare({ item: it, match: m })} />
        ))}
        {staged.length === 0 && remaining === 0 && (
          <div style={{ ...card, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>All reviewed: nice work.</div>
        )}

        {deferred.length > 0 && (
          <div style={{ ...card, borderStyle: "dashed" }}>
            <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-label)", textTransform: "uppercase", marginBottom: 8 }}>Marked “Not sure” ({deferred.length})</div>
            {deferred.map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-secondary)" }}>{fieldSummary(item)}</span>
                <button style={ghostBtn} onClick={() => handleAction("restore", item)}>Review again</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 6 }}>
          <button style={ghostBtn} onClick={() => setView("summary")}>Back to summary</button>
          <button style={primaryBtn} onClick={() => next ? setView(next) : (embedded ? onDone() : onDone())}>
            {next ? `Next: ${CAT_LABEL[next]}` : "Finish review"}
          </button>
        </div>

        {zoom && (
          <div style={modalWrap} onClick={() => setZoom(null)}>
            <div role="dialog" aria-modal="true" aria-label={`Source: ${zoom.title || "document"}`} style={{ position: "relative", maxWidth: "88vw", maxHeight: "88vh", overflow: "auto", borderRadius: 12 }}>
              <div style={{ position: "relative" }}>
                <img src={zoom.img} alt={zoom.title || "Source document"} style={{ display: "block", maxWidth: "86vw" }} />
                {zoom.region && (
                  <span aria-hidden="true" style={{ position: "absolute", left: `${zoom.region[0] * 100}%`, top: `${zoom.region[1] * 100}%`, width: `${zoom.region[2] * 100}%`, height: `${zoom.region[3] * 100}%`, border: "3px solid var(--amber)", background: "var(--chip-warn-bg)", borderRadius: 3 }} />
                )}
              </div>
            </div>
          </div>
        )}
        {compare && <CompareModal item={compare.item} match={compare.match} onResolve={handleResolve} onClose={() => setCompare(null)} />}
      </div>
    );
  }

  // ── Summary screen ──────────────────────────────────────────────────────────
  return (
    <div className="ob-focus" style={{ maxWidth: 620, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      {!embedded && (
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 400, color: "var(--text-bright)", letterSpacing: "-0.5px" }}>Review &amp; confirm</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
            Nothing enters your record until you approve it. Medications first. They matter most.
          </p>
        </div>
      )}
      {categoriesWithWork.length === 0 && (
        <div style={{ ...card, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
          Nothing waiting for review.
        </div>
      )}
      {categoriesWithWork.map(cat => {
        const { staged, deferred } = pendingByCat[cat];
        const perItem = CONFIRMATION_MATRIX[cat]?.perItem;
        return (
          <button key={cat} onClick={() => setView(cat)}
            style={{ ...card, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" }}>
            <span style={{ flex: 1 }}>
              <span style={{ fontSize: 14, color: "var(--text-bright)", fontWeight: 600 }}>{CAT_LABEL[cat]}</span>
              {perItem && <span style={{ marginLeft: 10, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--amber)", background: "var(--chip-warn-bg)", padding: "2px 8px", borderRadius: 8 }}>ITEM-BY-ITEM</span>}
            </span>
            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--accent-soft)" }}>
              {staged.length} to review{deferred.length ? ` · ${deferred.length} not sure` : ""}
            </span>
            <span aria-hidden="true" style={{ color: "var(--text-dim)" }}>→</span>
          </button>
        );
      })}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {categoriesWithWork.length > 0 && (
          <button style={primaryBtn} onClick={() => setView(categoriesWithWork[0])}>Start with {CAT_LABEL[categoriesWithWork[0]]}</button>
        )}
        <button style={ghostBtn} onClick={onDone}>{categoriesWithWork.length ? "Review later" : "Continue"}</button>
        {rejected.length > 0 && (
          <button style={{ ...ghostBtn, borderStyle: "dashed" }} onClick={() => setView("rejected")}>Recently rejected ({rejected.length})</button>
        )}
      </div>
    </div>
  );
}

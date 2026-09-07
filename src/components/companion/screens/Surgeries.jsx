// ── Surgeries & Procedures — read-only history from the record. ────────────────
import { C, mono, Card, Empty, Pill } from "../companionUI.jsx";
import { surgeries, fmtShort } from "../../../lib/companionData.js";

export default function Surgeries({ onBack }) {
  const list = surgeries();
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.card, borderBottom: `1px solid ${C.b2}`, position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.blue, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>←</button>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: C.p, flex: 1 }}>Procedures</div>
      </div>
      <div style={{ overflowY: "auto", overflowX: "hidden", padding: 16, flex: 1 }}>
        {list.length === 0 ? <Empty>No surgeries or procedures on file.</Empty> : list.map((s, i) => (
          <Card key={s.id || i} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
              <div style={{ flex: 1, fontSize: 14, color: C.p, fontWeight: 600 }}>{s.procedure}</div>
              {s.date && <Pill color={C.blue}>{fmtShort(s.date)}</Pill>}
            </div>
            {(s.surgeon || s.facility) && (
              <div style={{ fontSize: 12, color: C.dim, fontFamily: mono, marginBottom: s.outcome || s.notes ? 6 : 0 }}>
                {[s.surgeon, s.facility].filter(Boolean).join(" · ")}
              </div>
            )}
            {s.outcome && <div style={{ fontSize: 12, color: C.green, marginBottom: s.notes ? 4 : 0 }}>Outcome: {s.outcome}</div>}
            {s.notes && <div style={{ fontSize: 12, color: C.ghost, lineHeight: 1.5 }}>{s.notes}</div>}
          </Card>
        ))}
        <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, textAlign: "center", padding: "12px 0 20px" }}>
          Read-only. Edit on the web app.
        </div>
      </div>
    </div>
  );
}

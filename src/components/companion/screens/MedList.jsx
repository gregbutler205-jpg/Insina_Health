// ── Full medication list — name, dose/frequency, prescribing doctor. ───────────
import { C, mono, Card, SL, Empty, Pill } from "../companionUI.jsx";
import { activeMeds, meds, medId } from "../../../lib/companionData.js";

function line(m) {
  // e.g. "1000 mg · twice daily · Dr. Zapata"
  return [m.dose, m.frequency, m.prescriber].filter(Boolean).join(" · ");
}

export default function MedList({ onBack }) {
  const active = activeMeds();
  const inactive = meds().filter(m => m.status === "inactive");

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.card, borderBottom: `1px solid ${C.b2}`, position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.blue, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>←</button>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: C.p, flex: 1 }}>My Medications</div>
      </div>
      <div style={{ overflowY: "auto", overflowX: "hidden", padding: 16, flex: 1 }}>
        <SL>Active</SL>
        {active.length === 0 ? <Empty>No active medications on file.</Empty> : active.map(m => (
          <Card key={medId(m)} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: C.p, fontWeight: 600 }}>{m.name}</span>
              {m.brand && <span style={{ fontSize: 12, color: C.ghost, fontFamily: mono }}>({m.brand})</span>}
              {m.category && <Pill color={C.dim}>{m.category}</Pill>}
            </div>
            <div style={{ fontSize: 12, color: C.dim, fontFamily: mono, marginTop: 4, lineHeight: 1.5 }}>{line(m) || "–"}</div>
          </Card>
        ))}

        {inactive.length > 0 && (
          <>
            <div style={{ marginTop: 16 }}><SL>Inactive</SL></div>
            {inactive.map(m => (
              <div key={medId(m)} style={{ border: `1px solid ${C.b2}`, borderRadius: 10, padding: "10px 14px", marginBottom: 6, opacity: 0.55 }}>
                <div style={{ fontSize: 12, color: C.dim }}>{m.name}{m.brand ? ` (${m.brand})` : ""}</div>
                <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono }}>{line(m) || "–"}</div>
              </div>
            ))}
          </>
        )}

        <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, textAlign: "center", padding: "12px 0 20px" }}>
          Full medication management lives on the web app.
        </div>
      </div>
    </div>
  );
}

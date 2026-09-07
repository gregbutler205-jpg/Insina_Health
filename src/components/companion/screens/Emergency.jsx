// ── Emergency Info — loads instantly, works offline, show-to-an-EMT screen. ────
import { formatDateUS } from "../../../lib/displaySafe.js";
// Entirely derived from the local record (no network). One tap from Today.
import { C, mono, serif, Card, SL, Empty } from "../companionUI.jsx";
import { emergencyData } from "../../../lib/companionData.js";

const tel = (p) => `tel:${String(p || "").replace(/\D/g, "")}`;

export default function Emergency({ onBack }) {
  const d = emergencyData();
  const p = d.profile || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#1a0505", borderBottom: "1px solid #3d1212", position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.red, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>←</button>
        <div style={{ fontFamily: serif, fontSize: 18, color: "#f87171", flex: 1 }}>Emergency Info</div>
        <a href="tel:911" style={{ background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: mono, padding: "6px 14px", borderRadius: 20, textDecoration: "none" }}>911</a>
      </div>

      <div style={{ overflowY: "auto", padding: 16 }}>
        {/* Identity */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 18, color: C.p, fontWeight: 700 }}>{p.name || "–"}</div>
          <div style={{ fontSize: 12, color: C.dim, fontFamily: mono, marginTop: 3, lineHeight: 1.6 }}>
            {[p.dob && `DOB ${formatDateUS(p.dob)}`, p.gender, p.blood && `Blood ${p.blood}`].filter(Boolean).join("  ·  ")}
          </div>
        </Card>

        {/* Primary contact */}
        {d.primary && (
          <Card style={{ marginBottom: 12, border: `1px solid ${C.red}40` }}>
            <SL>Emergency Contact</SL>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: C.p, fontWeight: 600 }}>{d.primary.name}</div>
                {d.primary.relationship && <div style={{ fontSize: 12, color: C.dim, fontFamily: mono }}>{d.primary.relationship}</div>}
              </div>
              {d.primary.phone && <a href={tel(d.primary.phone)} style={{ background: "#ef4444", color: "#fff", fontSize: 12, fontFamily: mono, fontWeight: 700, padding: "8px 16px", borderRadius: 20, textDecoration: "none" }}>📞 Call</a>}
            </div>
          </Card>
        )}

        {/* Must-know status */}
        <Section title="Must-Know Status">
          {d.status.length === 0 ? <Empty>None on file.</Empty> : d.status.map((s, i) => (
            <Row key={i} main={s.name} sub={s.detail} dot={C.red} />
          ))}
        </Section>

        {/* Allergies */}
        <Section title="Allergies">
          {d.allergies.length === 0 ? <Empty>None on file.</Empty> : d.allergies.map((a, i) => (
            <Row key={i} main={a.name} sub={[a.reaction, a.severity].filter(Boolean).join(" · ")} dot={C.amber} />
          ))}
        </Section>

        {/* Medications */}
        <Section title="Current Medications">
          {d.meds.length === 0 ? <Empty>None on file.</Empty> : d.meds.map((m, i) => (
            <Row key={i} main={m.name} sub={m.detail} dot={C.purple} />
          ))}
        </Section>

        {/* Key labs */}
        <Section title="Key Recent Labs">
          {d.keyLabs.length === 0 ? <Empty>No flagged labs.</Empty> : d.keyLabs.map((l, i) => (
            <Row key={i} main={l.name} sub={`${l.value}${l.unit ? " " + l.unit : ""}${l.refRange ? ` (ref ${l.refRange})` : ""}`} dot={C.amber} />
          ))}
        </Section>

        {/* Care team */}
        <Section title="Care Team">
          {d.careTeam.length === 0 ? <Empty>None on file.</Empty> : d.careTeam.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.b2}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: C.p, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono }}>{[c.specialty || c.role, c.facility].filter(Boolean).join(" · ")}</div>
              </div>
              {c.phone && <a href={tel(c.phone)} style={{ background: "rgba(79,142,247,.12)", color: C.blue, fontSize: 12, fontFamily: mono, padding: "6px 12px", borderRadius: 16, textDecoration: "none" }}>📞</a>}
            </div>
          ))}
        </Section>

        <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, textAlign: "center", padding: "8px 0 20px" }}>Works offline · derived from your saved record</div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return <Card style={{ marginBottom: 12 }}><SL>{title}</SL>{children}</Card>;
}
function Row({ main, sub, dot }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.b2}` }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: dot, marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: C.p, fontWeight: 600 }}>{main}</div>
        {sub && <div style={{ fontSize: 12, color: C.dim, fontFamily: mono, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Reports: the print center (WO_DASHBOARD_FEED_01 section 3; DEC-057) ──────
// A plain page that lists the existing printable outputs as links and nothing
// else. The ED artifact that exists is the Emergency Card (DEC-057 note);
// Consultation Prep prints from an appointment; the Medication Report and the
// Patient Profile print directly from here.
// WO_DASHBOARD_POLISH_02 item 2 (DEC-060): the Patient Profile prints in one
// step with every stored card, and every print here runs the RIE preflight
// first. The Emergency Card runs the ED Prep checklist (diagnoses, medications,
// allergies present), the report id that had no print path before.
import { ShieldAlert, Calendar, Pill, User, Printer } from "lucide-react";
import { printEmergency } from "../../lib/printEmergency.js";
import { printMedicationList } from "../../lib/printMedicationList.js";
import { printProfile } from "../../lib/printProfile.js";
import { requestReport } from "../../rie/preflightChecks.js";
import { getStore } from "../../store.js";

export default function ReportsPage({ onNavChange }) {
  const rows = [
    { icon: ShieldAlert, title: "Emergency Card", body: "What ER teams need first: transplant status, medications, allergies, care team, and recent labs.", action: "Print Emergency Card", onClick: () => requestReport("edPrep", () => printEmergency()) },
    { icon: Calendar, title: "Consultation Prep", body: "A visit-specific brief. Open an upcoming appointment and choose Prepare for this visit or AI Prep Analysis.", action: "Open Appointments", onClick: () => onNavChange?.("appointments") },
    { icon: Pill, title: "Medication Report", body: "Your current medication list with doses, schedules, prescribers, and refill dates.", action: "Print Medication Report", onClick: () => requestReport("medications", () => printMedicationList(getStore("meds_full") || [])) },
    { icon: User, title: "Patient Profile", body: "Demographics, insurance, conditions, and history as one printable profile, with every stored insurance and ID card.", action: "Print Patient Profile", onClick: () => requestReport("profile", () => printProfile()) },
  ];
  return (
    <div style={{ padding: 28, fontFamily: "'Sora',sans-serif", color: "var(--text-primary)", maxWidth: 820 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Printer size={22} aria-hidden="true" color="var(--accent-blue)" />
        <h1 style={{ fontFamily: "'DM Serif Display',serif", fontWeight: 400, fontSize: 28, margin: 0, color: "var(--text-bright)" }}>Reports</h1>
      </div>
      <p style={{ fontSize: 15, color: "var(--text-dim)", margin: "0 0 20px", lineHeight: 1.5 }}>Every printable output in one place.</p>
      {rows.map(({ icon: Icon, title, body, action, onClick }) => (
        <section key={title} aria-label={title} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 12, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: "var(--card-deep)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-blue)", flexShrink: 0 }}><Icon size={20} /></span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-bright)" }}>{title}</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 4 }}>{body}</div>
          </div>
          <button onClick={onClick} style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, border: "1.5px solid var(--border-strong)", background: "var(--card-deep)", color: "var(--text-bright)", fontSize: 14, fontWeight: 600, fontFamily: "'Sora',sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>{action}</button>
        </section>
      ))}
    </div>
  );
}

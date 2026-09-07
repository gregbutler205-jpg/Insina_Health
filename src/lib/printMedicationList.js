// ── Medication Report generator (extracted verbatim from Tab04.jsx) ─────────
import { formatDateUS } from "./displaySafe.js";
// Moved to a shared lib so the onboarding first-artifact engine (ONBOARDING_
// SPEC v1.1 §6) can invoke it from Phase 5 — the spec names first-artifact
// invocation as a sanctioned integration point. Content unchanged.

import { wirePrintWindow } from "./printWindow.js";

const PRINT_LOGO = import.meta.env.BASE_URL + "logo.png";

export function printMedicationList(meds) {
  const date = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
  const patientName = (() => { try { const p = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}"); return p.name || ""; } catch { return ""; } })();
  const active = meds.filter(m => m.status !== "inactive");
  // Group by category
  const grouped = {};
  active.forEach(m => {
    const cat = m.category || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  });
  const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const fmtRefill = (str) => {
    if (!str) return "–";
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return formatDateUS(str);
    return str;
  };
  const medsHTML = Object.entries(grouped).map(([cat, catMeds]) => `
    <div class="category-header">${esc(cat)}</div>
    <table>
      <thead><tr><th>Medication</th><th>Dose</th><th>Frequency</th><th>Schedule</th><th>Prescriber</th><th>Rx #</th><th>Refill</th></tr></thead>
      <tbody>
        ${catMeds.map(m => `<tr>
          <td><strong>${esc(m.name)}</strong>${m.brand ? `<br><span class="brand">${esc(m.brand)}</span>` : ""}${m.flag ? `<span class="flag-badge"> REVIEW</span>` : ""}</td>
          <td>${esc(m.dose||"–")}</td>
          <td>${esc(m.frequency||"–")}</td>
          <td>${esc(m.schedule||"–")}</td>
          <td>${esc(m.prescriber||"–")}</td>
          <td>${esc(m.rxNumber||"–")}</td>
          <td>${esc(fmtRefill(m.refillDate))}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  `).join("");
  const win = window.open("", "_blank", "width=960,height=700");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
    <title>Medication List: Insina Health</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:Georgia,serif; max-width:860px; margin:40px auto; color:#1a1a1a; font-size:13px; line-height:1.6; padding:0 24px; }
      .logo { height:50px; margin-bottom:16px; }
      h1 { text-align:center; font-size:26px; font-weight:700; letter-spacing:-.5px; margin-bottom:6px; }
      .subtitle { text-align:center; font-size:12px; color:#555; margin-bottom:4px; }
      .meta { text-align:center; font-size:11px; color:#777; margin-bottom:20px; font-family:monospace; }
      .rule { border:none; border-top:2px solid #2563eb; margin-bottom:22px; }
      .category-header { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#2563eb; font-family:monospace; background:#f0f6ff; padding:6px 10px; margin-top:18px; margin-bottom:0; border-left:3px solid #2563eb; }
      table { width:100%; border-collapse:collapse; margin-bottom:4px; }
      th { font-size:10px; text-transform:uppercase; letter-spacing:.8px; color:#555; font-family:monospace; text-align:left; padding:7px 8px; border-bottom:1px solid #ddd; background:#fafafa; }
      td { font-size:12px; padding:7px 8px; border-bottom:1px solid #eee; vertical-align:top; }
      tr:last-child td { border-bottom:none; }
      .brand { font-size:11px; color:#777; font-style:italic; }
      .flag-badge { font-size:9px; background:#fee2e2; color:#dc2626; border-radius:3px; padding:1px 5px; margin-left:4px; font-family:monospace; font-style:normal; }
      .footer { margin-top:36px; border-top:1px solid #ddd; padding-top:10px; font-size:11px; color:#777; display:flex; justify-content:space-between; }
      .disclaimer { margin-top:16px; font-size:10px; color:#999; border-top:1px dashed #ddd; padding-top:8px; }
      @media print { body { margin:20px; } }
    </style>
  </head><body>
    <img src="${PRINT_LOGO}" class="logo" />
    <h1>Medication List</h1>
    <div class="subtitle">${patientName ? patientName + ": " : ""}Insina Health</div>
    <div class="meta">${active.length} active medications &nbsp;·&nbsp; ${date}</div>
    <hr class="rule" />
    ${medsHTML}
    <div class="disclaimer">This list is for reference only. Always confirm medications and dosages with your prescribing physician and pharmacist.</div>
    <div class="footer">
      <span>Insina Health: Personal Health Intelligence</span>
      <span>Printed ${date}</span>
    </div>
  </body></html>`);
  win.document.close();
  wirePrintWindow(win); // CSP-safe: the opener fires print; inline scripts are blocked in the popup
}

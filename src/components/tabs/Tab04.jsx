import { useState, useEffect } from "react";
import AppSidebar from "../AppSidebar.jsx";
import TopBar from "../TopBar.jsx";
import { getMedsFull, setMedsFull, getPendingMeds, setPendingMeds, getLastImportLabel } from "../../store.js";
import { tombstoneRecord } from "../../lib/recordTombstones.js";
import { wirePrintWindow } from "../../lib/printWindow.js";
import { formatDateUS } from "../../lib/displaySafe.js";
import AILauncher from "../ai/AILauncher.jsx";
import { requestReport } from "../../rie/preflightChecks.js";
import { PrintLabel } from "../icons.jsx";
import { takePendingSelect } from "../../lib/searchSelect.js";
import { printMedicationList } from "../../lib/printMedicationList.js";

const PRINT_LOGO = import.meta.env.BASE_URL + "logo.png";

function printRefillReport(meds) {
  const date = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
  const patientName = (() => { try { const p = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}"); return p.name || ""; } catch { return ""; } })();

  // Active meds with a refill date due in ≤7 days (including overdue)
  const due = meds
    .filter(m => m.status !== "inactive" && m.refillDate)
    .filter(m => calcDaysLeft(m.refillDate) <= 7)
    .sort((a, b) => (a.pharmacy || "zzz").localeCompare(b.pharmacy || "zzz"));

  if (due.length === 0) {
    alert("No medications are due for refill within the next 7 days.");
    return;
  }

  // Group by pharmacy
  const byPharmacy = {};
  due.forEach(m => {
    const ph = m.pharmacy || "Unknown Pharmacy";
    if (!byPharmacy[ph]) byPharmacy[ph] = [];
    byPharmacy[ph].push(m);
  });

  const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const fmtD = str => {
    if (!str) return "–";
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return formatDateUS(str);
    return str;
  };

  const bodyHTML = Object.entries(byPharmacy).map(([ph, phMeds]) => `
    <div class="pharmacy-header">${esc(ph)}</div>
    <table>
      <thead><tr><th>Medication</th><th>Dose / Frequency</th><th>Rx Number</th><th>Prescriber</th><th>Refill Date</th><th>Days Left</th></tr></thead>
      <tbody>
        ${phMeds.map(m => {
          const dl = calcDaysLeft(m.refillDate);
          const urgent = dl <= 3;
          return `<tr class="${urgent ? "urgent" : ""}">
            <td><strong>${esc(m.name)}</strong>${m.brand ? `<br><span class="brand">${esc(m.brand)}</span>` : ""}</td>
            <td>${esc(m.dose||"–")} · ${esc(m.frequency||"–")}</td>
            <td>${esc(m.rxNumber||"–")}</td>
            <td>${esc(m.prescriber||"–")}</td>
            <td>${esc(fmtD(m.refillDate))}</td>
            <td class="${urgent ? "urgent-cell" : "days-cell"}">${dl === 0 ? "OVERDUE" : `${dl}d`}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `).join("");

  const win = window.open("", "_blank", "width=920,height=680");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
    <title>Refill Report: Insina Health</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:Georgia,serif; max-width:880px; margin:36px auto; color:#1a1a1a; font-size:13px; line-height:1.6; padding:0 24px; }
      .logo { height:46px; margin-bottom:14px; }
      h1 { text-align:center; font-size:24px; font-weight:700; margin-bottom:4px; }
      .subtitle { text-align:center; font-size:12px; color:#555; margin-bottom:4px; }
      .meta { text-align:center; font-size:11px; color:#777; margin-bottom:18px; font-family:monospace; }
      .rule { border:none; border-top:2.5px solid #dc2626; margin-bottom:22px; }
      .notice { background:#fef2f2; border:1px solid #fecaca; border-left:3px solid #dc2626; padding:8px 12px; margin-bottom:20px; border-radius:3px; font-size:11.5px; color:#7f1d1d; font-family:monospace; }
      .pharmacy-header { font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#1d4ed8; background:#eff6ff; padding:7px 12px; margin-top:22px; margin-bottom:0; border-left:3px solid #1d4ed8; font-family:monospace; font-weight:600; }
      table { width:100%; border-collapse:collapse; margin-bottom:4px; }
      th { font-size:10px; text-transform:uppercase; letter-spacing:.8px; color:#555; font-family:monospace; text-align:left; padding:7px 8px; border-bottom:1.5px solid #ddd; background:#f8f8f8; }
      td { font-size:12px; padding:7px 8px; border-bottom:1px solid #eee; vertical-align:top; }
      tr.urgent td { background:#fef9f0; }
      tr:last-child td { border-bottom:none; }
      .brand { font-size:10.5px; color:#777; font-style:italic; }
      .days-cell { font-family:monospace; color:#92400e; font-weight:600; }
      .urgent-cell { font-family:monospace; color:#dc2626; font-weight:700; }
      .footer { margin-top:32px; border-top:1px solid #ddd; padding-top:10px; font-size:11px; color:#777; display:flex; justify-content:space-between; }
      .disclaimer { margin-top:12px; font-size:10px; color:#999; border-top:1px dashed #ddd; padding-top:8px; }
      @media print { body { margin:20px; } .notice { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style>
  </head><body>
    <img src="${PRINT_LOGO}" class="logo" />
    <h1>Medication Refill Report</h1>
    <div class="subtitle">${patientName ? patientName + ": " : ""}Insina Health</div>
    <div class="meta">${due.length} medication${due.length !== 1 ? "s" : ""} due within 7 days &nbsp;·&nbsp; ${date}</div>
    <hr class="rule" />
    <div class="notice">⚠ These medications are due for refill within 7 days. Contact your pharmacy or prescriber promptly.</div>
    ${bodyHTML}
    <div class="disclaimer">This report is for reference only. Always verify refill status with your pharmacy.</div>
    <div class="footer">
      <span>Insina Health: Personal Health Intelligence</span>
      <span>Printed ${date}</span>
    </div>
  </body></html>`);
  win.document.close();
  wirePrintWindow(win); // CSP-safe: the opener fires print; inline scripts are blocked in the popup
}


// ── Refill / renewal calculation helpers ─────────────────────────────────────

/** Add N days to an ISO or "Mon DD" date string. Returns ISO string. */
function addDays(dateStr, days) {
  let base;
  if (!dateStr) {
    base = new Date();
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    base = new Date(dateStr + "T12:00:00");
  } else {
    const yr = new Date().getFullYear();
    const d  = new Date(`${dateStr}, ${yr}`);
    base = !isNaN(d.getTime()) ? d : new Date();
  }
  const result = new Date(base.getTime() + days * 86400000);
  return result.toISOString().split("T")[0];
}

// ── Refill date helpers ───────────────────────────────────────────────────────
function calcDaysLeft(refillDate) {
  if (!refillDate) return 0;
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(refillDate)) {
    d = new Date(refillDate + "T12:00:00");
  } else {
    const yr = new Date().getFullYear();
    d = new Date(`${refillDate}, ${yr}`);
    if (isNaN(d.getTime()) || d < new Date(Date.now() - 180 * 86400000)) {
      d = new Date(`${refillDate}, ${yr + 1}`);
    }
  }
  const days = Math.ceil((d - Date.now()) / 86400000);
  return Math.max(0, isNaN(days) ? 0 : days);
}

function toIsoDate(str) {
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const yr = new Date().getFullYear();
  const d = new Date(`${str}, ${yr}`);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return "";
}

function fmtRefillDate(str) {
  if (!str) return "–";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return formatDateUS(str);
  }
  return str;
}

const MEDS_SEED = [
  {
    id: 1,
    name: "Tacrolimus",
    brand: "Prograf",
    dose: "3 mg",
    frequency: "Twice daily",
    schedule: "8:00 AM · 8:00 PM",
    category: "Immunosuppressant",
    refillDate: "Mar 28",
    daysLeft: 16,
    lastTaken: "Today 8:14 AM",
    status: "ok",
    flag: true,
    flagNote: "Trough level borderline: recheck at next labs",
    prescriber: "Dr. Ari Cohen",
    pharmacy: "CVS #5777",
    color: "#a78bfa",
  },
  {
    id: 2,
    name: "Mycophenolate",
    brand: "CellCept",
    dose: "500 mg",
    frequency: "Twice daily",
    schedule: "8:00 AM · 8:00 PM",
    category: "Immunosuppressant",
    refillDate: "Apr 2",
    daysLeft: 21,
    lastTaken: "Today 8:14 AM",
    status: "ok",
    flag: false,
    prescriber: "Dr. Ari Cohen",
    pharmacy: "CVS #5777",
    color: "#a78bfa",
  },
  {
    id: 3,
    name: "Prednisone",
    brand: "Deltasone",
    dose: "5 mg",
    frequency: "Once daily",
    schedule: "8:00 AM",
    category: "Corticosteroid",
    refillDate: "Mar 16",
    daysLeft: 4,
    lastTaken: "Today 8:14 AM",
    status: "refill",
    flag: true,
    flagNote: "Refill due in 4 days. Contact pharmacy",
    prescriber: "Dr. Ari Cohen",
    pharmacy: "CVS #5777",
    color: "#f59e0b",
  },
  {
    id: 4,
    name: "Amlodipine",
    brand: "Norvasc",
    dose: "10 mg",
    frequency: "Once daily",
    schedule: "8:00 AM",
    category: "Blood Pressure",
    refillDate: "Apr 10",
    daysLeft: 29,
    lastTaken: "Today 8:14 AM",
    status: "ok",
    flag: false,
    prescriber: "Dr. Jonathan Hand",
    pharmacy: "CVS #5777",
    color: "#4f8ef7",
  },
  {
    id: 5,
    name: "Metoprolol",
    brand: "Lopressor",
    dose: "25 mg",
    frequency: "Twice daily",
    schedule: "8:00 AM · 8:00 PM",
    category: "Blood Pressure",
    refillDate: "Apr 5",
    daysLeft: 24,
    lastTaken: "Today 8:14 AM",
    status: "ok",
    flag: false,
    prescriber: "Dr. Jonathan Hand",
    pharmacy: "CVS #5777",
    color: "#4f8ef7",
  },
  {
    id: 6,
    name: "Furosemide",
    brand: "Lasix",
    dose: "40 mg",
    frequency: "Once daily",
    schedule: "8:00 AM",
    category: "Diuretic",
    refillDate: "Mar 22",
    daysLeft: 10,
    lastTaken: "Today 8:14 AM",
    status: "ok",
    flag: false,
    prescriber: "Dr. Ari Cohen",
    pharmacy: "CVS #5777",
    color: "#10b981",
  },
  {
    id: 7,
    name: "Pantoprazole",
    brand: "Protonix",
    dose: "40 mg",
    frequency: "Once daily",
    schedule: "Before breakfast",
    category: "GI / Protective",
    refillDate: "Apr 12",
    daysLeft: 31,
    lastTaken: "Today 7:52 AM",
    status: "ok",
    flag: false,
    prescriber: "Dr. Jonathan Hand",
    pharmacy: "CVS #5777",
    color: "#10b981",
  },
  {
    id: 8,
    name: "Trimethoprim-SMX",
    brand: "Bactrim DS",
    dose: "800/160 mg",
    frequency: "3x weekly",
    schedule: "Mon · Wed · Fri",
    category: "Antibiotic / Prophylaxis",
    refillDate: "May 1",
    daysLeft: 50,
    lastTaken: "Mar 10",
    status: "ok",
    flag: false,
    prescriber: "Dr. Ari Cohen",
    pharmacy: "CVS #5777",
    color: "#10b981",
  },
  {
    id: 9,
    name: "Valganciclovir",
    brand: "Valcyte",
    dose: "450 mg",
    frequency: "Once daily",
    schedule: "8:00 AM",
    category: "Antiviral / Prophylaxis",
    refillDate: "Apr 8",
    daysLeft: 27,
    lastTaken: "Today 8:14 AM",
    status: "ok",
    flag: true,
    flagNote: "Interaction risk with mycophenolate: monitor CBC",
    prescriber: "Dr. Ari Cohen",
    pharmacy: "CVS #5777",
    color: "#ef4444",
  },
  {
    id: 10,
    name: "Atorvastatin",
    brand: "Lipitor",
    dose: "40 mg",
    frequency: "Once daily",
    schedule: "8:00 PM",
    category: "Cholesterol",
    refillDate: "Apr 15",
    daysLeft: 34,
    lastTaken: "Yesterday 8:02 PM",
    status: "ok",
    flag: false,
    prescriber: "Dr. Jonathan Hand",
    pharmacy: "CVS #5777",
    color: "#4f8ef7",
  },
  {
    id: 11,
    name: "Calcium Carbonate",
    brand: "Tums / OTC",
    dose: "500 mg",
    frequency: "Twice daily",
    schedule: "With meals",
    category: "Supplement",
    refillDate: "May 20",
    daysLeft: 69,
    lastTaken: "Today 8:14 AM",
    status: "ok",
    flag: false,
    prescriber: "Dr. Ari Cohen",
    pharmacy: "OTC",
    color: "#7eb8d8",
  },
  {
    id: 12,
    name: "Vitamin D3",
    brand: "OTC",
    dose: "2000 IU",
    frequency: "Once daily",
    schedule: "8:00 AM",
    category: "Supplement",
    refillDate: "May 20",
    daysLeft: 69,
    lastTaken: "Today 8:14 AM",
    status: "ok",
    flag: false,
    prescriber: "Dr. Ari Cohen",
    pharmacy: "OTC",
    color: "#7eb8d8",
  },
  {
    id: 13,
    name: "Magnesium Oxide",
    brand: "Mag-Ox",
    dose: "400 mg",
    frequency: "Once daily",
    schedule: "8:00 PM",
    category: "Supplement",
    refillDate: "Apr 20",
    daysLeft: 39,
    lastTaken: "Yesterday 8:02 PM",
    status: "ok",
    flag: false,
    prescriber: "Dr. Ari Cohen",
    pharmacy: "CVS #5777",
    color: "#7eb8d8",
  },
  {
    id: 14,
    name: "Aspirin",
    brand: "Bayer / OTC",
    dose: "81 mg",
    frequency: "Once daily",
    schedule: "8:00 AM",
    category: "Antiplatelet",
    refillDate: "Jun 1",
    daysLeft: 81,
    lastTaken: "Today 8:14 AM",
    status: "ok",
    flag: false,
    prescriber: "Dr. Jonathan Hand",
    pharmacy: "OTC",
    color: "#ef4444",
  },
];

const INTERACTIONS = [];

const CATEGORIES = ["All", "Immunosuppressant", "Blood Pressure", "Corticosteroid", "GI / Protective", "Antibiotic / Prophylaxis", "Antiviral / Prophylaxis", "Diuretic", "Cholesterol", "Supplement", "Antiplatelet", "Pain", "Mental Health", "Diabetes", "Other"];

export default function App({ onNavChange }) {
  const [activeNav, setActiveNav] = useState("medications");
  const handleNav = (id) => { if (id !== "medications") { onNavChange?.(id); } else { setActiveNav(id); } };
  const [meds, setMeds] = useState(() => getMedsFull());
  const [selectedMed, setSelectedMed] = useState(() => getMedsFull()[0]);
  const [editingMed, setEditingMed] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [filterCat, setFilterCat] = useState("All");
  const [search, setSearch] = useState("");
  const [showFlagged, setShowFlagged] = useState(false);
  const [time, setTime] = useState(new Date());
  const [pendingMeds, setPendingMedsState] = useState(() => getPendingMeds());
  const [showAddForm, setShowAddForm] = useState(false);
  const [reminders, setReminders] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mi_med_reminders") || "[]"); } catch { return []; }
  });
  const [editingReminder, setEditingReminder] = useState(null); // medId being edited, or null
  const [reminderForm, setReminderForm] = useState({ times: ["08:00"], endDate: "", enabled: true });

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // UI-26: a search result targeting a medication opens that medication.
  // Runs on mount (navigated here) and on the event (already the visible tab).
  useEffect(() => {
    const apply = () => {
      const title = takePendingSelect("medications");
      if (!title) return;
      const hit = getMedsFull().find(m => m.name === title);
      if (hit) setSelectedMed(hit);
    };
    apply();
    window.addEventListener("insina-pending-select", apply);
    return () => window.removeEventListener("insina-pending-select", apply);
  }, []);

  // ── ICS calendar file helpers ─────────────────────────────────────────────────
  function generateICS(med, reminder) {
    const pad = n => String(n).padStart(2, "0");
    const now = new Date();
    const todayStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;

    const events = reminder.times.map(time => {
      const [hh, mm] = time.split(":").map(Number);
      const dtStart = `${todayStr}T${pad(hh)}${pad(mm)}00`;
      let rrule = "RRULE:FREQ=DAILY";
      if (reminder.endDate) {
        const [ey, em, ed] = reminder.endDate.split("-");
        rrule += `;UNTIL=${ey}${em}${ed}T235959`;
      }
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}@insinahealth`;
      const label = `${med.name}${med.dose ? " " + med.dose : ""}`;
      return [
        "BEGIN:VEVENT",
        `DTSTART:${dtStart}`,
        rrule,
        `SUMMARY:💊 Take ${label}`,
        `DESCRIPTION:Insina Health reminder: time to take your ${label}`,
        "BEGIN:VALARM",
        "TRIGGER:PT0S",
        "ACTION:DISPLAY",
        `DESCRIPTION:Time to take ${label}`,
        "END:VALARM",
        `UID:${uid}`,
        "END:VEVENT",
      ].join("\r\n");
    });

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Insina Health//Insina Health//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");
  }

  function downloadICS(med, reminder) {
    const ics  = generateICS(med, reminder);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${med.name.replace(/\s+/g, "_")}_reminder.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fmt = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const fmtDate = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const isFlagged = (m) => m.flag || calcDaysLeft(m.refillDate) <= 7 || (m.renewalDate && calcDaysLeft(m.renewalDate) <= 30);
  const filtered = meds.filter((m) => {
    const catOk = filterCat === "All" || m.category === filterCat;
    const searchOk = m.name.toLowerCase().includes(search.toLowerCase()) || (m.brand || "").toLowerCase().includes(search.toLowerCase());
    const flagOk = !showFlagged || isFlagged(m);
    return catOk && searchOk && flagOk;
  });

  const flaggedCount = meds.filter((m) =>
    m.flag ||
    calcDaysLeft(m.refillDate) <= 7 ||
    (m.renewalDate && calcDaysLeft(m.renewalDate) <= 30)
  ).length;
  const refillSoon = meds.filter((m) => calcDaysLeft(m.refillDate) <= 10).length;
  const nextRefill = meds.length > 0 ? meds.reduce((min, m) => (calcDaysLeft(m.refillDate) < calcDaysLeft(min.refillDate) ? m : min), meds[0]) : null;

  const statusColor = (s) => ({ ok: "#10b981", refill: "#f59e0b", warn: "#ef4444" }[s] || "#4f8ef7");

  const handleSaveMed = (updated) => {
    const newMeds = updated.id
      ? meds.map(m => m.id === updated.id ? updated : m)
      : [...meds, { ...updated, id: Date.now() }];
    setMeds(newMeds);
    setMedsFull(newMeds);
    setSelectedMed(updated.id ? updated : newMeds[newMeds.length - 1]);
    setEditingMed(null);
    setShowAddForm(false);
  };

  const handleDeleteMed = (id) => {
    tombstoneRecord("mi_meds_full", meds.find(m => m.id === id));
    const newMeds = meds.filter(m => m.id !== id);
    setMeds(newMeds);
    setMedsFull(newMeds);
    setSelectedMed(null);
    setEditingMed(null);
    setDeleteConfirm(false);
  };

  const [completeFlash, setCompleteFlash] = useState(null); // "refill" | "renewal" | null
  const [refilledFlash, setRefilledFlash] = useState(null); // med.id just refilled from the list

  function flashComplete(type) {
    setCompleteFlash(type);
    setTimeout(() => setCompleteFlash(null), 2500);
  }

  function handleCompleteRefill(med) {
    const supply = parseInt(med.daysSupply) || 30;
    const newRefill = addDays(med.refillDate, supply);
    const updated = { ...med, refillDate: newRefill };
    const newMeds = meds.map(m => m.id === med.id ? updated : m);
    setMeds(newMeds);
    setMedsFull(newMeds);
    setSelectedMed(updated);
    flashComplete("refill");
  }

  // Quick "Refilled" action from a list row — advances the refill date by the
  // days supply without opening the detail panel.
  function markRefilled(med, e) {
    e?.stopPropagation();
    if (!med.refillDate) return;
    const supply = parseInt(med.daysSupply) || 30;
    const updated = { ...med, refillDate: addDays(med.refillDate, supply) };
    const newMeds = meds.map(m => m.id === med.id ? updated : m);
    setMeds(newMeds);
    setMedsFull(newMeds);
    setSelectedMed(prev => (prev && prev.id === med.id ? updated : prev));
    setRefilledFlash(med.id);
    setTimeout(() => setRefilledFlash(f => (f === med.id ? null : f)), 2000);
  }

  function handleCompleteRenewal(med) {
    const newRenewal = addDays(med.renewalDate || null, 365);
    const updated = { ...med, renewalDate: newRenewal };
    const newMeds = meds.map(m => m.id === med.id ? updated : m);
    setMeds(newMeds);
    setMedsFull(newMeds);
    setSelectedMed(updated);
    flashComplete("renewal");
  }

  const handleApprovePending = (med) => {
    const newMed = { ...med, id: Date.now(), status: "ok", flag: false };
    const newMeds = [...meds, newMed];
    setMeds(newMeds);
    setMedsFull(newMeds);
    const remaining = pendingMeds.filter(m => m._pendingId !== med._pendingId);
    setPendingMedsState(remaining);
    setPendingMeds(remaining);
  };

  const handleRejectPending = (med) => {
    const remaining = pendingMeds.filter(m => m._pendingId !== med._pendingId);
    setPendingMedsState(remaining);
    setPendingMeds(remaining);
  };

  // ── Reminder helpers ──────────────────────────────────────────────────────────
  function saveAllReminders(arr) {
    localStorage.setItem("mi_med_reminders", JSON.stringify(arr));
    setReminders(arr);
  }

  function handleSaveReminder() {
    if (!selectedMed) return;
    const times = reminderForm.times.filter(t => t).sort();
    if (!times.length) return;
    const reminder = { id: Date.now(), medId: selectedMed.id, medName: selectedMed.name, times, endDate: reminderForm.endDate };
    const existing = reminders.find(r => r.medId === selectedMed.id);
    const updated  = existing
      ? reminders.map(r => r.medId === selectedMed.id ? { ...r, ...reminder } : r)
      : [...reminders, reminder];
    saveAllReminders(updated);
    setEditingReminder(null);
    downloadICS(selectedMed, reminder);
  }

  function handleDeleteReminder(medId) {
    saveAllReminders(reminders.filter(r => r.medId !== medId));
    setEditingReminder(null);
  }


  return (
    <div style={{ display: "flex", height: "100vh", background: "#07090f", color: "#d4e2f0", fontFamily: "'Sora', sans-serif", overflow: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #1a2840; border-radius: 4px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        .section-label { font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:#a0b4c8; font-family:'DM Mono', monospace; margin-bottom:12px; }
        .stat-card { background:#0b1220; border:1px solid #1c2a40; border-radius:14px; padding:18px 20px; animation:fadeUp .35s ease both; transition:border-color .2s; }
        .stat-card:hover { border-color:#1a2f4a; }
        .med-row { display:flex; align-items:center; gap:12px; padding:11px 14px; border-radius:10px; background:#0b1220; border:1px solid #1c2a40; margin-bottom:6px; cursor:pointer; transition:all .15s; animation:fadeUp .35s ease both; }
        .med-row:hover { border-color:#1a2f4a; }
        .med-row.selected { border-color:#6ea3ff; background:rgba(79,142,247,.06); }
        .filter-pill { padding:5px 12px; border-radius:20px; border:1px solid #1c2a40; font-size:12px; font-family:'DM Mono',monospace; cursor:pointer; background:#0b1220; color:#b0c4d8; transition:all .15s; white-space:nowrap; }
        .filter-pill:hover { color:#7eb8d8; border-color:#1a2f4a; }
        .filter-pill.active { background:rgba(79,142,247,.1); border-color:#6ea3ff; color:#6ea3ff; }
        .search-input { background:#0b1220; border:1px solid #1c2a40; border-radius:8px; padding:8px 12px; font-size:12px; font-family:'Sora',sans-serif; color:#c4d8ee; outline:none; width:100%; transition:border-color .15s; }
        .search-input:focus { border-color:#6ea3ff; }
        .search-input::placeholder { color:#98afc4; }
        .toggle-btn { padding:5px 12px; border-radius:20px; border:1px solid #1c2a40; font-size:12px; font-family:'DM Mono',monospace; cursor:pointer; background:#0b1220; color:#b0c4d8; transition:all .15s; }
        .toggle-btn.on { background:rgba(239,68,68,.1); border-color:#ef4444; color:#f87171; }
        .detail-row { display:flex; justify-content:space-between; align-items:flex-start; padding:10px 0; border-bottom:1px solid #1c2a40; }
        .detail-row:last-child { border-bottom:none; }
        .interaction-row { padding:10px 14px; border-radius:8px; background:#0b1220; border:1px solid #1c2a40; margin-bottom:6px; animation:fadeUp .35s ease both; }
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .med-row { border: 1px solid #ccc !important; color: black !important; }
        }
      `}</style>

      {/* Sidebar */}
      <AppSidebar activeNav={activeNav} onNav={handleNav} />

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar: shared (WO_DASHBOARD_POLISH_02 item 4; DEC-059) */}
        <TopBar activeNav={activeNav} onNav={handleNav} />
        {/* Screen actions */}
        <div className="screen-bar">
          <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", background: "#0b1220", border: "1px solid #1c2a40", padding: "5px 12px", borderRadius: 6 }}>
            Last import: {getLastImportLabel()}
          </div>
          <button onClick={() => requestReport("medications", () => printRefillReport(meds))} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.3)", borderRadius:8, color:"#f87171", fontSize:12, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>
            <PrintLabel>Refill Report</PrintLabel>
          </button>
          <button onClick={() => requestReport("medications", () => printMedicationList(meds))} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"rgba(79,142,247,.1)", border:"1px solid rgba(79,142,247,.3)", borderRadius:8, color:"#7eb8d8", fontSize:12, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>
            <PrintLabel>Print Med List</PrintLabel>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px 28px" }}>

          {/* Header */}
          <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: "#dde8f5", fontWeight: 400, letterSpacing: "-0.5px" }}>Medications</h1>
              <p style={{ fontSize: 12, color: "#98afc4", marginTop: 5, fontFamily: "'DM Mono',monospace" }}>{meds.length} active · {flaggedCount} flagged · {refillSoon} refill{refillSoon !== 1 ? "s" : ""} due soon</p>
            </div>
            {/* DEC-P49: the one list-level launcher. Replaces the AI Interaction
                Check button, which auto-sent a prompt on tap (DEC-P50 forbids
                launcher-triggered runs). Scope: the active medication list. */}
            <AILauncher
              label="Review my medication list"
              scope={{ source: "medications", items: [{ kind: "med_list", label: "Active medications" }] }}
              onNavigate={() => onNavChange?.("ai")}
              style={{ padding: "8px 16px", borderRadius: 8 }}
            />
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
            {[
              { label: "Active Medications", value: String(meds.length), sub: "across categories", color: "#4f8ef7" },
              { label: "Flagged for Review", value: String(flaggedCount), sub: "requires attention", color: "#ef4444", clickable: true },
              { label: "Refills Due Soon", value: String(refillSoon), sub: "within 10 days", color: "#f59e0b" },
              { label: "Next Refill", value: nextRefill ? nextRefill.name.split(" ")[0] : "–", sub: nextRefill ? `Due ${fmtRefillDate(nextRefill.refillDate)} · ${calcDaysLeft(nextRefill.refillDate)}d` : "No meds added yet", color: "#f59e0b" },
            ].map(({ label, value, sub, color, clickable }, i) => (
              <div className="stat-card" key={label} style={{ animationDelay: `${i * 55}ms`, cursor: clickable ? "pointer" : "default" }} onClick={clickable ? () => setShowFlagged(f => !f) : undefined}>
                <div style={{ width: 28, height: 3, background: color, borderRadius: 2, marginBottom: 14, boxShadow: `0 0 10px ${color}60` }} />
                <div style={{ fontSize: 24, fontWeight: 700, color: "#dde8f5", letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 5 }}>{value}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#7eb8d8", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>{sub}</div>
                {clickable && <div style={{ marginTop:8, fontSize:12, color: showFlagged ? "#f87171" : "#6ea3ff", fontFamily:"'DM Mono',monospace" }}>{showFlagged ? "✕ Clear filter" : "→ Filter to flagged"}</div>}
              </div>
            ))}
          </div>

          {/* Main layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>

            {/* Left — list */}
            <div>
              {/* Controls */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  className="search-input"
                  placeholder="Search medications..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: 200 }}
                />
                <button
                  onClick={() => setShowFlagged(!showFlagged)}
                  style={{ padding:"5px 12px", borderRadius:20, border:"1px solid", fontFamily:"'DM Mono',monospace", fontSize:12, cursor:"pointer", background: showFlagged ? "rgba(239,68,68,.12)" : "rgba(79,142,247,.10)", borderColor: showFlagged ? "#ef4444" : "rgba(79,142,247,.4)", color: showFlagged ? "#f87171" : "#6ea3ff", transition:"all .15s" }}
                >
                  {showFlagged ? "✕ Flagged only" : "▲ Show Flagged"}
                </button>
                <button onClick={() => { setShowAddForm(true); setEditingMed({ id:null, name:"", brand:"", dose:"", frequency:"Once daily", schedule:"", category:"Immunosuppressant", refillDate:"", renewalDate:"", daysSupply:30, prescriber:"", pharmacy:"", rxNumber:"", status:"ok", flag:false, color:"#4f8ef7" }); }} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"rgba(16,185,129,.1)", border:"1px solid rgba(16,185,129,.3)", borderRadius:8, color:"#2dd4a0", fontSize:12, fontFamily:"'DM Mono',monospace", cursor:"pointer", whiteSpace:"nowrap" }}>
                  + Add Med
                </button>
              </div>

              {/* Category filters */}
              <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
                {["All", "Immunosuppressant", "Blood Pressure", "GI / Protective", "Supplement", "Prophylaxis"].map((cat) => {
                  const match = cat === "Prophylaxis"
                    ? filterCat.includes("Prophylaxis")
                    : filterCat === cat;
                  return (
                    <button
                      key={cat}
                      className={`filter-pill ${match ? "active" : ""}`}
                      onClick={() => setFilterCat(cat === "Prophylaxis" ? "Antibiotic / Prophylaxis" : cat)}
                    >{cat}</button>
                  );
                })}
              </div>

              {/* Pending meds section */}
              {pendingMeds.length > 0 && (
                <div style={{ marginBottom:16, padding:"14px", background:"rgba(245,158,11,.05)", border:"1px solid rgba(245,158,11,.2)", borderRadius:10 }}>
                  <div style={{ fontSize:12, color:"#f59e0b", fontFamily:"'DM Mono',monospace", letterSpacing:"1.5px", marginBottom:10 }}>IMPORTED: PENDING APPROVAL ({pendingMeds.length})</div>
                  {pendingMeds.map((m, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 12px", background:"#080c14", borderRadius:8, border:"1px solid #1a2f4a", marginBottom:6 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:"#c4d8ee" }}>{m.name} {m.dose}</div>
                        <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>{m.frequency} · {m.prescriber}</div>
                      </div>
                      <button onClick={() => handleApprovePending(m)} style={{ padding:"5px 12px", background:"rgba(16,185,129,.12)", border:"1px solid rgba(16,185,129,.3)", borderRadius:6, color:"#2dd4a0", fontSize:12, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>✓ Add</button>
                      <button onClick={() => handleRejectPending(m)} style={{ padding:"5px 12px", background:"transparent", border:"1px solid #1a2f4a", borderRadius:6, color:"#b0c4d8", fontSize:12, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>✗ Skip</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Medication rows */}
              <div>
                {filtered.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#98afc4", fontSize: 12, fontFamily: "'DM Mono',monospace" }}>No medications match filters</div>
                )}
                {filtered.map((med, i) => (
                  <div
                    key={med.id}
                    className={`med-row ${selectedMed?.id === med.id ? "selected" : ""}`}
                    style={{ animationDelay: `${i * 40}ms` }}
                    onClick={() => { setSelectedMed(med); setEditingReminder(null); }}
                  >
                    {/* Category dot */}
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: med.color, flexShrink: 0, boxShadow: `0 0 8px ${med.color}80` }} />

                    {/* Name + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#c4d8ee" }}>{med.name}</span>
                        <span style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>{med.brand}</span>
                        {med.flag && (
                          <span style={{ fontSize: 12, background: "rgba(239,68,68,.15)", color: "#f87171", padding: "1px 6px", borderRadius: 8, fontFamily: "'DM Mono',monospace", marginLeft: 2 }}>REVIEW</span>
                        )}
                        {calcDaysLeft(med.refillDate) <= 7 && (
                          <span style={{ fontSize: 12, background: "rgba(245,158,11,.15)", color: "#f59e0b", padding: "1px 6px", borderRadius: 8, fontFamily: "'DM Mono',monospace" }}>REFILL THIS WEEK</span>
                        )}
                        {med.renewalDate && calcDaysLeft(med.renewalDate) <= 30 && (
                          <span style={{ fontSize: 12, background: "rgba(239,68,68,.12)", color: "#f87171", padding: "1px 6px", borderRadius: 8, fontFamily: "'DM Mono',monospace" }}>RENEWAL DUE</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>{med.dose} · {med.frequency} · {med.schedule}{med.rxNumber ? <span style={{ color:"#4a6070" }}> · Rx# {med.rxNumber}</span> : ""}</div>
                    </div>

                    {/* Refill badge */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {(() => { const dl = calcDaysLeft(med.refillDate); return (
                        <div style={{ fontSize: 12, color: dl <= 10 ? "#f59e0b" : "#98afc4", fontFamily: "'DM Mono',monospace", fontWeight: dl <= 10 ? 600 : 400 }}>
                          {dl <= 10 ? `⚠ ${dl}d` : `${dl}d`}
                        </div>
                      ); })()}
                      <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", marginTop: 2 }}>{fmtRefillDate(med.refillDate)}</div>
                    </div>

                    {/* Quick Refilled button */}
                    {med.refillDate && (
                      <button
                        onClick={(e) => markRefilled(med, e)}
                        title="Mark refilled: advances the refill date by the days supply"
                        style={{ flexShrink: 0, padding: "5px 11px", borderRadius: 7, border: `1px solid rgba(16,185,129,${refilledFlash === med.id ? ".55" : ".3"})`, background: `rgba(16,185,129,${refilledFlash === med.id ? ".20" : ".08"})`, color: "#2dd4a0", fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        {refilledFlash === med.id ? "✓ Refilled" : "Refilled"}
                      </button>
                    )}

                    {/* Status dot + reminder badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                      {reminders.find(r => r.medId === med.id) && (
                        <span style={{ fontSize: 12, color: "#f59e0b", fontFamily: "'DM Mono',monospace" }} title="Calendar reminder set">◷</span>
                      )}
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor(med.status), boxShadow: `0 0 6px ${statusColor(med.status)}80` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Interactions panel */}
              <div style={{ marginTop: 24 }}>
                <div className="section-label">Known Interactions</div>
                {INTERACTIONS.map((ix, i) => (
                  <div className="interaction-row" key={i} style={{ borderLeft: `3px solid ${ix.sev === "warn" ? "#f59e0b" : "#4f8ef7"}`, animationDelay: `${i * 50}ms` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      {ix.drugs.map((d, j) => (
                        <span key={d}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#a8c4dc" }}>{d}</span>
                          {j < ix.drugs.length - 1 && <span style={{ fontSize: 12, color: "#a0b4c8", margin: "0 4px" }}>+</span>}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>{ix.note}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — detail panel */}
            {(selectedMed || editingMed) && (
              <div style={{ animation: "fadeUp .3s ease both" }}>

                {/* ── EDIT MODE ── */}
                {editingMed ? (
                  <div style={{ background: "#0b1220", border: "1px solid #4f8ef7", borderRadius: 14, padding: "20px", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid #1c2a40" }}>
                      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: "#dde8f5" }}>Edit–{editingMed.name}</div>
                      <button onClick={() => { setEditingMed(null); setDeleteConfirm(false); }}
                        style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 6, color: "#b0c4d8", fontSize: 13, cursor: "pointer", padding: "4px 8px" }}>✕</button>
                    </div>

                    {[
                      { label: "Medication Name", key: "name" },
                      { label: "Brand Name", key: "brand" },
                      { label: "Dose", key: "dose" },
                      { label: "Frequency", key: "frequency" },
                      { label: "Schedule", key: "schedule" },
                      { label: "Prescriber", key: "prescriber" },
                      { label: "Pharmacy", key: "pharmacy" },
                      { label: "Rx Number", key: "rxNumber" },
                    ].map(({ label, key }) => (
                      <div key={key} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
                        <input
                          type="text"
                          value={editingMed[key] ?? ""}
                          onChange={e => setEditingMed(prev => ({ ...prev, [key]: e.target.value }))}
                          style={{ width: "100%", padding: "8px 11px", background: "#080c14", border: "1px solid #1a2f4a", borderRadius: 7, color: "#c4d8ee", fontSize: 12, fontFamily: "'DM Mono',monospace", outline: "none" }}
                        />
                      </div>
                    ))}

                    {/* Days Supply */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 5 }}>Days Supply</div>
                      <input
                        type="number"
                        min="1" max="365"
                        value={editingMed.daysSupply ?? 30}
                        onChange={e => setEditingMed(prev => ({ ...prev, daysSupply: parseInt(e.target.value) || 30 }))}
                        style={{ width: "100%", padding: "8px 11px", background: "#080c14", border: "1px solid #1a2f4a", borderRadius: 7, color: "#c4d8ee", fontSize: 12, fontFamily: "'DM Mono',monospace", outline: "none" }}
                      />
                      <div style={{ fontSize: 12, color: "#4a5c6a", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>Used by Complete Refill to calculate the next fill date</div>
                    </div>

                    {/* Refill Date */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 5 }}>Refill Date</div>
                      <input
                        type="date"
                        value={editingMed.refillDate ?? ""}
                        onChange={e => setEditingMed(prev => ({ ...prev, refillDate: e.target.value }))}
                        style={{ width: "100%", padding: "8px 11px", background: "#080c14", border: "1px solid #1a2f4a", borderRadius: 7, color: "#c4d8ee", fontSize: 12, fontFamily: "'DM Mono',monospace", outline: "none" }}
                      />
                      {editingMed.refillDate && (
                        <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
                          {calcDaysLeft(editingMed.refillDate)} days from today
                        </div>
                      )}
                    </div>

                    {/* Renewal Date */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 5 }}>Renewal Date (Rx from doctor)</div>
                      <input
                        type="date"
                        value={editingMed.renewalDate ?? ""}
                        onChange={e => setEditingMed(prev => ({ ...prev, renewalDate: e.target.value }))}
                        style={{ width: "100%", padding: "8px 11px", background: "#080c14", border: "1px solid #1a2f4a", borderRadius: 7, color: "#c4d8ee", fontSize: 12, fontFamily: "'DM Mono',monospace", outline: "none" }}
                      />
                      {editingMed.renewalDate && (
                        <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
                          {calcDaysLeft(editingMed.renewalDate)} days until renewal
                        </div>
                      )}
                    </div>

                    {/* Category */}
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 5 }}>Category</div>
                      <select value={editingMed.category}
                        onChange={e => setEditingMed(prev => ({ ...prev, category: e.target.value }))}
                        style={{ width: "100%", padding: "8px 11px", background: "#080c14", border: "1px solid #1a2f4a", borderRadius: 7, color: "#c4d8ee", fontSize: 12, fontFamily: "'DM Mono',monospace", outline: "none" }}>
                        {CATEGORIES.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    {/* Save / Cancel */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                      <button onClick={() => handleSaveMed(editingMed)}
                        style={{ flex: 1, padding: "10px", background: "#10b981", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontFamily: "'Sora',sans-serif", fontWeight: 600, cursor: "pointer" }}>
                        Save Changes
                      </button>
                      <button onClick={() => { setEditingMed(null); setDeleteConfirm(false); }}
                        style={{ padding: "10px 14px", background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 8, color: "#b0c4d8", fontSize: 12, fontFamily: "'Sora',sans-serif", cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>

                    {/* Delete */}
                    {!deleteConfirm ? (
                      <button onClick={() => setDeleteConfirm(true)}
                        style={{ width: "100%", padding: "9px", background: "transparent", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, color: "#f87171", fontSize: 12, fontFamily: "'Sora',sans-serif", cursor: "pointer", opacity: 0.7 }}>
                        Delete Medication
                      </button>
                    ) : (
                      <div style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 10, padding: "14px" }}>
                        <div style={{ fontSize: 12, color: "#c4d8ee", marginBottom: 12, lineHeight: 1.5 }}>
                          Remove <strong>{editingMed.name}</strong> from your medication list? This cannot be undone.
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => handleDeleteMed(editingMed.id)}
                            style={{ flex: 1, padding: "9px", background: "#ef4444", border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontFamily: "'Sora',sans-serif", fontWeight: 600, cursor: "pointer" }}>
                            Yes, Delete
                          </button>
                          <button onClick={() => setDeleteConfirm(false)}
                            style={{ flex: 1, padding: "9px", background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 7, color: "#7eb8d8", fontSize: 12, fontFamily: "'Sora',sans-serif", cursor: "pointer" }}>
                            Keep It
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                ) : (
                  /* ── VIEW MODE ── */
                  <>
                <div style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 14, padding: "20px", marginBottom: 12 }}>

                  {/* Drug header */}
                  <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid #1c2a40" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: "#dde8f5", letterSpacing: "-0.3px" }}>{selectedMed.name}</div>
                        <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", marginTop: 3 }}>{selectedMed.brand} · {selectedMed.category}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <a
                          href={`https://medlineplus.gov/search.html?query=${encodeURIComponent(selectedMed.name)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ padding: "5px 12px", background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)", borderRadius: 6, color: "#2dd4a0", fontSize: 12, fontFamily: "'Sora',sans-serif", cursor: "pointer", fontWeight: 600, textDecoration: "none", display: "inline-block" }}
                        >
                          Learn More ↗
                        </a>
                        <button onClick={() => { setEditingMed({ ...selectedMed, refillDate: toIsoDate(selectedMed.refillDate) || selectedMed.refillDate, renewalDate: toIsoDate(selectedMed.renewalDate) || selectedMed.renewalDate || "", daysSupply: selectedMed.daysSupply ?? 30 }); setDeleteConfirm(false); }}
                          style={{ padding: "5px 12px", background: "#0f1e30", border: "1px solid #1a3050", borderRadius: 6, color: "#7eb8d8", fontSize: 12, fontFamily: "'Sora',sans-serif", cursor: "pointer", fontWeight: 600 }}>
                          Edit
                        </button>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: selectedMed.color, boxShadow: `0 0 10px ${selectedMed.color}80` }} />
                      </div>
                    </div>

                    {selectedMed.flag && (
                      <div style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 8, padding: "9px 12px", marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", marginBottom: 4 }}>FLAGGED FOR REVIEW</div>
                        <div style={{ fontSize: 12, color: "#c4d8ee", lineHeight: 1.5 }}>{selectedMed.flagNote}</div>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="section-label">Dosage Details</div>
                  {[
                    ["Dose", selectedMed.dose],
                    ["Frequency", selectedMed.frequency],
                    ["Schedule", selectedMed.schedule],
                    ["Last Taken", selectedMed.lastTaken],
                  ].map(([k, v]) => (
                    <div className="detail-row" key={k}>
                      <span style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>{k}</span>
                      <span style={{ fontSize: 12, color: "#a8c4dc", fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>{v}</span>
                    </div>
                  ))}

                  <div className="section-label" style={{ marginTop: 18 }}>Refill & Pharmacy</div>
                  {[
                    ["Rx Number",     selectedMed.rxNumber || "–"],
                    ["Pharmacy",      selectedMed.pharmacy  || "–"],
                    ["Prescriber",    selectedMed.prescriber || "–"],
                    ["Days Supply",   `${selectedMed.daysSupply ?? 30} days`],
                    ["Refill Date",   fmtRefillDate(selectedMed.refillDate)],
                    ["Days Remaining", `${calcDaysLeft(selectedMed.refillDate)} days`],
                  ].map(([k, v]) => {
                    const dl = calcDaysLeft(selectedMed.refillDate);
                    return (
                      <div className="detail-row" key={k}>
                        <span style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>{k}</span>
                        <span style={{ fontSize: 12, color: dl <= 10 && k === "Days Remaining" ? "#f59e0b" : "#a8c4dc", fontWeight: dl <= 10 && k === "Days Remaining" ? 600 : 500, textAlign: "right" }}>{v}</span>
                      </div>
                    );
                  })}
                  {(() => {
                    const rd = selectedMed.renewalDate ? calcDaysLeft(selectedMed.renewalDate) : null;
                    const display = selectedMed.renewalDate
                      ? (/^\d{4}-\d{2}-\d{2}$/.test(selectedMed.renewalDate)
                          ? new Date(selectedMed.renewalDate + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })
                          : selectedMed.renewalDate)
                      : null;
                    if (!display) return null;
                    return (
                      <div className="detail-row">
                        <span style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>Renewal Date</span>
                        <span style={{ fontSize: 12, color: rd <= 30 ? "#f87171" : "#a8c4dc", fontWeight: rd <= 30 ? 600 : 500, textAlign: "right" }}>
                          {display}
                          {rd <= 30 && <span style={{ fontSize: 12, background: "rgba(239,68,68,.15)", color: "#f87171", padding: "1px 6px", borderRadius: 8, marginLeft: 6 }}>DUE IN {rd}d</span>}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Refill progress */}
                  <div style={{ marginTop: 16 }}>
                    {(() => {
                      const dl  = calcDaysLeft(selectedMed.refillDate);
                      const sup = selectedMed.daysSupply ?? 30;
                      const pct = Math.min(100, Math.round(dl / sup * 100));
                      return (<>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace" }}>SUPPLY REMAINING</span>
                          <span style={{ fontSize: 12, color: dl <= 10 ? "#f59e0b" : "#98afc4", fontFamily: "'DM Mono',monospace" }}>{pct}%</span>
                        </div>
                        <div style={{ height: 4, background: "#0d1a28", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: dl <= 10 ? "#f59e0b" : selectedMed.color, borderRadius: 4, boxShadow: `0 0 8px ${dl <= 10 ? "#f59e0b" : selectedMed.color}60`, transition: "width .4s ease" }} />
                        </div>
                      </>);
                    })()}
                  </div>

                  {/* ── Complete Refill / Renewal actions ── */}
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #1c2a40", display: "flex", gap: 8 }}>
                    <button
                      onClick={() => handleCompleteRefill(selectedMed)}
                      title={`Advance refill date by ${selectedMed.daysSupply ?? 30} days`}
                      style={{ flex: 1, padding: "9px 10px", background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 8, color: "#2dd4a0", fontSize: 12, fontFamily: "'DM Mono',monospace", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    >
                      {completeFlash === "refill" ? "✓ Refill Recorded!" : "✓ Complete Refill"}
                    </button>
                    <button
                      onClick={() => handleCompleteRenewal(selectedMed)}
                      title="Advance renewal date by 1 year"
                      style={{ flex: 1, padding: "9px 10px", background: "rgba(79,142,247,.1)", border: "1px solid rgba(79,142,247,.3)", borderRadius: 8, color: "#7eb8d8", fontSize: 12, fontFamily: "'DM Mono',monospace", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    >
                      {completeFlash === "renewal" ? "✓ Renewal Recorded!" : "↺ Complete Renewal"}
                    </button>
                  </div>
                </div>

                {/* AI quick actions */}
                <div style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 14, padding: "16px 18px", marginBottom: 12 }}>
                  <div className="section-label">AI Quick Actions</div>
                  {[
                    `Explain ${selectedMed.name} and its purpose for a post-liver-transplant patient`,
                    `Check interactions between ${selectedMed.name} and my other medications`,
                    `What should I monitor clinically while taking ${selectedMed.name}?`,
                  ].map((q, i) => (
                    <button key={i} onClick={() => {
                      localStorage.setItem("mi_ai_pending", q);
                      onNavChange?.("ai");
                    }} style={{
                      width: "100%", marginBottom: 7, padding: "10px 12px", background: "linear-gradient(135deg, rgba(79,142,247,.1), rgba(167,139,250,.07))",
                      border: "1px solid rgba(79,142,247,.25)", borderRadius: 9, color: "#7eb8d8", fontFamily: "'Sora',sans-serif",
                      fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, textAlign: "left"
                    }}>
                      <span style={{ color: "#6ea3ff", fontSize: 13, flexShrink: 0 }}>✦</span>
                      <span>{q}</span>
                    </button>
                  ))}
                </div>

                {/* ── Reminders ── */}
                {(() => {
                  const existing = reminders.find(r => r.medId === selectedMed.id);
                  const isEditing = editingReminder === selectedMed.id;
                  return (
                    <div style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 14, padding: "16px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div className="section-label" style={{ marginBottom: 0 }}>Reminders</div>
                        {!isEditing && (
                          <button
                            onClick={() => {
                              setReminderForm(existing
                                ? { times: [...existing.times], endDate: existing.endDate || "", enabled: existing.enabled }
                                : { times: ["08:00"], endDate: "", enabled: true });
                              setEditingReminder(selectedMed.id);
                            }}
                            style={{ fontSize: 12, color: "#6ea3ff", fontFamily: "'DM Mono',monospace", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          >{existing ? "Edit" : "+ Set Reminder"}</button>
                        )}
                      </div>

                      {/* Existing reminder summary */}
                      {existing && !isEditing && (
                        <div style={{ background: "#07090f", border: "1px solid #1c2a40", borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                            {existing.times.map(t => (
                              <span key={t} style={{ fontSize: 12, color: "#7eb8d8", background: "rgba(79,142,247,.1)", border: "1px solid rgba(79,142,247,.2)", borderRadius: 6, padding: "2px 8px", fontFamily: "'DM Mono',monospace" }}>
                                {new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                              </span>
                            ))}
                          </div>
                          {existing.endDate && (
                            <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>
                              Until {new Date(existing.endDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </div>
                          )}
                          <button
                            onClick={() => downloadICS(selectedMed, existing)}
                            style={{ width: "100%", padding: "7px 10px", background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)", borderRadius: 7, color: "#2dd4a0", fontSize: 12, fontFamily: "'DM Mono',monospace", cursor: "pointer" }}
                          >📅 Download Calendar File</button>
                          <div style={{ fontSize: 12, color: "#4a5c6a", fontFamily: "'DM Mono',monospace", marginTop: 6, lineHeight: 1.55, textAlign: "center" }}>
                            Open the downloaded file on your phone to add to Apple Calendar, Google Calendar, or Outlook
                          </div>
                        </div>
                      )}

                      {/* No reminder placeholder */}
                      {!existing && !isEditing && (
                        <div style={{ fontSize: 12, color: "#4a5c6a", fontFamily: "'DM Mono',monospace", textAlign: "center", padding: "8px 0" }}>
                          No reminders set for this medication
                        </div>
                      )}

                      {/* Editor */}
                      {isEditing && (
                        <div>
                          <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>Reminder Times</div>
                          {reminderForm.times.map((t, i) => (
                            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                              <input
                                type="time"
                                value={t}
                                onChange={e => {
                                  const updated = [...reminderForm.times];
                                  updated[i] = e.target.value;
                                  setReminderForm(f => ({ ...f, times: updated }));
                                }}
                                style={{ flex: 1, padding: "7px 10px", background: "#080c14", border: "1px solid #1a2f4a", borderRadius: 7, color: "#c4d8ee", fontSize: 12, fontFamily: "'DM Mono',monospace", outline: "none" }}
                              />
                              {reminderForm.times.length > 1 && (
                                <button onClick={() => setReminderForm(f => ({ ...f, times: f.times.filter((_, j) => j !== i) }))}
                                  style={{ background: "none", border: "none", color: "#f87171", fontSize: 14, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>✕</button>
                              )}
                            </div>
                          ))}
                          {reminderForm.times.length < 5 && (
                            <button onClick={() => setReminderForm(f => ({ ...f, times: [...f.times, "12:00"] }))}
                              style={{ width: "100%", marginBottom: 14, padding: "6px 10px", fontSize: 12, color: "#6ea3ff", fontFamily: "'DM Mono',monospace", background: "none", border: "1px dashed rgba(79,142,247,.3)", borderRadius: 6, cursor: "pointer" }}>
                              + Add another time
                            </button>
                          )}

                          <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>End Date (optional)</div>
                          <input
                            type="date"
                            value={reminderForm.endDate}
                            onChange={e => setReminderForm(f => ({ ...f, endDate: e.target.value }))}
                            style={{ width: "100%", padding: "7px 10px", background: "#080c14", border: "1px solid #1a2f4a", borderRadius: 7, color: "#c4d8ee", fontSize: 12, fontFamily: "'DM Mono',monospace", outline: "none", marginBottom: 4 }}
                          />
                          {reminderForm.endDate
                            ? <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", marginBottom: 12 }}>Reminder stops after this date</div>
                            : <div style={{ marginBottom: 12 }} />
                          }

                          <div style={{ fontSize: 12, color: "#4a5c6a", fontFamily: "'DM Mono',monospace", marginBottom: 10, padding: "7px 10px", background: "rgba(79,142,247,.05)", borderRadius: 6, border: "1px solid rgba(79,142,247,.1)", lineHeight: 1.6 }}>
                            📅 Saving downloads a calendar file. Open it on your phone to add the reminder to Apple Calendar, Google Calendar, or Outlook. Your device will handle all alerts.
                          </div>

                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={handleSaveReminder}
                              style={{ flex: 1, padding: "9px", background: "#10b981", border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontFamily: "'Sora',sans-serif", fontWeight: 600, cursor: "pointer" }}>
                              Save
                            </button>
                            <button onClick={() => setEditingReminder(null)}
                              style={{ padding: "9px 12px", background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 7, color: "#b0c4d8", fontSize: 12, cursor: "pointer" }}>
                              Cancel
                            </button>
                            {existing && (
                              <button onClick={() => handleDeleteReminder(selectedMed.id)}
                                style={{ padding: "9px 12px", background: "transparent", border: "1px solid rgba(239,68,68,.3)", borderRadius: 7, color: "#f87171", fontSize: 12, cursor: "pointer" }}>
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

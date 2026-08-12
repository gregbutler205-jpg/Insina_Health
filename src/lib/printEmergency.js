// ── Emergency Information print (UI-9: directly accessible from the shared
// sidebar on every screen, not only the Dashboard hot button).
//
// Layout goals (Greg, 2026-07-20): a visible Print button (auto-print alone
// strands the card if the dialog is cancelled), two-column sections, patient
// demographics + contact info, blood type unmissable, and the ED essentials:
// code status / advance directive / implanted devices (new Health Profile
// fields), care team with phones (coordinator first), and the stored
// insurance / ID card images.
//
// AUDIT_SEC_02 F-01: every interpolated value below is patient-entered or
// AI/OCR-derived (imported-document extraction can populate condition/med/
// allergy/lab names, and the free-text profile fields). This builder feeds
// window.document.write() at same-origin while the vault is unlocked, so an
// unescaped value here is a full-record XSS, not a cosmetic bug — the same
// class S-02/PG-02 closed for the AI-analysis renderer. escapeHtml wraps
// EVERY interpolation, including inside tel: href attributes (quotes must be
// escaped there too, not just text nodes) — printMedicationList.js's local
// `esc()` only escapes & < > because it never populates an attribute; this
// file does, so it uses the fuller shared escapeHtml instead. Card front/back
// images are normally base64 data URIs (compressImage output) whose alphabet
// carries no HTML metacharacters — so escaping them is a no-op on real data —
// but they are escaped anyway (defense in depth): a tampered or restored
// mi_cards that ever put a non-base64 string in a src can't break out.
import { escapeHtml } from "./renderAiText.js";

/** Pure HTML builder — exported so the card's content is testable without a window. */
export function buildEmergencyHtml() {
  const safe = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
  const safeObj = k => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };
  const profile   = safeObj("mi_profile_personal");
  const conditions = safe("mi_conditions").filter(c => c.status !== "inactive");
  const meds      = safe("mi_meds_full").filter(m => m.status !== "inactive");
  const allergies = safe("mi_allergies");
  const contacts  = safe("mi_emergency_contacts");
  const careTeam  = safe("mi_care_team");
  const cards     = safe("mi_cards");
  const labs      = safe("mi_labs");
  // Optional chaining: import.meta.env is a Vite-time global, absent when this
  // pure function is imported under plain Node (scripts/testEmergencyCardEscaping.mjs).
  const logoUrl   = (import.meta.env?.BASE_URL || "/") + "logo.png";

  // The profile has carried blood type under two keys across schema versions
  // ("blood" is what the Health Profile edits today; "bloodType" is legacy).
  const bloodType = profile.blood || profile.bloodType || "";
  const sex       = profile.sex || profile.gender || "";

  // ── Labs on the card: ONLY the most recent draw per panel ──────────────────
  // A clinician wants one coherent snapshot per panel — every value from the
  // same draw — not a mix of dates. Panels are ordered by the patient's own
  // Settings → Lab Category Order (mi_lab_category_order). `aliases` covers
  // legacy/demo category names so the card still populates on old records.
  const CARD_PANELS = [
    { key: "Liver Function",          aliases: ["Liver Function", "Liver Panel"] },
    { key: "Kidney Function",         aliases: ["Kidney Function", "Renal Function"] },
    { key: "Immunosuppressant Level", aliases: ["Immunosuppressant Level", "Immunosuppression"] },
    { key: "Metabolic Panel",         aliases: ["Metabolic Panel", "Chemistry", "Electrolytes"] },
    { key: "CBC",                     aliases: ["CBC", "CBC / Hematology"] },
  ];
  const catOrder = (() => {
    try { const o = JSON.parse(localStorage.getItem("mi_lab_category_order") || "null"); return Array.isArray(o) ? o : []; }
    catch { return []; }
  })();
  const ordered = CARD_PANELS
    .map((p, i) => { const idx = catOrder.indexOf(p.key); return { ...p, sort: idx === -1 ? 900 + i : idx }; })
    .sort((a, b) => a.sort - b.sort);
  // Walk in render order so an analyte printed in an earlier panel never repeats.
  const shown = new Set();
  const labPanels = [];
  for (const p of ordered) {
    const rows = labs.filter(l => p.aliases.includes(l.category));
    if (!rows.length) continue;
    const latest = rows.reduce((max, l) => ((l.date || "") > max ? (l.date || "") : max), "");
    const onDay = rows.filter(l => (l.date || "") === latest).filter(l => {
      const k = (l.name || "").toLowerCase().trim();
      if (!k || shown.has(k)) return false;
      shown.add(k); return true;
    });
    if (onDay.length) labPanels.push({ key: p.key, latest, rows: onDay });
  }

  const date = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });

  // Two-column section: rows lay out in a 2-col grid; whole section resists page breaks.
  const section = (title, rows) => rows.length === 0 ? "" : `
    <div class="section">
      <div class="section-title">${title}</div>
      <div class="cols">${rows.map(r => `<div class="row">${r}</div>`).join("")}</div>
    </div>`;

  const kv = (label, value) => value ? `<span class="dim">${escapeHtml(label)}:</span> ${escapeHtml(value)}` : "";

  const demoRows = [
    kv("DOB", profile.dob), kv("Age", profile.age), kv("Sex", sex),
    kv("Height", profile.height), kv("Weight", profile.weight),
    kv("Phone", profile.phone), kv("Email", profile.email), kv("Address", profile.address),
  ].filter(Boolean);

  // ED-critical status: only rows that are actually filled in print.
  const statusRows = [
    profile.codeStatus        ? `<strong>Code Status:</strong> ${escapeHtml(profile.codeStatus)}` : "",
    profile.advanceDirective  ? `<strong>Advance Directive:</strong> ${escapeHtml(profile.advanceDirective)}` : "",
    profile.implantedDevices  ? `<strong>Implanted Devices:</strong> ${escapeHtml(profile.implantedDevices)}` : "",
  ].filter(Boolean);

  const condRows = conditions.map(c => `<span class="badge cond">${escapeHtml(c.name)}</span>${c.severity ? ` <span class="dim">${escapeHtml(c.severity)}</span>` : ""}`);
  const medRows  = meds.map(m => `<strong>${escapeHtml(m.name)}</strong>${m.dose ? ` ${escapeHtml(m.dose)}` : ""}${m.frequency ? ` — ${escapeHtml(m.frequency)}` : ""}${m.prescriber ? ` <span class="dim">(${escapeHtml(m.prescriber)})</span>` : ""}`);
  const algRows  = allergies.map(a => `<span class="badge allergy">${escapeHtml(a.allergen || a.name)}</span>${a.reaction ? ` <span class="dim">→ ${escapeHtml(a.reaction)}</span>` : ""}`);
  const ctRows   = contacts.map(c => `<strong>${escapeHtml(c.name)}</strong>${c.relationship ? ` (${escapeHtml(c.relationship)})` : ""} — <a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a>`);

  // Care team — anyone with a 24-hour line first (that's the number an ED
  // calls at 2 AM), then the transplant coordinator, then the rest.
  const teamSorted = [...careTeam].sort((a, b) => {
    const rank = p => p.phone24 ? 0 : /coordinator/i.test(`${p.role || ""} ${p.specialty || ""}`) ? 1 : 2;
    return rank(a) - rank(b);
  });
  const teamRows = teamSorted.map(p =>
    `<strong>${escapeHtml(p.name)}</strong>${p.role || p.specialty ? ` <span class="dim">(${escapeHtml(p.role || p.specialty)})</span>` : ""}` +
    (p.phone24 ? ` — <strong style="color:#dc2626">24 hr: <a href="tel:${escapeHtml(p.phone24)}" style="color:#dc2626">${escapeHtml(p.phone24)}</a></strong>` : "") +
    (p.phone ? ` ${p.phone24 ? '<span class="dim">· office:</span>' : "—"} <a href="tel:${escapeHtml(p.phone)}">${escapeHtml(p.phone)}</a>` : "")
  );

  const fmtDay = iso => { try { return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" }); } catch { return iso; } };
  const labSections = labPanels.map(p => section(
    `${p.key} — ${p.latest ? fmtDay(p.latest) : "date unknown"}`, // p.key is a literal from CARD_PANELS, not user data
    p.rows.map(l => `${l.flag ? '<span class="badge flag">⚠</span> ' : ""}<strong>${escapeHtml(l.name)}</strong>: ${escapeHtml(l.value)}${l.unit ? " " + escapeHtml(l.unit) : ""}${l.refRange ? ` <span class="dim">(ref ${escapeHtml(l.refRange)})</span>` : ""}`)
  )).join("");

  // Insurance / ID card images (front + back where present), full width.
  // front/back are normally base64 data URIs (compressImage output) with no HTML
  // metacharacters, so escapeHtml is a no-op on real data — but src and label are
  // both escaped so a tampered mi_cards value can't break out of the attribute.
  const cardImgs = cards.flatMap(c => [
    c.front ? `<div class="idcard"><div class="idcard-lbl">${escapeHtml(c.label || "Card")} — front</div><img src="${escapeHtml(c.front)}" /></div>` : "",
    c.back  ? `<div class="idcard"><div class="idcard-lbl">${escapeHtml(c.label || "Card")} — back</div><img src="${escapeHtml(c.back)}" /></div>` : "",
  ].filter(Boolean));
  const cardSection = cardImgs.length === 0 ? "" : `
    <div class="section">
      <div class="section-title">Insurance &amp; ID Cards</div>
      <div class="cardgrid">${cardImgs.join("")}</div>
    </div>`;

  return `<!DOCTYPE html><html><head>
    <title>Emergency Info — ${escapeHtml(profile.name || "Patient")}</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:Arial,sans-serif; max-width:820px; margin:36px auto; color:#1a1a1a; font-size:13px; line-height:1.6; padding:0 20px; }
      .logo { height:44px; margin-bottom:14px; }
      h1 { font-size:26px; font-weight:700; text-align:center; margin-bottom:6px; }
      .idline { font-size:12px; color:#555; text-align:center; margin-bottom:8px; font-family:monospace; }
      .bloodbadge { display:block; width:max-content; margin:0 auto 6px; border:2.5px solid #dc2626; color:#dc2626; border-radius:8px; padding:3px 16px; font-size:16px; font-weight:800; letter-spacing:1px; }
      .rule { border:none; border-top:3px solid #dc2626; margin:14px 0; }
      .section { margin-bottom:16px; break-inside:avoid; }
      .section-title { font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#dc2626; margin-bottom:6px; border-bottom:1px solid #f5c6c6; padding-bottom:4px; }
      .cols { display:grid; grid-template-columns:1fr 1fr; gap:0 28px; }
      .row { padding:3.5px 0; border-bottom:1px solid #f0f0f0; font-size:12.5px; break-inside:avoid; }
      .badge { display:inline-block; padding:1px 8px; border-radius:10px; font-size:11px; font-weight:600; }
      .badge.cond { background:#dbeafe; color:#1d4ed8; }
      .badge.allergy { background:#fef3c7; color:#92400e; }
      .badge.flag { background:#fee2e2; color:#dc2626; border-radius:4px; padding:0 5px; }
      .dim { color:#777; font-size:11px; }
      a { color:#1d4ed8; text-decoration:none; }
      .cardgrid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .idcard { break-inside:avoid; }
      .idcard img { width:100%; max-height:230px; object-fit:contain; border:1px solid #ddd; border-radius:6px; }
      .idcard-lbl { font-size:10px; font-weight:700; color:#555; margin-bottom:3px; text-transform:uppercase; letter-spacing:0.5px; }
      .printbtn { position:fixed; top:14px; right:14px; padding:9px 22px; background:#dc2626; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.25); }
      .footer { margin-top:28px; border-top:1px solid #ddd; padding-top:10px; font-size:10px; color:#999; display:flex; justify-content:space-between; }
      @media print { body { margin:20px; } .printbtn { display:none; } }
      @media (max-width:560px) { .cols, .cardgrid { grid-template-columns:1fr; } }
    </style>
  </head><body>
    <button class="printbtn" onclick="window.print()">🖨 Print</button>
    <img src="${logoUrl}" class="logo" />
    <h1>${escapeHtml(profile.name || "Patient Emergency Information")}</h1>
    ${bloodType ? `<div class="bloodbadge">BLOOD TYPE ${escapeHtml(bloodType)}</div>` : ""}
    <div class="idline">${[profile.dob && `DOB: ${escapeHtml(profile.dob)}`, profile.age && `Age: ${escapeHtml(profile.age)}`, sex && escapeHtml(sex)].filter(Boolean).join("  ·  ")}</div>
    <hr class="rule" />
    ${section("Patient Demographics &amp; Contact", demoRows)}
    ${section("Emergency Contacts", ctRows)}
    ${statusRows.length ? `
    <div class="section">
      <div class="section-title">Code Status, Directives &amp; Devices</div>
      ${statusRows.map(r => `<div class="row">${r}</div>`).join("")}
    </div>` : ""}
    ${section("Allergies", algRows)}
    ${section("Active Conditions", condRows)}
    ${section("Active Medications", medRows)}
    ${section("Care Team", teamRows)}
    ${labSections}
    ${cardSection}
    ${(() => {
      // C-24 provenance lines (HISTORY_BUILDER_SPEC section 5): rendered only
      // for lists the patient has confirmed; absent otherwise.
      try {
        const a = JSON.parse(localStorage.getItem("mi_attestations") || "{}");
        const fmt = (iso) => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); };
        const lines = [];
        if (a.medsCompleteAt) lines.push(`Medication list confirmed by patient on ${fmt(a.medsCompleteAt)}`);
        if (a.allergiesResolvedAt) lines.push(`Allergy list confirmed by patient on ${fmt(a.allergiesResolvedAt)}`);
        if (a.conditionsReviewedAt) lines.push(`Condition list confirmed by patient on ${fmt(a.conditionsReviewedAt)}`);
        return lines.length ? `<div style="font-size:9px;color:#777;margin-top:10px">${lines.map(escapeHtml).join(" &middot; ")}</div>` : "";
      } catch { return ""; }
    })()}
    <div class="footer">
      <span>Insina Health &mdash; Emergency Information</span>
      <span>Printed ${date}</span>
    </div>
    <script>window.onload = function(){ window.print(); }<\/script>
  </body></html>`;
}

export function printEmergency() {
  const win = window.open("", "_blank", "width=880,height=780");
  if (!win) return; // popup blocked — same convention as printMedicationList
  win.document.write(buildEmergencyHtml());
  win.document.close();
}

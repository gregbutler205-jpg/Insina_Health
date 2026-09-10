// ─────────────────────────────────────────────────────────────────────────────
// demoData.js — Anonymized sample dataset for IntelliTrax / Insina Health
// Patient identity is fictional. Medical profile is representative of a
// post-liver-transplant patient on standard immunosuppression.
// ─────────────────────────────────────────────────────────────────────────────

// Saved example analysis shown in My Notes on the demo (see mi_notes below).
// Written to the DEC-041 question rules: one umbrella question per topic, no
// named test/dose/timing changes, and education stated as fact without
// mechanism or predicted physician actions.
const AI_EXAMPLE_BODY = `**Bottom line**
Your liver enzymes look stable, but three results from your April 28 labs are worth raising with your care team: your tacrolimus level, your kidney numbers, and your fasting glucose. Bring these to your team before changing anything.

-----

**What your data shows**
- Tacrolimus trough was 4.8 ng/mL on April 28, 2026, below your lab's reference range of 5-15. The March 15 draw was 5.3.
- ALT 38 U/L and AST 28 U/L on April 28, both within range and steady since March.
- Creatinine 1.4 mg/dL and eGFR 58 on April 28, both outside the reference range. Your record lists CKD Stage 2 related to tacrolimus.
- Fasting glucose 118 mg/dL, above the 70-99 reference range.
- Alkaline phosphatase 142 U/L on April 28, within range, after 156 on March 15.

**What may need attention**
- Your tacrolimus trough moved from 5.3 to 4.8 between March and April, and the most recent value sits below the reference range printed on your report.
- Creatinine and eGFR were both outside the range on the most recent draw. Your care team list shows Dr. Park co-managing this with Dr. Chen.
- Fasting glucose has been running above the reference range.

**Questions for your care team**
- "My tacrolimus level came back below the range on my last draw. Is there anything we need to do differently?"
- "My kidney numbers were outside the range again in April. Is there anything we should be watching?"
- "My fasting glucose has been running above range. Is there anything we need to look at?"

**Why you're asking**
- Tacrolimus levels can shift with dose timing, food, and other medicines.
- Tacrolimus can affect kidney function over time.
- Steroids taken after a transplant can raise blood sugar. Ask your physician if you'd like more information.
- Alkaline phosphatase can come from bone as well as from the liver.
- If your doctor's answer doesn't cover any of these, ask about that one directly.`;

export const DEMO_DATA = {

  // ── Profile ────────────────────────────────────────────────────────────────
  mi_profile_personal: {
    name:      "Alex Rivera",
    dob:       "1973-09-14",
    gender:    "Male",
    blood:     "A+",
    height:    "5'11\"",
    weight:    "192",
    email:     "alex.rivera@example.com",
    phone:     "(555) 847-2931",
    emergency: "Maria Rivera — (555) 847-3042 (Spouse)",
  },

  mi_profile_insurance: {
    primary:   "BlueCross BlueShield PPO",
    memberId:  "BCB-7741928",
    group:     "GRP-0044812",
    phone:     "1-800-624-0060",
    secondary: "Medicare Part B",
  },

  // ── Allergies ──────────────────────────────────────────────────────────────
  mi_allergies: [
    { id: 1700000001, name: "Penicillin",      reaction: "Hives, facial swelling",       severity: "Moderate" },
    { id: 1700000002, name: "Sulfa (non-Bactrim)", reaction: "Rash",                     severity: "Mild" },
    { id: 1700000003, name: "Shellfish (iodine)", reaction: "Nausea, flushing",           severity: "Mild" },
  ],

  // ── Conditions ─────────────────────────────────────────────────────────────
  mi_conditions: [
    { id: 1700000010, name: "Status Post Living Donor Liver Transplant (LDLT)",
      status: "active", severity: "Major — ongoing management",
      since: "2024-10-01",
      notes: "Transplanted Oct 1 2024, UMC Transplant Center. 12-month biopsy (Oct 2025) showed no acute rejection. On triple immunosuppression: Tacrolimus + Mycophenolate + Prednisone." },
    { id: 1700000011, name: "Primary Sclerosing Cholangitis (PSC)",
      status: "history", severity: "Resolved — transplant indication",
      since: "2018-03-01",
      notes: "Pre-transplant diagnosis. Liver transplant performed for end-stage PSC with cirrhosis. PSC can recur in the transplanted liver; monitored with LFTs and cholangiography." },
    { id: 1700000012, name: "Hypertension",
      status: "active", severity: "Moderate — controlled on medication",
      since: "2020-06-01",
      notes: "Managed with Amlodipine 10mg + Metoprolol 25mg BID. BP target < 130/80. Tacrolimus and cyclosporine can worsen hypertension." },
    { id: 1700000013, name: "Post-Transplant Diabetes Mellitus (PTDM)",
      status: "active", severity: "Moderate — on dietary management",
      since: "2025-01-15",
      notes: "Developed post-transplant; exacerbated by Tacrolimus and Prednisone. HbA1c trending down with dietary changes. Monitoring fasting glucose at each lab draw." },
    { id: 1700000014, name: "Hyperlipidemia",
      status: "active", severity: "Mild — controlled on statin",
      since: "2021-04-01",
      notes: "On Atorvastatin 40mg QD. LDL last measured 94 mg/dL. Statin choice guided by tacrolimus interaction profile (avoid lovastatin/simvastatin)." },
    { id: 1700000015, name: "Chronic Kidney Disease, Stage 2 (Tacrolimus-related Nephrotoxicity)",
      status: "active", severity: "Mild — under nephrology monitoring",
      since: "2025-06-01",
      notes: "eGFR trending 58–65 mL/min. Creatinine mildly elevated. Tacrolimus dose adjusted to maintain lower trough (target 3–6 ng/mL per hepatology). Nephrology consult scheduled." },
  ],

  // ── Surgical History ───────────────────────────────────────────────────────
  mi_surgeries: [
    { id: 1700000020, procedure: "Living Donor Liver Transplant (LDLT)",
      date: "2024-10-01", surgeon: "Dr. Rebecca Walsh, MD",
      facility: "University Medical Center — Transplant Center",
      notes: "Living donor: sibling. Induction with Basiliximab + methylprednisolone. Immediate graft function. Bile duct anastomosis: duct-to-duct.",
      outcome: "Successful — excellent early graft function" },
    { id: 1700000021, procedure: "Protocol Liver Biopsy — 12-Month Post-Transplant",
      date: "2025-10-14", surgeon: "Dr. Rebecca Walsh, MD",
      facility: "University Medical Center",
      notes: "Routine protocol biopsy at 12-month mark.",
      outcome: "No acute rejection. Minimal portal inflammation (Grade 1). No fibrosis." },
    { id: 1700000022, procedure: "Right Total Hip Arthroplasty",
      date: "2021-03-15", surgeon: "Dr. Kevin Marsh, MD",
      facility: "Orthopedic Surgery Center",
      notes: "Osteoarthritis. Ceramic-on-polyethylene implant. Relevant: bone-source ALP elevations may persist post-arthroplasty.",
      outcome: "Good — full weight-bearing at 6 weeks" },
  ],

  // ── Care Team ──────────────────────────────────────────────────────────────
  mi_care_team: [
    { id: 1700000030, name: "Dr. Sarah Chen, MD",
      role: "Hepatology / Transplant Medicine",
      specialty: "Transplant Hepatology",
      facility: "University Medical Center — Liver Transplant Program",
      phone: "(555) 294-8800", email: "s.chen@umc.example.com",
      notes: "Primary transplant hepatologist. Manages immunosuppression, LFT monitoring, rejection surveillance." },
    { id: 1700000031, name: "Dr. Michael Torres, MD",
      role: "Primary Care Physician (PCP)",
      specialty: "Internal Medicine / Primary Care",
      facility: "City Medical Group",
      phone: "(555) 381-7700", email: "m.torres@citymg.example.com",
      notes: "PCP for general health, BP management, diabetes, lipids, preventive care." },
    { id: 1700000032, name: "Dr. James Park, MD",
      role: "Nephrology",
      specialty: "Kidney Disease / Transplant Nephrology",
      facility: "University Medical Center",
      phone: "(555) 294-9120", email: "j.park@umc.example.com",
      notes: "Monitoring CKD Stage 2 secondary to tacrolimus nephrotoxicity. Co-managing tacrolimus trough targets with Dr. Chen." },
    { id: 1700000033, name: "Dr. Rebecca Walsh, MD",
      role: "Transplant Surgeon (Historical)",
      specialty: "Hepatobiliary and Transplant Surgery",
      facility: "University Medical Center — Transplant Center",
      phone: "(555) 294-8700", email: "",
      notes: "Performed LDLT Oct 2024 and 12-month protocol biopsy. Active follow-up completed; deferred to Dr. Chen for ongoing care." },
    { id: 1700000034, name: "Quest Diagnostics",
      role: "Laboratory",
      specialty: "Clinical Laboratory Services",
      facility: "Quest Diagnostics — Westside Patient Service Center",
      phone: "(555) 882-4400", email: "",
      notes: "Routine lab draws. Tacrolimus trough levels drawn 30 min before AM dose." },
  ],

  // ── Medications ────────────────────────────────────────────────────────────
  mi_meds_full: [
    { id: 1700000040, name: "Tacrolimus", brand: "Prograf",
      dose: "3 mg", frequency: "Twice daily", schedule: "7:00 AM / 7:00 PM",
      category: "Immunosuppressant", status: "ok",
      refillDate: "2026-06-12", prescriber: "Dr. Sarah Chen",
      pharmacy: "University Medical Center Pharmacy",
      rxNumber: "RX-4481920", color: "#a78bfa",
      notes: "Trough target 3–6 ng/mL per Dr. Chen. Draw level 30 min before AM dose. Do NOT take with grapefruit juice.",
      flag: false, flagNote: "" },
    { id: 1700000041, name: "Mycophenolate Mofetil", brand: "CellCept",
      dose: "500 mg", frequency: "Twice daily", schedule: "8:00 AM / 8:00 PM",
      category: "Immunosuppressant", status: "ok",
      refillDate: "2026-06-05", prescriber: "Dr. Sarah Chen",
      pharmacy: "University Medical Center Pharmacy",
      rxNumber: "RX-4481921", color: "#a78bfa",
      notes: "Take on empty stomach or consistently with food. Monitor CBC monthly for leukopenia.",
      flag: false, flagNote: "" },
    { id: 1700000042, name: "Prednisone", brand: "",
      dose: "5 mg", frequency: "Once daily", schedule: "8:00 AM with food",
      category: "Corticosteroid", status: "refill",
      refillDate: "2026-05-20", prescriber: "Dr. Sarah Chen",
      pharmacy: "City Pharmacy",
      rxNumber: "RX-3312844", color: "#f59e0b",
      notes: "Do not stop abruptly. Take with food to reduce GI irritation. Long-term use: bone density monitoring.",
      flag: false, flagNote: "" },
    { id: 1700000043, name: "Amlodipine", brand: "Norvasc",
      dose: "10 mg", frequency: "Once daily", schedule: "8:00 AM",
      category: "Blood Pressure", status: "ok",
      refillDate: "2026-06-18", prescriber: "Dr. Michael Torres",
      pharmacy: "City Pharmacy",
      rxNumber: "RX-2287341", color: "#4f8ef7",
      notes: "Monitor for ankle edema (common side effect).",
      flag: false, flagNote: "" },
    { id: 1700000044, name: "Metoprolol Succinate", brand: "Toprol-XL",
      dose: "25 mg", frequency: "Twice daily", schedule: "8:00 AM / 8:00 PM",
      category: "Blood Pressure", status: "ok",
      refillDate: "2026-06-08", prescriber: "Dr. Michael Torres",
      pharmacy: "City Pharmacy",
      rxNumber: "RX-2287342", color: "#4f8ef7",
      notes: "Do not stop abruptly. Monitor heart rate.",
      flag: false, flagNote: "" },
    { id: 1700000045, name: "Furosemide", brand: "Lasix",
      dose: "40 mg", frequency: "Once daily", schedule: "8:00 AM",
      category: "Diuretic", status: "ok",
      refillDate: "2026-06-01", prescriber: "Dr. Sarah Chen",
      pharmacy: "City Pharmacy",
      rxNumber: "RX-3312845", color: "#10b981",
      notes: "Monitor electrolytes (potassium, magnesium). Take in AM to avoid nocturia.",
      flag: false, flagNote: "" },
    { id: 1700000046, name: "Atorvastatin", brand: "Lipitor",
      dose: "40 mg", frequency: "Once daily", schedule: "Bedtime",
      category: "Cholesterol", status: "ok",
      refillDate: "2026-07-02", prescriber: "Dr. Michael Torres",
      pharmacy: "City Pharmacy",
      rxNumber: "RX-2287343", color: "#7eb8d8",
      notes: "Monitor LFTs. Use low-dose statin with tacrolimus — avoid lovastatin/simvastatin (CYP3A4 interaction).",
      flag: false, flagNote: "" },
    { id: 1700000047, name: "Pantoprazole", brand: "Protonix",
      dose: "40 mg", frequency: "Once daily", schedule: "30 min before breakfast",
      category: "GI / Protective", status: "ok",
      refillDate: "2026-06-28", prescriber: "Dr. Michael Torres",
      pharmacy: "City Pharmacy",
      rxNumber: "RX-2287344", color: "#10b981",
      notes: "GI protection while on long-term corticosteroids.",
      flag: false, flagNote: "" },
    { id: 1700000048, name: "Trimethoprim/Sulfamethoxazole", brand: "Bactrim DS",
      dose: "800/160 mg", frequency: "3x weekly (Mon/Wed/Fri)", schedule: "8:00 AM",
      category: "Antibiotic / Prophylaxis", status: "refill",
      refillDate: "2026-05-22", prescriber: "Dr. Sarah Chen",
      pharmacy: "University Medical Center Pharmacy",
      rxNumber: "RX-4481922", color: "#98afc4",
      notes: "PCP (Pneumocystis jirovecii) prophylaxis. Standard post-transplant prophylaxis for first year; continued per Dr. Chen. Note: patient has sulfa allergy — Bactrim approved by prescriber as separate compound.",
      flag: false, flagNote: "" },
    { id: 1700000049, name: "Valganciclovir", brand: "Valcyte",
      dose: "450 mg", frequency: "Once daily", schedule: "8:00 AM with food",
      category: "Antiviral / Prophylaxis", status: "warn",
      refillDate: "2026-05-24", prescriber: "Dr. Sarah Chen",
      pharmacy: "University Medical Center Pharmacy",
      rxNumber: "RX-4481923", color: "#ef4444",
      notes: "CMV prophylaxis. Monitor CBC — can cause myelosuppression (WBC/platelet suppression). Dr. Chen reviewing dose given declining WBC trend.",
      flag: true, flagNote: "WBC trending low (4.2 → 3.9 → 3.7). Dr. Chen reviewing — possible Valcyte dose reduction at next visit." },
    { id: 1700000050, name: "Atorvastatin", brand: "",
      dose: "40 mg", frequency: "Once daily", schedule: "Bedtime",
      category: "Cholesterol", status: "inactive",
      refillDate: "", prescriber: "Dr. Michael Torres",
      pharmacy: "", rxNumber: "", color: "#8299ad",
      notes: "Duplicate entry — inactive.",
      flag: false, flagNote: "" },
    { id: 1700000051, name: "Vitamin D3", brand: "",
      dose: "2000 IU", frequency: "Once daily", schedule: "8:00 AM with food",
      category: "Supplement", status: "ok",
      refillDate: "2026-07-15", prescriber: "Dr. Sarah Chen",
      pharmacy: "City Pharmacy",
      rxNumber: "", color: "#dde8f5",
      notes: "Bone health — long-term corticosteroid use depletes Vitamin D.",
      flag: false, flagNote: "" },
    { id: 1700000052, name: "Calcium Carbonate", brand: "",
      dose: "500 mg", frequency: "Twice daily", schedule: "With meals",
      category: "Supplement", status: "ok",
      refillDate: "2026-07-15", prescriber: "Dr. Sarah Chen",
      pharmacy: "City Pharmacy",
      rxNumber: "", color: "#dde8f5",
      notes: "Take with meals for optimal absorption. Bone protection with Vitamin D.",
      flag: false, flagNote: "" },
    { id: 1700000053, name: "Magnesium Oxide", brand: "",
      dose: "400 mg", frequency: "Once daily", schedule: "Bedtime",
      category: "Supplement", status: "ok",
      refillDate: "2026-06-22", prescriber: "Dr. Sarah Chen",
      pharmacy: "City Pharmacy",
      rxNumber: "", color: "#dde8f5",
      notes: "Tacrolimus causes urinary magnesium wasting (hypomagnesemia). Supplement to maintain Mg 1.8–2.2.",
      flag: false, flagNote: "" },
    { id: 1700000054, name: "Aspirin", brand: "",
      dose: "81 mg", frequency: "Once daily", schedule: "8:00 AM with food",
      category: "Antiplatelet", status: "ok",
      refillDate: "2026-08-01", prescriber: "Dr. Michael Torres",
      pharmacy: "City Pharmacy",
      rxNumber: "", color: "#7eb8d8",
      notes: "Cardiovascular prophylaxis. Monitor for GI bleeding given long-term use with Prednisone.",
      flag: false, flagNote: "" },
  ],

  // ── Lab Results (3 date panels) ────────────────────────────────────────────
  mi_labs: [
    // ── April 28, 2026 (most recent) ─────────────────────────────────
    // Immunosuppression
    { name: "Tacrolimus Level (Trough)", value: "4.8", unit: "ng/mL",
      refRange: "5-15", flag: true, date: "2026-04-28",
      category: "Immunosuppression", facility: "Quest Diagnostics",
      notes: "Drawn 30 min before AM dose. Within Dr. Chen's target range of 3–6 ng/mL." },
    // Liver Panel
    { name: "ALT", value: "38", unit: "U/L",
      refRange: "7-56", flag: false, date: "2026-04-28",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "AST", value: "28", unit: "U/L",
      refRange: "10-40", flag: false, date: "2026-04-28",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "Alkaline Phosphatase (ALP)", value: "142", unit: "U/L",
      refRange: "44-147", flag: false, date: "2026-04-28",
      category: "Liver Panel", facility: "Quest Diagnostics",
      notes: "Borderline — trending down from 178 in Feb. Mixed liver/bone source (post-hip arthroplasty)." },
    { name: "GGT", value: "52", unit: "U/L",
      refRange: "9-48", flag: true, date: "2026-04-28",
      category: "Liver Panel", facility: "Quest Diagnostics",
      notes: "Mildly elevated. Improving trend (72 → 61 → 52). Discuss with Dr. Chen." },
    { name: "Bilirubin, Total", value: "0.9", unit: "mg/dL",
      refRange: "0.2-1.2", flag: false, date: "2026-04-28",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "Albumin", value: "4.1", unit: "g/dL",
      refRange: "3.5-5.0", flag: false, date: "2026-04-28",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    // Chemistry / Kidney
    { name: "Creatinine", value: "1.4", unit: "mg/dL",
      refRange: "0.74-1.35", flag: true, date: "2026-04-28",
      category: "Chemistry", facility: "Quest Diagnostics",
      notes: "Mildly elevated — tacrolimus nephrotoxicity. CKD Stage 2. Nephrology consult scheduled." },
    { name: "eGFR", value: "58", unit: "mL/min/1.73m²",
      refRange: "60-999", flag: true, date: "2026-04-28",
      category: "Chemistry", facility: "Quest Diagnostics",
      notes: "Mildly reduced. Trend: 65 → 62 → 58. Stable CKD Stage 2. Being monitored." },
    { name: "BUN", value: "22", unit: "mg/dL",
      refRange: "7-20", flag: true, date: "2026-04-28",
      category: "Chemistry", facility: "Quest Diagnostics", notes: "" },
    // Electrolytes
    { name: "Sodium", value: "139", unit: "mEq/L",
      refRange: "136-145", flag: false, date: "2026-04-28",
      category: "Electrolytes", facility: "Quest Diagnostics", notes: "" },
    { name: "Potassium", value: "4.6", unit: "mEq/L",
      refRange: "3.5-5.0", flag: false, date: "2026-04-28",
      category: "Electrolytes", facility: "Quest Diagnostics",
      notes: "High-normal. Tacrolimus can cause hyperkalemia. Monitor." },
    { name: "Magnesium", value: "1.8", unit: "mg/dL",
      refRange: "1.7-2.2", flag: false, date: "2026-04-28",
      category: "Electrolytes", facility: "Quest Diagnostics",
      notes: "Low-normal. On Magnesium Oxide supplementation." },
    // CBC
    { name: "WBC", value: "4.2", unit: "×10³/µL",
      refRange: "4.5-11.0", flag: true, date: "2026-04-28",
      category: "CBC / Hematology", facility: "Quest Diagnostics",
      notes: "Trending low — mycophenolate/valganciclovir-related leukopenia. Monitor closely." },
    { name: "Hemoglobin", value: "12.8", unit: "g/dL",
      refRange: "13.5-17.5", flag: true, date: "2026-04-28",
      category: "CBC / Hematology", facility: "Quest Diagnostics",
      notes: "Mild anemia — normocytic. Likely drug-related (mycophenolate/valganciclovir)." },
    { name: "Hematocrit", value: "38.4", unit: "%",
      refRange: "41-53", flag: true, date: "2026-04-28",
      category: "CBC / Hematology", facility: "Quest Diagnostics", notes: "" },
    { name: "Platelets", value: "142", unit: "×10³/µL",
      refRange: "150-400", flag: true, date: "2026-04-28",
      category: "CBC / Hematology", facility: "Quest Diagnostics",
      notes: "Mild thrombocytopenia. Immunosuppression-related. Trending toward normal." },
    // Endocrine
    { name: "Glucose (Fasting)", value: "118", unit: "mg/dL",
      refRange: "70-99", flag: true, date: "2026-04-28",
      category: "Endocrine", facility: "Quest Diagnostics",
      notes: "Elevated fasting glucose — PTDM. Improving with dietary changes (was 138 in Jan)." },
    { name: "HbA1c", value: "6.8", unit: "%",
      refRange: "4.0-5.6", flag: true, date: "2026-04-28",
      category: "Endocrine", facility: "Quest Diagnostics",
      notes: "Diabetic range. Down from 7.4% in Jan. Goal < 7.0%. Dietary management working." },
    // Lipids
    { name: "Total Cholesterol", value: "188", unit: "mg/dL",
      refRange: "0-200", flag: false, date: "2026-04-28",
      category: "Lipid Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "LDL Cholesterol", value: "94", unit: "mg/dL",
      refRange: "0-100", flag: false, date: "2026-04-28",
      category: "Lipid Panel", facility: "Quest Diagnostics", notes: "At target on Atorvastatin." },
    { name: "HDL Cholesterol", value: "44", unit: "mg/dL",
      refRange: "40-999", flag: false, date: "2026-04-28",
      category: "Lipid Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "Triglycerides", value: "148", unit: "mg/dL",
      refRange: "0-150", flag: false, date: "2026-04-28",
      category: "Lipid Panel", facility: "Quest Diagnostics", notes: "" },

    // ── March 15, 2026 ────────────────────────────────────────────────
    { name: "Tacrolimus Level (Trough)", value: "5.3", unit: "ng/mL",
      refRange: "5-15", flag: false, date: "2026-03-15",
      category: "Immunosuppression", facility: "Quest Diagnostics", notes: "" },
    { name: "ALT", value: "42", unit: "U/L",
      refRange: "7-56", flag: false, date: "2026-03-15",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "AST", value: "31", unit: "U/L",
      refRange: "10-40", flag: false, date: "2026-03-15",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "Alkaline Phosphatase (ALP)", value: "156", unit: "U/L",
      refRange: "44-147", flag: true, date: "2026-03-15",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "GGT", value: "61", unit: "U/L",
      refRange: "9-48", flag: true, date: "2026-03-15",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "Bilirubin, Total", value: "1.0", unit: "mg/dL",
      refRange: "0.2-1.2", flag: false, date: "2026-03-15",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "Albumin", value: "4.0", unit: "g/dL",
      refRange: "3.5-5.0", flag: false, date: "2026-03-15",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "Creatinine", value: "1.3", unit: "mg/dL",
      refRange: "0.74-1.35", flag: false, date: "2026-03-15",
      category: "Chemistry", facility: "Quest Diagnostics", notes: "" },
    { name: "eGFR", value: "62", unit: "mL/min/1.73m²",
      refRange: "60-999", flag: false, date: "2026-03-15",
      category: "Chemistry", facility: "Quest Diagnostics", notes: "" },
    { name: "WBC", value: "3.9", unit: "×10³/µL",
      refRange: "4.5-11.0", flag: true, date: "2026-03-15",
      category: "CBC / Hematology", facility: "Quest Diagnostics", notes: "" },
    { name: "Hemoglobin", value: "12.4", unit: "g/dL",
      refRange: "13.5-17.5", flag: true, date: "2026-03-15",
      category: "CBC / Hematology", facility: "Quest Diagnostics", notes: "" },
    { name: "Platelets", value: "138", unit: "×10³/µL",
      refRange: "150-400", flag: true, date: "2026-03-15",
      category: "CBC / Hematology", facility: "Quest Diagnostics", notes: "" },
    { name: "Glucose (Fasting)", value: "124", unit: "mg/dL",
      refRange: "70-99", flag: true, date: "2026-03-15",
      category: "Endocrine", facility: "Quest Diagnostics", notes: "" },

    // ── February 3, 2026 ──────────────────────────────────────────────
    { name: "Tacrolimus Level (Trough)", value: "6.1", unit: "ng/mL",
      refRange: "5-15", flag: false, date: "2026-02-03",
      category: "Immunosuppression", facility: "Quest Diagnostics", notes: "" },
    { name: "ALT", value: "51", unit: "U/L",
      refRange: "7-56", flag: false, date: "2026-02-03",
      category: "Liver Panel", facility: "Quest Diagnostics",
      notes: "Mildly elevated. Watch for further rise." },
    { name: "AST", value: "37", unit: "U/L",
      refRange: "10-40", flag: false, date: "2026-02-03",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "Alkaline Phosphatase (ALP)", value: "178", unit: "U/L",
      refRange: "44-147", flag: true, date: "2026-02-03",
      category: "Liver Panel", facility: "Quest Diagnostics",
      notes: "Elevated. Mixed liver/bone source. Trending down on follow-up." },
    { name: "GGT", value: "72", unit: "U/L",
      refRange: "9-48", flag: true, date: "2026-02-03",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "Bilirubin, Total", value: "1.1", unit: "mg/dL",
      refRange: "0.2-1.2", flag: false, date: "2026-02-03",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "Albumin", value: "3.9", unit: "g/dL",
      refRange: "3.5-5.0", flag: false, date: "2026-02-03",
      category: "Liver Panel", facility: "Quest Diagnostics", notes: "" },
    { name: "Creatinine", value: "1.2", unit: "mg/dL",
      refRange: "0.74-1.35", flag: false, date: "2026-02-03",
      category: "Chemistry", facility: "Quest Diagnostics", notes: "" },
    { name: "eGFR", value: "65", unit: "mL/min/1.73m²",
      refRange: "60-999", flag: false, date: "2026-02-03",
      category: "Chemistry", facility: "Quest Diagnostics", notes: "" },
    { name: "WBC", value: "3.7", unit: "×10³/µL",
      refRange: "4.5-11.0", flag: true, date: "2026-02-03",
      category: "CBC / Hematology", facility: "Quest Diagnostics", notes: "" },
    { name: "Hemoglobin", value: "11.9", unit: "g/dL",
      refRange: "13.5-17.5", flag: true, date: "2026-02-03",
      category: "CBC / Hematology", facility: "Quest Diagnostics", notes: "" },
    { name: "Platelets", value: "131", unit: "×10³/µL",
      refRange: "150-400", flag: true, date: "2026-02-03",
      category: "CBC / Hematology", facility: "Quest Diagnostics", notes: "" },
    { name: "Glucose (Fasting)", value: "138", unit: "mg/dL",
      refRange: "70-99", flag: true, date: "2026-02-03",
      category: "Endocrine", facility: "Quest Diagnostics", notes: "" },
    { name: "HbA1c", value: "7.4", unit: "%",
      refRange: "4.0-5.6", flag: true, date: "2026-02-03",
      category: "Endocrine", facility: "Quest Diagnostics",
      notes: "Baseline for PTDM management. Target < 7.0%." },
  ],

  // ── Vitals (Readings) ──────────────────────────────────────────────────────
  // ts = Unix ms timestamp; flag = reading marked as notable
  mi_readings: [
    { ts: 1747008000000, date: "2026-05-11", bp_s: 128, bp_d: 74, weight: 192, hr: 68, o2: 98, temp: 98.4, glucose: 112, flag: false },
    { ts: 1745798400000, date: "2026-04-28", bp_s: 134, bp_d: 78, weight: 193, hr: 72, o2: 97, temp: 98.6, glucose: 118, flag: false },
    { ts: 1744588800000, date: "2026-04-14", bp_s: 131, bp_d: 76, weight: 191, hr: 70, o2: 98, temp: 98.2, glucose: 124, flag: false },
    { ts: 1743292800000, date: "2026-03-30", bp_s: 142, bp_d: 86, weight: 194, hr: 78, o2: 96, temp: 98.8, glucose: 131, flag: true },
    { ts: 1741996800000, date: "2026-03-15", bp_s: 135, bp_d: 79, weight: 195, hr: 74, o2: 97, temp: 98.4, glucose: 126, flag: false },
    { ts: 1740700800000, date: "2026-02-28", bp_s: 144, bp_d: 88, weight: 196, hr: 76, o2: 97, temp: 98.7, glucose: 138, flag: true },
  ],

  // ── Appointments ───────────────────────────────────────────────────────────
  mi_appointments: [
    { id: 1700000060, title: "Hepatology Follow-up",
      provider: "Dr. Sarah Chen, MD", specialty: "Transplant Hepatology",
      facility: "University Medical Center — Transplant Clinic",
      date: "2026-06-10", time: "10:30 AM",
      phone: "(555) 294-8800", address: "1200 University Blvd, Suite 4B",
      notes: "Bring current medication list. Fasting labs ordered for same morning at Quest (7:00 AM draw). Discuss: Valganciclovir dose, WBC trend, ALP/GGT follow-up, Tacrolimus trough.",
      prepInstructions: "Fasting from midnight. Lab draw at Quest 7:00 AM. Bring medication bottles.",
      status: "upcoming", urgency: "high", reminder: true },
    { id: 1700000061, title: "Lab Draw — Comprehensive Metabolic Panel + CBC + Tacrolimus Trough",
      provider: "Quest Diagnostics", specialty: "Laboratory",
      facility: "Quest Diagnostics — Westside Patient Service Center",
      date: "2026-06-10", time: "7:00 AM",
      phone: "(555) 882-4400", address: "4400 Westside Drive",
      notes: "Pre-Hepatology visit labs. Fasting. Tacrolimus trough (draw 30 min before AM dose — hold Tacrolimus until after draw).",
      prepInstructions: "Fast from midnight. Hold AM Tacrolimus dose until AFTER the blood draw.",
      status: "upcoming", urgency: "med", reminder: true },
    { id: 1700000062, title: "Nephrology Consult — CKD Monitoring",
      provider: "Dr. James Park, MD", specialty: "Nephrology",
      facility: "University Medical Center — Nephrology Clinic",
      date: "2026-07-08", time: "2:00 PM",
      phone: "(555) 294-9120", address: "1200 University Blvd, Suite 7C",
      notes: "Referral from Dr. Chen for CKD Stage 2 monitoring. Bring all recent creatinine/eGFR results. Discuss tacrolimus dosing strategy and renal protection.",
      prepInstructions: "Bring complete medication list and recent lab printout.",
      status: "upcoming", urgency: "med", reminder: true },
    { id: 1700000063, title: "Primary Care — Annual Physical",
      provider: "Dr. Michael Torres, MD", specialty: "Primary Care",
      facility: "City Medical Group",
      date: "2026-08-05", time: "9:00 AM",
      phone: "(555) 381-7700", address: "880 Main Street, Suite 110",
      notes: "Annual physical. Includes BP management review, lipid review, PTDM monitoring, vaccination update.",
      prepInstructions: "Fasting if A1c/lipid panel ordered. Bring current med list.",
      status: "upcoming", urgency: "low", reminder: true },
    { id: 1700000064, title: "Annual Liver MRI — Graft Surveillance",
      provider: "Dr. Sarah Chen, MD", specialty: "Transplant Hepatology",
      facility: "University Medical Center — Radiology",
      date: "2026-10-01",
      time: "8:00 AM",
      phone: "(555) 294-8800", address: "1200 University Blvd — Radiology Wing",
      notes: "Annual post-transplant graft surveillance MRI. 2-year post-LDLT milestone study. Compare to prior MRI (May 2026).",
      prepInstructions: "No metal. IV contrast likely — check creatinine day before. NPO 4 hrs prior.",
      status: "suggested", urgency: "med", reminder: true,
      suggestedFrom: "MRI Liver — May 2026 — Annual Review" },
  ],

  // ── Symptoms ───────────────────────────────────────────────────────────────
  mi_symptoms: [
    { id: 1700000070, name: "Fatigue",
      severity: "Moderate", date: "2026-05-08",
      notes: "Persistent low-grade fatigue since mid-April. Worse in afternoons. Possibly anemia-related (Hgb 12.8). Reported to Dr. Chen." },
    { id: 1700000071, name: "Bilateral Ankle Edema",
      severity: "Mild", date: "2026-04-20",
      notes: "Mild swelling, pitting. Worse after long sitting or standing. Amlodipine-related vs fluid retention. Furosemide dose reviewed." },
    { id: 1700000072, name: "Headache",
      severity: "Mild", date: "2026-05-12",
      notes: "Mild, frontal. Possibly BP-related (BP 128/74 that day — normal). Resolved with hydration. No visual changes." },
  ],

  // ── Custom Lab Ranges (Doctor's personalized targets) ─────────────────────
  mi_lab_custom_ranges: {
    "tacrolimus level (trough)": { low: 3.0, high: 6.0 },
  },

  // ── Emergency contacts ─────────────────────────────────────────────────────
  // The Emergency Card reads this structured store; the free-text `emergency`
  // field on the profile is display-only, so without these the card's contact
  // section silently disappears.
  mi_emergency_contacts: [
    { id: 1700000060, name: "Maria Rivera", relationship: "Spouse",
      phone: "(555) 847-3042", email: "maria.rivera@example.com", primary: true },
    { id: 1700000061, name: "David Rivera", relationship: "Brother (living donor)",
      phone: "(555) 847-6621", email: "", primary: false },
  ],

  // ── Pharmacies ─────────────────────────────────────────────────────────────
  // Two on purpose: transplant patients typically fill day-to-day prescriptions
  // at a retail pharmacy and the immunosuppressants through a specialty or
  // mail-order pharmacy.
  mi_pharmacies: [
    { id: 1700000070, name: "City Pharmacy", type: "Retail",
      phone: "(555) 612-4400", fax: "(555) 612-4409",
      address: "2140 Riverside Ave, Springfield",
      hours: "Mon-Fri 9-8, Sat 9-5, Sun 10-4",
      notes: "Day-to-day prescriptions: blood pressure medicines, prednisone, vaccines.", primary: true },
    { id: 1700000071, name: "University Medical Center Pharmacy", type: "Specialty",
      phone: "(555) 294-8850", fax: "(555) 294-8851",
      address: "1 Medical Center Dr, Suite 120, Springfield",
      hours: "Mon-Fri 8-6",
      notes: "Fills tacrolimus and mycophenolate on a 90-day supply. Ships to home.",
      primary: false },
  ],

  // ── Diagnostics (observational studies) ────────────────────────────────────
  mi_diagnostics: [
    { id: 1700000080, name: "Liver Ultrasound with Doppler", date: "2026-06-18",
      orderedBy: "Dr. Sarah Chen, MD", readingProvider: "Dr. Alan Reed (Radiology)",
      facility: "University Medical Center", relatedCondition: "Liver Transplant Recipient",
      impression: "Graft echotexture normal. Hepatic artery, portal and hepatic veins patent with normal waveforms. No biliary dilatation. No perihepatic fluid." },
    { id: 1700000081, name: "DEXA Bone Density Scan", date: "2026-02-10",
      orderedBy: "Dr. Michael Torres, MD", readingProvider: "Dr. Alan Reed (Radiology)",
      facility: "City Medical Group Imaging", relatedCondition: "",
      impression: "Lumbar spine T-score -1.4, femoral neck T-score -1.6. Osteopenia. Right hip not scored (arthroplasty)." },
    { id: 1700000082, name: "Transthoracic Echocardiogram", date: "2025-11-05",
      orderedBy: "Dr. Michael Torres, MD", readingProvider: "Dr. Priya Nair (Cardiology)",
      facility: "City Medical Group", relatedCondition: "Hypertension",
      impression: "LVEF 60%. Normal chamber sizes. Mild left ventricular hypertrophy. No significant valvular disease." },
    { id: 1700000083, name: "MRI Cervical Spine w/o contrast", date: "2025-05-19",
      orderedBy: "Dr. Michael Torres, MD", readingProvider: "Dr. Alan Reed (Radiology)",
      facility: "City Medical Group Imaging", relatedCondition: "",
      impression: "Mild multilevel degenerative change at C5-C6 and C6-C7. No cord compression." },
  ],

  // ── My Notes ───────────────────────────────────────────────────────────────
  // The first entry is a SAVED AI analysis (aiGenerated: true, so the app shows
  // its AI-generated label per DEC-022). AI calls are switched off on the public
  // demo origin, so this is how a visitor sees what the analysis actually
  // produces — a real saved artifact, not a live call faked at runtime.
  mi_notes: [
    { id: "1700000090", title: "AI Analysis - Lab Review (saved example)",
      pinned: true, tag: "General", date: "2026-04-29",
      preview: "Your liver enzymes look stable, but three results from your April 28 labs are worth raising with your care team.",
      aiGenerated: true, aiMode: "standard",
      sections: [{ id: "s1", type: "text", header: "AI Analysis", body: AI_EXAMPLE_BODY }] },
    { id: "1700000091", title: "Questions for Dr. Chen - August visit",
      pinned: false, tag: "General", date: "2026-07-30",
      preview: "Ask about the tacrolimus trough trend and whether the every-6-week draw schedule still makes sense.",
      sections: [{ id: "s1", type: "text", header: "Notes",
        body: `- Tacrolimus trough has drifted down over the last two draws.
- Ask whether the every-6-week lab schedule still makes sense.
- Mention the mild ankle swelling in the evenings (started ~2 weeks ago).
- Refill for mycophenolate runs out Sept 12 - confirm the specialty pharmacy has it on file.` }] },
  ],

};

// Demo PIN is 1234 — pre-hashed with the app's salt (intellitrax-salt-2026)
const DEMO_PIN_HASH = "fc72e05e2a2c820e5cd0aa1c610ebb093bd5e1f86dc3b485d30d17dc45efccbf";

// ── Load function — call this to populate localStorage ──────────────────────
// Safety (post-incident, 2026-07-19): NEVER clears storage and NEVER overwrites
// a real record. Loads the demo only onto an empty device or one already holding
// this demo dataset; otherwise it throws so callers surface a message instead of
// wiping data. (An earlier unconditional localStorage.clear() here — and in the
// standalone /demo/ launchers — could erase a live record.)
export function loadDemoData() {
  const isDemoDevice = localStorage.getItem("mi_is_demo") === "1";
  const HEALTH_KEYS = ["mi_meds_full", "mi_labs", "mi_conditions", "mi_profile_personal", "mi_documents", "mi_records"];
  const hasHealthData = HEALTH_KEYS.some(k => localStorage.getItem(k) !== null);
  if (localStorage.getItem("mi_vault") !== null || (hasHealthData && !isDemoDevice)) {
    throw new Error("A real record exists on this device — demo data was not loaded. Use “Clear all data” first if you intend to erase it.");
  }
  localStorage.setItem("mi_is_demo", "1");
  localStorage.setItem("mi_auth_hash", DEMO_PIN_HASH);
  Object.entries(DEMO_DATA).forEach(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  });
}

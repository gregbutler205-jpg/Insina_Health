import { useState } from "react";
import { uploadToDrive } from "../../lib/driveSync.js";
import { getAccessToken } from "../../lib/googleAuth.js";
import { tombstoneRecord } from "../../lib/recordTombstones.js";
import { formatPhone, displayPhone, formatDateUS } from "../../lib/displaySafe.js";

// UI-18: MVP keeps Care Team, Emergency, Reference. Timeline, Goals,
// Preventive, and Milestones are removed from the interface only — their
// components remain below and their mi_* data is untouched, so they can
// return in Phase 2 (UI-18-P2).
const TABS = ["Care Team", "Emergency", "Reference"];

const mono = "'DM Mono',monospace";
const serif = "'DM Serif Display',serif";
const sora = "'Sora',sans-serif";


const GOALS = (() => { try { return JSON.parse(localStorage.getItem("mi_care_goals") || "[]"); } catch { return []; } })();

const TEAM = (() => { try { return JSON.parse(localStorage.getItem("mi_care_team") || "[]"); } catch { return []; } })();

const PREVENTIVE = (() => { try { return JSON.parse(localStorage.getItem("mi_preventive") || "[]"); } catch { return []; } })();


const EMERGENCY = [
  {
    level:"911 NOW", color:"#ef4444",
    title:"Life-Threatening: Call 911 Immediately",
    items:["Loss of consciousness","Stopped breathing or severe difficulty breathing","Severe chest pain","Uncontrollable bleeding","Any other life-threatening emergency"],
  },
  {
    level:"CALL NOW", color:"#f59e0b",
    title:"Call Transplant Team Right Away",
    items:[
      "Temperature ≥ 100.4°F (38°C). Do not wait, even at night or weekends",
      "Pulse (heart rate) > 100 beats per minute",
      "BP: top number < 90 or > 200, OR, bottom number < 50 or > 110",
      "Missed more than one dose of anti-rejection medicine",
      "Vomited medicine immediately after taking it",
      "Urine becomes dark (sign of possible rejection or liver problem)",
      "Stools become lighter in color (possible bile duct problem)",
      "Nausea/vomiting: unable to keep down fluids or medicines",
      "Diarrhea lasting more than 5 bowel movements",
      "General flu-like malaise, fatigue, aches: possible early rejection sign",
      "Sudden weight gain > 5 lbs in one day (kidney fluid retention)",
      "Urine output < 4 cups (1,000 mL) in a day",
      "New or worsening pain anywhere",
      "Incision: separation, swelling, redness, heat, red bleeding, new or unusual fluid",
      "Large cuts, especially from dirty objects or wounds not healing normally",
    ],
  },
  {
    level:"REJECTION SIGNS", color:"#a78bfa",
    title:"Signs That May Indicate Rejection",
    items:[
      "You may have NO symptoms in early rejection: labs are usually the first sign",
      "Dark urine or noticeably lighter stools",
      "Flu-like fatigue, aches, or general sense of not feeling well",
      "Tenderness or swelling over the transplant site",
      "Jaundice (yellow skin or eyes): liver-specific sign",
      "Missing or skipping anti-rejection doses is the highest single risk factor for rejection",
      "Most likely in the first 3 months. But possible at any time",
      "Get labs on schedule. They detect rejection before symptoms appear",
    ],
  },
  {
    level:"NEVER TAKE", color:"#ef4444",
    title:"Medications & Substances to Avoid",
    items:[
      "NSAIDs (cause kidney damage in transplant patients): Ibuprofen (Advil/Motrin), Naproxen (Aleve), Aspirin >81mg, Excedrin, BC Powder, Goody Powder",
      "Tagamet / Cimetidine: interacts with anti-rejection medicine levels",
      "Any herbal or natural supplement without checking first: many interfere with Tacrolimus",
      "St. John's Wort: drops Tacrolimus levels by 50%+ → acute rejection risk",
      "Echinacea, Cat's Claw, Astragalus: immune stimulants; counteract immunosuppression",
      "Clarithromycin, Erythromycin: spike Tacrolimus dangerously (CYP3A4)",
      "Fluconazole, Voriconazole, Itraconazole: major CYP3A4 inhibitors",
      "Rifampin: strong CYP3A4 inducer; drops Tacrolimus → rejection risk",
      "Potassium supplements or salt substitutes: hyperkalemia risk with Lisinopril + CKD",
      "Alcohol. Any type, including non-alcoholic beer (contains trace amounts)",
      "Grapefruit or pomegranate (any form): alters Tacrolimus unpredictably",
    ],
  },
];

const REFERENCE = [
  {
    title:"Safe OTC Medications",
    color:"#10b981",
    items:[
      "Pain: Tylenol / Acetaminophen Regular Strength (325mg): MAX 2,000mg/day total",
      "Allergy: Benadryl (diphenhydramine), Claritin (loratadine), Zyrtec (cetirizine), Allegra max 60mg/day",
      "Cold/Cough: Mucinex, Mucinex DM, Robitussin, Robitussin DM, Vicks VapoRub",
      "Decongestant: Sudafed (pseudoephedrine): max 1 week only; may elevate BP",
      "Constipation: Metamucil, Citrucel, Colace, MiraLax, Dulcolax, Senokot",
      "Diarrhea: Imodium (loperamide). Call if lasts >24 hrs; get stool sample first",
      "Gas: Gas-X (simethicone), Mylicon",
      "Heartburn: Pepcid AC, Zantac, Tums, Maalox, Mylanta, Axid AR: NOTE: take Maalox/Mylanta/Tums at least 2 hrs before or after Mycophenolate",
      "Skin rash: Hydrocortisone cream/ointment, Caladryl",
      "Skin burn/infection: Neosporin, Polysporin, Triple Antibiotic",
      "Fungal skin: Lotrimin AF, Micatin, Tinactin",
      "Sleep: Benadryl, Doxylamine",
      "Dizziness/motion sickness: Antivert (meclizine), Dramamine",
      "Eye dryness: Artificial tears, Murine",
      "Nasal dryness: Ocean Mist, saline spray",
    ],
  },
  {
    title:"Unsafe OTC: Call Before Using",
    color:"#ef4444",
    items:[
      "ALL NSAIDs: cause kidney damage in transplant patients:",
      "  • Ibuprofen (Advil, Motrin)",
      "  • Naproxen (Aleve)",
      "  • Aspirin > 81mg per day",
      "  • Excedrin (contains aspirin)",
      "  • BC Powder, Goody Powder (contain aspirin + NSAIDs)",
      "Tagamet / Cimetidine: affects anti-rejection medicine levels",
      "Any herbal or natural product: always verify first",
      "St. John's Wort: drops Tacrolimus 50%+ → rejection",
      "Echinacea, Cat's Claw, Astragalus: immune stimulants",
      "Potassium supplements or potassium-containing salt substitutes",
    ],
  },
  {
    title:"Food & Drink: Always Avoid",
    color:"#ef4444",
    items:[
      "Grapefruit (any form, juice, fruit, supplements), alters Tacrolimus levels unpredictably",
      "Pomegranate (juice or fruit): same CYP3A4 interaction as grapefruit",
      "Pomelo, Seville oranges, marmalade: same family as grapefruit",
      "Alcohol. Any type; even non-alcoholic beer contains trace amounts; liver damage risk",
      "Raw or undercooked meat, poultry, fish, shellfish, eggs",
      "Unpasteurized milk, soft cheeses (brie, camembert, blue cheese)",
      "Unpasteurized juice or cider",
      "Raw sprouts (alfalfa, bean sprouts): bacterial contamination risk",
      "Deli/luncheon meats unless heated to steaming",
      "Food that is spoiled, moldy, or past its use-by date",
    ],
  },
  {
    title:"Food: Eat with Caution",
    color:"#f59e0b",
    items:[
      "High-potassium foods (watch with Lisinopril + CKD): bananas, oranges, potatoes, tomatoes, spinach, avocado, prunes, nuts, bran, dried fruit, milk, chocolate",
      "High-phosphorus foods: dairy, nuts, cola drinks: CKD phosphorus management",
      "Salt / sodium: target < 2g/day for BP and fluid control",
      "High-sugar / high-carb foods: PTDM risk from Tacrolimus + Prednisone",
      "Buffets and salad bars. Use caution with food handling practices",
      "Well water: prefer boiled or bottled for drinking; showering is fine",
    ],
  },
  {
    title:"Infection Prevention Rules",
    color:"#a78bfa",
    items:[
      "Hand washing is the most important habit: 20 seconds, every time, especially before eating",
      "Wear sunscreen SPF 30+ daily: anti-rejection meds significantly raise skin cancer risk",
      "Wear shoes always, especially outdoors: protect from cuts and soil contact",
      "Avoid construction sites, excavation, and dusty areas: aspergillus fungal risk (can be fatal)",
      "Avoid sick contacts; mask during respiratory illness seasons",
      "Wear gloves for gardening, yardwork, and pet cleanup",
      "Clean any cut immediately: soap + water + antibiotic ointment + keep covered",
      "Let someone else clean pet litter boxes, aquariums, birdcages. Or wear gloves",
      "Avoid large crowds in enclosed spaces within first 6 months or after rejection treatment",
      "Avoid close contact with measles, chickenpox, or shingles cases",
      "Dental visits every 6 months. Let dentist know you are a transplant patient each visit",
      "Any fever ≥ 100.4°F: call transplant team right away, even on weekends",
    ],
  },
  {
    title:"Anti-Rejection Medicine Rules",
    color:"#4f8ef7",
    items:[
      "Never miss a dose, even one missed dose raises rejection risk",
      "Never change doses on your own. Only transplant team adjusts",
      "Take Tacrolimus AFTER labs are drawn on lab days: never before",
      "Take anti-rejection medicines at the same time each day, with food",
      "If you miss a dose: take it as soon as you remember (before 2pm that day)",
      "If near time for next dose: skip the missed dose: never double up",
      "If you miss a full day of medicine: call transplant team right away",
      "If you vomit medicine right after taking it: call transplant team right away",
      "Night before labs: take Tacrolimus between 7–8 PM, fast after midnight (water okay)",
      "Get labs at 8–9 AM on lab days, even if slip shows different time",
      "Always keep at least 7–10 days of supply; refill and renew early",
      "Alert transplant team before starting any new antibiotic or medicine from another doctor",
    ],
  },
];

function SL({ children, mb = 12, style = {} }) {
  return <div style={{ fontSize:12, letterSpacing:"1.5px", textTransform:"uppercase", color:"#a0b4c8", fontFamily:mono, marginBottom:mb, ...style }}>{children}</div>;
}

function TypeBadge({ type }) {
  const map = { appointment:["#4f8ef7","Appt"], lab:["#10b981","Lab"], imaging:["#a78bfa","Imaging"], other:["#b0c4d8","Other"] };
  const [c, l] = map[type] || ["#4f8ef7","Appt"];
  return <span style={{ fontSize:12, fontFamily:mono, background:`${c}18`, color:c, border:`1px solid ${c}28`, padding:"2px 7px", borderRadius:4, letterSpacing:"0.5px", textTransform:"uppercase", flexShrink:0 }}>{l}</span>;
}

const STATUS_META = {
  "on-track":{ color:"#10b981", label:"On Track" },
  "watch":   { color:"#f59e0b", label:"Watch" },
  "due":     { color:"#ef4444", label:"Due" },
  "never":   { color:"#ef4444", label:"Never" },
  "current": { color:"#10b981", label:"Current" },
};

function Timeline() {
  const [appts, setAppts] = useState(() => { try { const r = localStorage.getItem("mi_appointments"); return r ? JSON.parse(r) : []; } catch { return []; } });
  const saveAppts = (updated) => {
    try { localStorage.setItem("mi_appointments", JSON.stringify(updated)); } catch {}
    const token = getAccessToken();
    if (token) uploadToDrive(token).catch(() => {});
  };
  const [done, setDone] = useState({});
  const [editingPrep, setEditingPrep] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newAppt, setNewAppt] = useState({ title:"", doctor:"", facility:"", date:"", time:"", type:"appointment", urgency:"low" });

  const toggleDone = (id) => setDone(d => ({ ...d, [id]: !d[id] }));
  const startEditPrep = (apptId, idx, val) => { setEditingPrep(`${apptId}-${idx}`); setEditVal(val); };
  const savePrep = (apptId, idx) => {
    setAppts(prev => { const updated = prev.map(a => a.id !== apptId ? a : { ...a, prep: (a.prep||[]).map((p,i) => i === idx ? editVal : p) }); saveAppts(updated); return updated; });
    setEditingPrep(null);
  };
  const addPrepLine = (apptId) => setAppts(prev => { const updated = prev.map(a => a.id !== apptId ? a : { ...a, prep: [...(a.prep||[]), ""] }); saveAppts(updated); return updated; });
  const removePrep = (apptId, idx) => setAppts(prev => { const updated = prev.map(a => a.id !== apptId ? a : { ...a, prep: (a.prep||[]).filter((_,i) => i !== idx) }); saveAppts(updated); return updated; });
  const addAppt = () => {
    if (!newAppt.title) return;
    setAppts(prev => { const updated = [...prev, { ...newAppt, id: Date.now(), prep:[] }]; saveAppts(updated); return updated; });
    setNewAppt({ title:"", doctor:"", facility:"", date:"", time:"", type:"appointment", urgency:"low" });
    setShowAdd(false);
  };

  return (
    <div style={{ padding:"24px 28px", overflowY:"auto", height:"100%", position:"relative" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <SL mb={0}>Upcoming Appointments & Events</SL>
        <button className="add-badge-btn" onClick={() => setShowAdd(true)}>+ Add Event</button>
      </div>
      {appts.length === 0 && (
        <div style={{ textAlign:"center", padding:"40px 0", fontSize:13, color:"#98afc4", fontFamily:mono }}>
          No appointments yet. Add one below or create appointments in the Appointments tab.
        </div>
      )}
      {[...appts].sort((a,b) => new Date(a.date||"9999")-new Date(b.date||"9999")).map((a, i, arr) => {
        const prep = a.prep || (a.prepInstructions ? [a.prepInstructions] : []);
        const doctorName = a.doctor || a.provider || "";
        const apptType = a.type || "appointment";
        const c = { appointment:"#4f8ef7", lab:"#10b981", imaging:"#a78bfa", other:"#b0c4d8" }[apptType] || "#4f8ef7";
        const isDone = !!done[a.id];
        return (
          <div key={a.id} style={{ display:"flex", gap:14, marginBottom:14 }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:20, flexShrink:0 }}>
              <div onClick={() => toggleDone(a.id)} style={{ width:14, height:14, borderRadius:"50%", border:`2px solid ${isDone ? "#10b981" : c}`, background: isDone ? "#10b981" : "transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#fff", transition:"all .15s", flexShrink:0 }}>
                {isDone ? "✓" : ""}
              </div>
              {i < arr.length - 1 && <div style={{ flex:1, width:1, background:"#0d1a28", marginTop:4 }} />}
            </div>
            <div style={{ flex:1, background:"#0b1220", border:"1px solid #1c2a40", borderRadius:12, padding:"13px 16px", opacity: isDone ? 0.45 : 1, transition:"opacity .2s" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:7, gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <TypeBadge type={apptType} />
                  {a.urgency === "high" && <span style={{ width:6, height:6, borderRadius:"50%", background:"#ef4444", boxShadow:"0 0 6px #ef4444", display:"inline-block" }} />}
                </div>
                <span style={{ fontSize:12, color: a.urgency === "high" ? "#f87171" : "#98afc4", fontFamily:mono, fontWeight: a.urgency === "high" ? 600 : 400 }}>{formatDateUS(a.date)}{a.time && a.time !== "TBD" ? ` · ${a.time}` : ""}</span>
              </div>
              <div style={{ fontSize:13, fontWeight:600, color:"#c4d8ee", marginBottom:3 }}>{a.title}</div>
              <div style={{ fontSize:12, color:"#98afc4", fontFamily:mono, marginBottom: prep.length ? 10 : 0 }}>{doctorName}{a.facility ? ` · ${a.facility}` : ""}</div>
              {prep.length > 0 && (
                <div style={{ borderTop:"1px solid #1c2a40", paddingTop:8 }}>
                  <SL mb={6}>Prep Notes</SL>
                  {prep.map((p, j) => (
                    <div key={j} style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4 }}>
                      <span style={{ color:"#a0b4c8", fontSize:12, flexShrink:0 }}>▸</span>
                      {editingPrep === `${a.id}-${j}` ? (
                        <input value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => savePrep(a.id, j)} onKeyDown={e => e.key === "Enter" && savePrep(a.id, j)} autoFocus style={{ flex:1, background:"#07090f", border:"1px solid #1a2f4a", color:"#c4d8ee", borderRadius:6, padding:"3px 8px", fontFamily:mono, fontSize:12, outline:"none" }} />
                      ) : (
                        <span onClick={() => startEditPrep(a.id, j, p)} style={{ flex:1, fontSize:12, color:"#b0c4d8", fontFamily:mono, cursor:"text" }}>{p || <span style={{ color:"#a0b4c8" }}>Click to edit…</span>}</span>
                      )}
                      <span onClick={() => removePrep(a.id, j)} style={{ fontSize:12, color:"#a0b4c8", cursor:"pointer", paddingLeft:4 }}>✕</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }} onClick={() => setShowAdd(false)}>
          <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, padding:26, width:400 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily:serif, fontSize:19, color:"#dde8f5", marginBottom:18 }}>Add Event</div>
            {[["Title","title","e.g. Cardiology Visit"],["Doctor","doctor","e.g. Dr. Smith"],["Facility","facility","e.g. Baptist Medical"],["Date","date","e.g. Apr 10, 2026"],["Time","time","e.g. 9:00 AM"]].map(([label,key,ph]) => (
              <div key={key} style={{ marginBottom:12 }}>
                <SL mb={5}>{label}</SL>
                <input className="modal-input" placeholder={ph} value={newAppt[key]} onChange={e => setNewAppt(n => ({...n,[key]:e.target.value}))} />
              </div>
            ))}
            <div style={{ marginBottom:14 }}>
              <SL mb={6}>Type</SL>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {["appointment","lab","imaging","other"].map(t => (
                  <button key={t} className={`filter-chip${newAppt.type===t?" active":""}`} onClick={() => setNewAppt(n => ({...n,type:t}))}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:18 }}>
              <SL mb={6}>Urgency</SL>
              <div style={{ display:"flex", gap:6 }}>
                {["low","med","high"].map(u => (
                  <button key={u} className={`filter-chip${newAppt.urgency===u?" active":""}`} onClick={() => setNewAppt(n => ({...n,urgency:u}))}>{u}</button>
                ))}
              </div>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={() => setShowAdd(false)} style={{ padding:"7px 16px", background:"transparent", border:"1px solid #1c2a40", borderRadius:8, color:"#b0c4d8", fontFamily:sora, fontSize:12, cursor:"pointer" }}>Cancel</button>
              <button onClick={addAppt} style={{ padding:"7px 16px", background:"rgba(79,142,247,.12)", border:"1px solid rgba(79,142,247,.35)", borderRadius:8, color:"#6ea3ff", fontFamily:sora, fontSize:12, cursor:"pointer" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Goals() {
  return (
    <div style={{ padding:"24px 28px", overflowY:"auto", height:"100%" }}>
      <SL>Health Goals & Targets</SL>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {GOALS.map(g => {
          const sm = STATUS_META[g.status] || STATUS_META["watch"];
          return (
            <div key={g.id} style={{ background:"#0b1220", border:"1px solid #1c2a40", borderRadius:12, padding:"14px 16px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontSize:12, fontFamily:mono, color:g.color, background:`${g.color}15`, border:`1px solid ${g.color}28`, padding:"2px 7px", borderRadius:4, textTransform:"uppercase", letterSpacing:"0.5px" }}>{g.category}</span>
                <span style={{ fontSize:12, fontFamily:mono, color:sm.color, display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{ width:5, height:5, borderRadius:"50%", background:sm.color, display:"inline-block" }} />{sm.label}
                </span>
              </div>
              <div style={{ fontSize:13, fontWeight:600, color:"#c4d8ee", marginBottom:5, lineHeight:1.3 }}>{g.label}</div>
              <div style={{ fontSize:12, color:"#98afc4", fontFamily:mono, lineHeight:1.5 }}>{g.note}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Team Member Modal ──────────────────────────────────────────────────────────
const BLANK_MEMBER = { id:null, name:"", role:"", specialty:"", facility:"", address:"", phone:"", phone24:"", email:"", pcp:false, color:"#4f8ef7" };

const lbl8 = { display:"block", fontSize:12, color:"#a0b4c8", fontFamily:mono, letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:5 };

function TeamMemberModal({ member, onSave, onClose }) {
  const [form, setForm] = useState({ ...BLANK_MEMBER, ...member });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }}>
      <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, padding:28, width:480, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ fontFamily:serif, fontSize:20, color:"#dde8f5", marginBottom:20 }}>
          {form.id ? "Edit Team Member" : "Add Team Member"}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl8}>Full Name *</label>
            <input className="modal-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Dr. Jane Smith, MD" />
          </div>
          <div>
            <label style={lbl8}>Role / Title</label>
            <input className="modal-input" value={form.role} onChange={e => set("role", e.target.value)} placeholder="e.g. Primary Care Physician" />
          </div>
          <div>
            <label style={lbl8}>Specialty</label>
            <input className="modal-input" value={form.specialty} onChange={e => set("specialty", e.target.value)} placeholder="e.g. Nephrology" />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl8}>Facility / Practice</label>
            <input className="modal-input" value={form.facility} onChange={e => set("facility", e.target.value)} placeholder="e.g. Baptist Medical Center" />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl8}>Address</label>
            <input className="modal-input" value={form.address} onChange={e => set("address", e.target.value)} placeholder="Street, City, State ZIP" />
          </div>
          <div>
            <label style={lbl8}>Phone</label>
            <input className="modal-input" value={form.phone} onChange={e => set("phone", formatPhone(e.target.value))} placeholder="(601)555-0000" />
          </div>
          <div>
            <label style={lbl8}>24-Hour Line</label>
            <input className="modal-input" value={form.phone24 || ""} onChange={e => set("phone24", formatPhone(e.target.value))} placeholder="24/7 emergency line (optional)" />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl8}>Email / Portal</label>
            <input className="modal-input" value={form.email} onChange={e => set("email", e.target.value)} placeholder="optional" />
          </div>
          <div style={{ gridColumn:"1/-1", display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
            <input type="checkbox" id="pcp-chk" checked={!!form.pcp} onChange={e => set("pcp", e.target.checked)} style={{ width:14, height:14, cursor:"pointer" }} />
            <label htmlFor="pcp-chk" style={{ fontSize:12, color:"#b0c4d8", cursor:"pointer", fontFamily:sora }}>Primary Care Provider (PCP)</label>
          </div>
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
          <button onClick={onClose} style={{ padding:"8px 18px", background:"transparent", border:"1px solid #1a2f4a", borderRadius:8, color:"#b0c4d8", fontFamily:sora, fontSize:12, cursor:"pointer" }}>Cancel</button>
          <button
            onClick={() => { if (!form.name.trim()) return; onSave({ ...form, id: form.id ?? Date.now() }); }}
            style={{ padding:"8px 18px", background:"rgba(79,142,247,.12)", border:"1px solid rgba(79,142,247,.35)", borderRadius:8, color:"#6ea3ff", fontFamily:sora, fontSize:12, cursor:"pointer" }}
          >Save</button>
        </div>
      </div>
    </div>
  );
}

function CareTeam() {
  const [team, setTeam] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mi_care_team") || "[]"); } catch { return []; }
  });
  const [selected, setSelected] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mi_care_team_selected") || "null");
      if (Array.isArray(saved)) return new Set(saved);
      // Default: all selected
      const all = JSON.parse(localStorage.getItem("mi_care_team") || "[]");
      return new Set(all.map(t => t.name));
    } catch { return new Set(); }
  });
  const [editingDoc, setEditingDoc]   = useState(null);   // null | member object
  const [deleteTarget, setDeleteTarget] = useState(null);  // null | member object

  function persistTeam(updated) {
    setTeam(updated);
    try { localStorage.setItem("mi_care_team", JSON.stringify(updated)); } catch {}
  }

  function toggleDoctor(name) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try { localStorage.setItem("mi_care_team_selected", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  function handleSaveDoc(doc) {
    const existing = team.find(t => t.id === doc.id);
    const oldName  = existing?.name;
    const isNew    = !existing;
    const updated  = isNew
      ? [...team, { ...doc, id: Date.now(), color: doc.color || "#4f8ef7" }]
      : team.map(t => t.id === doc.id ? { ...t, ...doc } : t);
    persistTeam(updated);

    // Keep selected in sync when name changes or member is new
    setSelected(prev => {
      const next = new Set(prev);
      if (!isNew && oldName && oldName !== doc.name) {
        next.delete(oldName);
        next.add(doc.name);
      }
      if (isNew) next.add(doc.name);
      try { localStorage.setItem("mi_care_team_selected", JSON.stringify([...next])); } catch {}
      return next;
    });
    setEditingDoc(null);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    tombstoneRecord("mi_care_team", deleteTarget);
    persistTeam(team.filter(t => t.id !== deleteTarget.id));
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(deleteTarget.name);
      try { localStorage.setItem("mi_care_team_selected", JSON.stringify([...next])); } catch {}
      return next;
    });
    setDeleteTarget(null);
  }

  return (
    <div style={{ padding:"24px 28px", overflowY:"auto", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
        <SL mb={0}>Care Team</SL>
        <button className="add-badge-btn" onClick={() => setEditingDoc({ ...BLANK_MEMBER })}>+ Add Member</button>
      </div>
      {/* UI-25: approved descriptor wording */}
      <p style={{ fontSize:12, color:"#98afc4", fontFamily:mono, marginBottom:16, lineHeight:1.55 }}>
        Select the care team members you want shown on your Dashboard and Health Profile. Up to 10 may be selected.
      </p>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {team.map(t => {
          const isChecked = selected.has(t.name);
          const color = t.color || "#4f8ef7";
          const initials = t.name.split(" ").filter(w => /^[A-Z]/.test(w)).slice(0,2).map(w=>w[0]).join("") || "?";
          return (
            <div key={t.id || t.name} style={{ background:"#0b1220", border:`1px solid ${isChecked ? "#1a3a5c" : "#1c2a40"}`, borderRadius:12, padding:"14px 18px", display:"flex", alignItems:"center", gap:14, transition:"border-color .15s" }}>
              {/* Checkbox */}
              <div onClick={() => toggleDoctor(t.name)} style={{ width:18, height:18, borderRadius:4, border:`2px solid ${isChecked ? "#4f8ef7" : "#2a3a50"}`, background: isChecked ? "#4f8ef7" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .15s", cursor:"pointer" }}>
                {isChecked && <span style={{ color:"#fff", fontSize:12, lineHeight:1, fontWeight:700 }}>✓</span>}
              </div>
              {/* Avatar */}
              <div onClick={() => toggleDoctor(t.name)} style={{ width:40, height:40, borderRadius:"50%", background:`${color}18`, border:`1px solid ${color}28`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color, flexShrink:0, cursor:"pointer" }}>
                {initials}
              </div>
              {/* Info */}
              <div style={{ flex:1, cursor:"pointer" }} onClick={() => toggleDoctor(t.name)}>
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:2 }}>
                  <span style={{ fontSize:13, fontWeight:600, color: isChecked ? "#c4d8ee" : "#7a8fa0" }}>{t.name}</span>
                  {t.pcp && <span style={{ fontSize:12, background:"rgba(79,142,247,.12)", color:"#6ea3ff", border:"1px solid rgba(79,142,247,.25)", borderRadius:10, padding:"1px 7px", fontFamily:mono }}>PCP</span>}
                </div>
                <div style={{ fontSize:12, color: isChecked ? "#b0c4d8" : "#5a6e7a" }}>{t.role}{t.specialty ? ` · ${t.specialty}` : ""}</div>
                <div style={{ fontSize:12, color:"#98afc4", fontFamily:mono, marginTop:2 }}>{t.facility}</div>
              </div>
              {/* Contact */}
              <div style={{ textAlign:"right", flexShrink:0, marginRight:6 }}>
                {t.phone && <div style={{ fontSize:12, color:"#98afc4", fontFamily:mono, marginBottom:3 }}>{displayPhone(t.phone)}</div>}
                {t.phone24 && <div style={{ fontSize:12, color:"#f87171", fontFamily:mono, marginBottom:3, fontWeight:700 }}>24 hr: {displayPhone(t.phone24)}</div>}
                {t.next  && <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:mono }}>Next: {t.next}</div>}
              </div>
              {/* Edit / Delete */}
              <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                <button
                  onClick={e => { e.stopPropagation(); setEditingDoc(t); }}
                  style={{ background:"transparent", border:"1px solid #1c2a40", borderRadius:6, color:"#b0c4d8", fontSize:12, padding:"3px 8px", cursor:"pointer" }}
                  title="Edit"
                >✎</button>
                <button
                  onClick={e => { e.stopPropagation(); setDeleteTarget(t); }}
                  style={{ background:"transparent", border:"1px solid #1c2a40", borderRadius:6, color:"#b0c4d8", fontSize:12, padding:"3px 8px", cursor:"pointer" }}
                  title="Remove"
                >✕</button>
              </div>
            </div>
          );
        })}
        {team.length === 0 && (
          <div style={{ fontSize:12, color:"#5a6e7a", fontFamily:mono, textAlign:"center", padding:"24px 0" }}>
            No care team members yet.<br />Click <strong>+ Add Member</strong> above to get started.
          </div>
        )}
      </div>

      {/* Edit / Add modal */}
      {editingDoc && (
        <TeamMemberModal member={editingDoc} onSave={handleSaveDoc} onClose={() => setEditingDoc(null)} />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300 }}>
          <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:14, padding:28, width:360 }}>
            <div style={{ fontFamily:serif, fontSize:18, color:"#dde8f5", marginBottom:10 }}>Remove Member?</div>
            <div style={{ fontSize:12, color:"#98afc4", fontFamily:mono, marginBottom:22, lineHeight:1.6 }}>
              Remove <strong style={{ color:"#c4d8ee" }}>{deleteTarget.name}</strong> from your care team? This cannot be undone.
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding:"8px 18px", background:"transparent", border:"1px solid #1a2f4a", borderRadius:8, color:"#b0c4d8", fontFamily:sora, fontSize:12, cursor:"pointer" }}>Cancel</button>
              <button onClick={handleDelete} style={{ padding:"8px 18px", background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.35)", borderRadius:8, color:"#f87171", fontFamily:sora, fontSize:12, cursor:"pointer" }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Preventive() {
  const vaccines = PREVENTIVE.filter(p => p.category === "Vaccine");
  const screenings = PREVENTIVE.filter(p => p.category === "Screening");
  const renderItem = (p) => {
    const sm = STATUS_META[p.status] || STATUS_META["watch"];
    return (
      <div key={p.label} style={{ background:"#0b1220", border:"1px solid #1c2a40", borderRadius:10, padding:"12px 14px", marginBottom:8, display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, color: p.status === "never" ? "#f87171" : "#c4d8ee", marginBottom:4 }}>{p.label}</div>
          <div style={{ fontSize:12, color:"#98afc4", fontFamily:mono, lineHeight:1.5 }}>{p.note}</div>
        </div>
        <span style={{ fontSize:12, fontFamily:mono, color:sm.color, background:`${sm.color}15`, border:`1px solid ${sm.color}28`, padding:"2px 8px", borderRadius:4, textTransform:"uppercase", letterSpacing:"0.5px", flexShrink:0, marginTop:2 }}>{sm.label}</span>
      </div>
    );
  };
  return (
    <div style={{ padding:"24px 28px", overflowY:"auto", height:"100%" }}>
      <SL>Vaccines</SL>
      {vaccines.map(renderItem)}
      <SL style={{ marginTop:20 }}>Screenings & Check-ups</SL>
      {screenings.map(renderItem)}
    </div>
  );
}

function Emergency() {
  return (
    <div style={{ padding:"24px 28px", overflowY:"auto", height:"100%" }}>
      <SL>Emergency Protocols: Sourced from Transplant Booklet</SL>
      {EMERGENCY.map(sec => (
        <div key={sec.level} style={{ background:"#0b1220", border:`1px solid ${sec.color}28`, borderLeft:`3px solid ${sec.color}`, borderRadius:12, padding:"16px 18px", marginBottom:14 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <span style={{ fontSize:12, fontFamily:mono, background:`${sec.color}18`, color:sec.color, border:`1px solid ${sec.color}30`, padding:"3px 9px", borderRadius:4, letterSpacing:"1px", textTransform:"uppercase", fontWeight:600 }}>{sec.level}</span>
            <span style={{ fontSize:13, fontWeight:600, color:"#c4d8ee" }}>{sec.title}</span>
          </div>
          {sec.items.map((item, i) => (
            <div key={i} style={{ display:"flex", gap:8, fontSize:12, color:"#7eb8d8", fontFamily:mono, marginBottom:5, alignItems:"flex-start", lineHeight:1.55 }}>
              <span style={{ color:sec.color, flexShrink:0, marginTop:1 }}>▸</span>{item}
            </div>
          ))}
        </div>
      ))}
      <div style={{ background:"#0b1220", border:"1px solid #1c2a40", borderRadius:10, padding:"14px 16px" }}>
        <SL mb={8}>After-Hours Contact Protocol</SL>
        <div style={{ fontSize:12, color:"#7eb8d8", fontFamily:mono, lineHeight:1.8 }}>
          <div>Business hours (Mon–Fri 8am–5pm): Call transplant team directly</div>
          <div>After hours / weekends / holidays: Call transplant on-call nurse service</div>
          <div style={{ marginTop:6, color:"#f87171" }}>Life-threatening emergency: Call 911 immediately</div>
        </div>
      </div>
    </div>
  );
}

function Milestones() {
  const [milestones, setMilestones] = useState(() => {
    try { const s = localStorage.getItem("mi_milestones"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [newM, setNewM] = useState({ label:"", date:"", done:false, note:"" });

  const saveMilestones = (updated) => {
    setMilestones(updated);
    try { localStorage.setItem("mi_milestones", JSON.stringify(updated)); } catch {}
  };
  const addMilestone = () => {
    if (!newM.label.trim()) return;
    saveMilestones([...milestones, { ...newM, id: Date.now() }]);
    setNewM({ label:"", date:"", done:false, note:"" });
    setShowAdd(false);
  };
  const toggleDone = (id) => saveMilestones(milestones.map(m => m.id === id ? { ...m, done: !m.done } : m));
  const deleteMilestone = (id) => {
    tombstoneRecord("mi_milestones", milestones.find(m => m.id === id));
    saveMilestones(milestones.filter(m => m.id !== id));
  };

  return (
    <div style={{ padding:"24px 28px", overflowY:"auto", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <SL mb={0}>Health Milestones</SL>
        <button className="add-badge-btn" onClick={() => setShowAdd(true)}>+ Add Milestone</button>
      </div>
      {milestones.length === 0 && (
        <div style={{ textAlign:"center", padding:"40px 0", fontSize:13, color:"#98afc4", fontFamily:mono }}>
          No milestones yet. Add your first one to track your health journey.
        </div>
      )}
      {milestones.map((m, i) => (
        <div key={m.id || i} style={{ display:"flex", gap:14, marginBottom:14 }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:20, flexShrink:0 }}>
            <div onClick={() => toggleDone(m.id)} style={{ width:14, height:14, borderRadius:"50%", border:`2px solid ${m.done ? "#10b981" : "#98afc4"}`, background: m.done ? "#10b981" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#fff", flexShrink:0, cursor:"pointer", transition:"all .15s" }}>
              {m.done ? "✓" : ""}
            </div>
            {i < milestones.length - 1 && <div style={{ flex:1, width:1, background:"#0d1a28", marginTop:4 }} />}
          </div>
          <div style={{ flex:1, background:"#0b1220", border:"1px solid #1c2a40", borderRadius:12, padding:"12px 16px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:5, gap:8 }}>
              <div style={{ fontSize:13, fontWeight:600, color: m.done ? "#b0c4d8" : "#c4d8ee" }}>{m.label}</div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                {m.date && <span style={{ fontSize:12, color: m.done ? "#a0b4c8" : "#f59e0b", fontFamily:mono }}>{formatDateUS(m.date)}</span>}
                <span onClick={() => deleteMilestone(m.id)} style={{ fontSize:12, color:"#a0b4c8", cursor:"pointer", lineHeight:1 }} title="Delete">✕</span>
              </div>
            </div>
            {m.note && <div style={{ fontSize:12, color:"#98afc4", fontFamily:mono, lineHeight:1.5 }}>{m.note}</div>}
          </div>
        </div>
      ))}

      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }} onClick={() => setShowAdd(false)}>
          <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, padding:26, width:420 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily:serif, fontSize:19, color:"#dde8f5", marginBottom:18 }}>Add Milestone</div>
            {[
              { label:"Label", key:"label", placeholder:"e.g. 6-Month Biopsy" },
              { label:"Date", key:"date", placeholder:"e.g. Apr 2025" },
              { label:"Notes", key:"note", placeholder:"Outcome or details (optional)…" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:"#a0b4c8", fontFamily:mono, letterSpacing:"1px", textTransform:"uppercase", display:"block", marginBottom:4 }}>{f.label}</label>
                <input className="modal-input" value={newM[f.key]} onChange={e => setNewM(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} onKeyDown={e => e.key === "Enter" && addMilestone()} />
              </div>
            ))}
            <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18, cursor:"pointer", fontSize:12, color:"#b0c4d8", fontFamily:sora }}>
              <input type="checkbox" checked={newM.done} onChange={e => setNewM(p => ({ ...p, done: e.target.checked }))} />
              Mark as completed
            </label>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={() => setShowAdd(false)} style={{ padding:"7px 16px", background:"transparent", border:"1px solid #1c2a40", borderRadius:8, color:"#b0c4d8", fontFamily:sora, cursor:"pointer", fontSize:12 }}>Cancel</button>
              <button onClick={addMilestone} style={{ padding:"7px 16px", background:"rgba(79,142,247,.15)", border:"1px solid rgba(79,142,247,.35)", borderRadius:8, color:"#6ea3ff", fontFamily:sora, cursor:"pointer", fontSize:12 }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Reference() {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ padding:"24px 28px", overflowY:"auto", height:"100%" }}>
      <SL>Illness & Safety Reference: From Transplant Booklet</SL>
      {REFERENCE.map(sec => (
        <div key={sec.title} style={{ marginBottom:10 }}>
          <div onClick={() => setOpen(o => o === sec.title ? null : sec.title)} style={{ background:"#0b1220", border:`1px solid ${open === sec.title ? sec.color + "40" : "#1c2a40"}`, borderLeft:`3px solid ${sec.color}`, borderRadius: open === sec.title ? "12px 12px 0 0" : 12, padding:"12px 16px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#c4d8ee" }}>{sec.title}</div>
            <span style={{ fontSize:12, color:"#b0c4d8" }}>{open === sec.title ? "▲" : "▼"}</span>
          </div>
          {open === sec.title && (
            <div style={{ background:"#0b1220", border:`1px solid ${sec.color}28`, borderLeft:`3px solid ${sec.color}`, borderTop:"none", borderRadius:"0 0 12px 12px", padding:"12px 16px 14px" }}>
              {sec.items.map((item, i) => (
                <div key={i} style={{ display:"flex", gap:8, fontSize:12, color: item.startsWith("  •") ? "#98afc4" : "#7eb8d8", fontFamily:mono, marginBottom:5, alignItems:"flex-start", lineHeight:1.6 }}>
                  {!item.startsWith("  •") && <span style={{ color:sec.color, flexShrink:0, marginTop:1 }}>▸</span>}
                  {item.startsWith("  •") && <span style={{ width:16, flexShrink:0 }} />}
                  <span>{item.replace(/^  •\s*/,"")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function CarePlan() {
  const [tab, setTab] = useState("Care Team");
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#07090f", fontFamily:sora, color:"#d4e2f0", overflow:"hidden", position:"relative" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#1a2840;border-radius:4px;}
        .tab-btn{padding:5px 13px;border-radius:20px;font-size:12px;border:1px solid transparent;background:transparent;color:#b0c4d8;cursor:pointer;transition:all .15s;font-family:'DM Mono',monospace;white-space:nowrap;}
        .tab-btn:hover{color:#7eb8d8;}
        .tab-btn.active{color:#6ea3ff;border-color:#6ea3ff;background:rgba(79,142,247,.08);}
        .filter-chip{padding:5px 13px;border-radius:20px;font-size:12px;border:1px solid #1c2a40;background:#0b1220;color:#b0c4d8;cursor:pointer;transition:all .15s;font-family:'DM Mono',monospace;white-space:nowrap;}
        .filter-chip:hover{color:#7eb8d8;border-color:#1a2f4a;}
        .filter-chip.active{color:#6ea3ff;border-color:#6ea3ff;background:rgba(79,142,247,.08);}
        .add-badge-btn{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;background:rgba(79,142,247,.08);border:1px solid rgba(79,142,247,.25);border-radius:12px;color:#6ea3ff;font-size:12px;font-family:'DM Mono',monospace;cursor:pointer;transition:all .15s;}
        .add-badge-btn:hover{background:rgba(79,142,247,.16);border-color:rgba(79,142,247,.45);}
        .modal-input{width:100%;background:#07090f;border:1px solid #1c2a40;color:#c4d8ee;padding:8px 12px;border-radius:8px;font-family:'Sora',sans-serif;font-size:12px;outline:none;transition:border-color .15s;}
        .modal-input::placeholder{color:#a0b4c8;}
        .modal-input:focus{border-color:#1a2f4a;}
      `}</style>

      {/* UI-18/UI-10: slim header — the shared shell already carries the
          branding; the old 120px logo masthead was a duplicate. */}
      <div style={{ height:54, background:"#080c14", borderBottom:"1px solid #1c2a40", display:"flex", alignItems:"center", padding:"0 24px", gap:12, flexShrink:0 }}>
        <div style={{ fontFamily:serif, fontSize:20, color:"#dde8f5", fontWeight:400, letterSpacing:"-0.3px" }}>Care Team</div>
        <div style={{ flex:1 }} />
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {TABS.map(t => <button key={t} className={`tab-btn${tab===t?" active":""}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>
      </div>

      <div style={{ flex:1, overflow:"hidden" }}>
        {tab === "Care Team"  && <CareTeam />}
        {tab === "Emergency"  && <Emergency />}
        {tab === "Reference"  && <Reference />}
      </div>
    </div>
  );
}

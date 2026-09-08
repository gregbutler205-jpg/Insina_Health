import { useState, useEffect } from "react";
import PrintButton from "../PrintButton.jsx";
import { printVitalsReport } from "../../lib/printReports.js";
import AppSidebar from "../AppSidebar.jsx";
import TopBar from "../TopBar.jsx";
import { getStore, setStore } from "../../store.js";
import { mkReading, saveReading, getFieldHistory, defaultVitalFlag } from "../../lib/vitals.js";
import { formatDateUS } from "../../lib/displaySafe.js";
import { checkVitalReading, checkVitalCrossFields } from "../../lib/plausibility.js";

// UI-4: one shared mapping from a vital-card id to the mi_readings field it
// reads — "latest"/"previous" must be looked up per field, not per record,
// since a record may be a partial entry (e.g. a weight-only log has null
// bp_s and must not hide an earlier, still-current BP reading).
const FIELD_KEY_BY_VITAL_ID = {
  bp: "bp_s", hr: "hr", resting_hr: "resting_hr", o2: "o2",
  weight: "weight", temp: "temp", glucose: "glucose", sleep: "sleep",
  bmi: "weight", // BMI is derived from weight; no field of its own
};
function latestForVitalId(id) {
  const key = FIELD_KEY_BY_VITAL_ID[id];
  return key ? (getFieldHistory(key)[0] ?? null) : null;
}
function prevForVitalId(id) {
  const key = FIELD_KEY_BY_VITAL_ID[id];
  return key ? (getFieldHistory(key)[1] ?? null) : null;
}




function filterByMonths(arr, months) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return arr.filter(r => new Date(r.ts) >= cutoff);
}

const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;

// ── BMI helpers ───────────────────────────────────────────────────────────────
function getHeightInches() {
  try {
    const p = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}");
    const h = (p.height || "").trim();
    if (!h) return null;
    // "5'11"", "5'11\"", "5 ft 11", "5ft11in"
    const m1 = h.match(/(\d+)\s*['′ft]+\s*(\d+)/i);
    if (m1) return parseInt(m1[1]) * 12 + parseInt(m1[2]);
    // "71 in" or just "71"
    const m2 = h.match(/^(\d+\.?\d*)\s*(in|")?$/i);
    if (m2) { const n = parseFloat(m2[1]); if (n > 48 && n < 110) return n; }
    // "180 cm"
    const m3 = h.match(/(\d+\.?\d*)\s*cm/i);
    if (m3) return parseFloat(m3[1]) / 2.54;
    return null;
  } catch { return null; }
}

function calcBMI(weightLbs) {
  const h = getHeightInches();
  if (!h || !weightLbs) return null;
  return +((weightLbs / (h * h)) * 703).toFixed(1);
}

function bmiLabel(bmi) {
  if (bmi == null) return { label: "No data", color: "#98afc4" };
  if (bmi < 18.5) return { label: "Underweight", color: "#4f8ef7" };
  if (bmi < 25)   return { label: "Normal",      color: "#10b981" };
  if (bmi < 30)   return { label: "Overweight",  color: "#f59e0b" };
  return              { label: "Obese",       color: "#ef4444" };
}

// ── Chart components ──────────────────────────────────────────────────────────

function LineChart({ data, keys, colors, yMin, yMax, refLines = [], height = 150, dateKey = "date" }) {
  const reversed = [...data].reverse();
  if (reversed.length < 2) return <div style={{ height }} />;
  const W = 520, H = height, PL = 40, PR = 10, PT = 14, PB = 26;
  const cW = W - PL - PR, cH = H - PT - PB;
  const n = reversed.length;
  const toX = i => PL + (i / Math.max(n - 1, 1)) * cW;
  const toY = v => v == null ? null : PT + cH - ((v - yMin) / (yMax - yMin)) * cH;

  const yTicks = 4;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const v = yMin + (i / yTicks) * (yMax - yMin);
        const y = toY(v);
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={PL + cW} y2={y} stroke="#0d1a28" strokeWidth={0.6} />
            <text x={PL - 4} y={y + 3} textAnchor="end" fontSize={12} fill="#a0b4c8" fontFamily="DM Mono">{Number.isInteger(v) ? v : v.toFixed(1)}</text>
          </g>
        );
      })}
      {refLines.map(({ val, color }) => {
        const y = toY(val);
        return y != null ? <line key={val} x1={PL} y1={y} x2={PL + cW} y2={y} stroke={color} strokeWidth={1} strokeDasharray="4,3" opacity={0.45} /> : null;
      })}
      {keys.map((key, ki) => {
        const color = colors[ki];
        const pts = reversed.map((r, i) => ({ x: toX(i), y: toY(r[key]), v: r[key] })).filter(p => p.y != null);
        if (pts.length < 2) return null;
        const poly = pts.map(p => `${p.x},${p.y}`).join(" ");
        const area = `${pts[0].x},${PT + cH} ${poly} ${pts[pts.length - 1].x},${PT + cH}`;
        return (
          <g key={key}>
            <polygon points={area} fill={`${color}12`} />
            <polyline points={poly} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, pi) => (
              <circle key={pi} cx={p.x} cy={p.y} r={pi === pts.length - 1 ? 4.5 : 2.5} fill={color} />
            ))}
          </g>
        );
      })}
      {reversed.map((r, i) => {
        const step = Math.ceil(n / 7);
        if (i % step !== 0 && i !== n - 1) return null;
        return <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={12} fill="#a0b4c8" fontFamily="DM Mono">{r[dateKey]}</text>;
      })}
    </svg>
  );
}

function BandChart({ data, minKey, maxKey, restingKey, color, yMin, yMax, height = 150 }) {
  const reversed = [...data].reverse();
  if (reversed.length < 2) return <div style={{ height }} />;
  const W = 520, H = height, PL = 40, PR = 10, PT = 14, PB = 26;
  const cW = W - PL - PR, cH = H - PT - PB;
  const n = reversed.length;
  const toX = i => PL + (i / Math.max(n - 1, 1)) * cW;
  const toY = v => PT + cH - ((v - yMin) / (yMax - yMin)) * cH;

  const topPoly = reversed.map((r, i) => `${toX(i)},${toY(r[maxKey])}`).join(" ");
  const botPoly = reversed.map((r, i) => `${toX(i)},${toY(r[minKey])}`).join(" ");
  const botPolyRev = [...reversed].reverse().map((r, i) => `${toX(n - 1 - i)},${toY(r[minKey])}`).join(" ");
  const bandArea = `${topPoly} ${botPolyRev}`;
  const restPts = reversed.map((r, i) => `${toX(i)},${toY(r[restingKey])}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      {[0, 0.25, 0.5, 0.75, 1].map(p => {
        const v = yMin + p * (yMax - yMin);
        const y = toY(v);
        return (
          <g key={p}>
            <line x1={PL} y1={y} x2={PL + cW} y2={y} stroke="#0d1a28" strokeWidth={0.6} />
            <text x={PL - 4} y={y + 3} textAnchor="end" fontSize={12} fill="#a0b4c8" fontFamily="DM Mono">{Math.round(v)}</text>
          </g>
        );
      })}
      {/* HR band */}
      <polygon points={bandArea} fill={`${color}18`} />
      <polyline points={topPoly} fill="none" stroke={`${color}50`} strokeWidth={1} strokeLinejoin="round" />
      <polyline points={botPoly} fill="none" stroke={`${color}50`} strokeWidth={1} strokeLinejoin="round" />
      {/* Resting HR line */}
      <polyline points={restPts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {reversed.map((r, i) => (
        <circle key={i} cx={toX(i)} cy={toY(r[restingKey])} r={i === n - 1 ? 4.5 : 2} fill={color} />
      ))}
      {/* X labels */}
      {reversed.map((r, i) => {
        const step = Math.ceil(n / 7);
        if (i % step !== 0 && i !== n - 1) return null;
        return <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={12} fill="#a0b4c8" fontFamily="DM Mono">{formatDateUS(r.date)}</text>;
      })}
    </svg>
  );
}

function BarChart({ data, valueKey, color, yMin, yMax, targetMin, targetMax, height = 150 }) {
  const reversed = [...data].reverse();
  if (!reversed.length) return <div style={{ height }} />;
  const W = 520, H = height, PL = 40, PR = 10, PT = 14, PB = 26;
  const cW = W - PL - PR, cH = H - PT - PB;
  const n = reversed.length;
  const barW = Math.max(4, Math.min(18, (cW / n) * 0.6));
  const toX = i => PL + (i / Math.max(n - 1, 1)) * cW;
  const toY = v => PT + cH - ((v - yMin) / (yMax - yMin)) * cH;
  const baseY = toY(yMin);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      {[0, 0.25, 0.5, 0.75, 1].map(p => {
        const v = yMin + p * (yMax - yMin);
        const y = toY(v);
        return (
          <g key={p}>
            <line x1={PL} y1={y} x2={PL + cW} y2={y} stroke="#0d1a28" strokeWidth={0.6} />
            <text x={PL - 4} y={y + 3} textAnchor="end" fontSize={12} fill="#a0b4c8" fontFamily="DM Mono">{v.toFixed(1)}</text>
          </g>
        );
      })}
      {/* Target band */}
      {targetMin != null && targetMax != null && (
        <rect x={PL} y={toY(targetMax)} width={cW} height={toY(targetMin) - toY(targetMax)} fill="rgba(16,185,129,0.07)" />
      )}
      {targetMin != null && <line x1={PL} y1={toY(targetMin)} x2={PL + cW} y2={toY(targetMin)} stroke="#2dd4a0" strokeWidth={0.8} strokeDasharray="4,3" opacity={0.45} />}
      {targetMax != null && <line x1={PL} y1={toY(targetMax)} x2={PL + cW} y2={toY(targetMax)} stroke="#2dd4a0" strokeWidth={0.8} strokeDasharray="4,3" opacity={0.45} />}
      {reversed.map((r, i) => {
        const v = r[valueKey];
        if (v == null) return null;
        const x = toX(i);
        const y = toY(v);
        const inRange = (targetMin == null || v >= targetMin) && (targetMax == null || v <= targetMax);
        const barColor = inRange ? color : "#ef4444";
        return (
          <g key={i}>
            <rect x={x - barW / 2} y={y} width={barW} height={baseY - y} fill={barColor} opacity={0.75} rx={2} />
            {i === n - 1 && <circle cx={x} cy={y} r={4} fill={barColor} />}
          </g>
        );
      })}
      {reversed.map((r, i) => {
        const step = Math.ceil(n / 7);
        if (i % step !== 0 && i !== n - 1) return null;
        return <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={12} fill="#a0b4c8" fontFamily="DM Mono">{formatDateUS(r.date)}</text>;
      })}
    </svg>
  );
}

// Compact range bar for sidebar cards
function MiniRangeBar({ value, yMin, yMax, goodMin, goodMax }) {
  if (value == null) return null;
  const total = yMax - yMin || 1;
  const lowPct  = ((goodMin - yMin) / total) * 100;
  const highPct = ((goodMax - yMin) / total) * 100;
  const valPct  = Math.min(97, Math.max(3, ((value - yMin) / total) * 100));
  const inRange = value >= goodMin && value <= goodMax;
  const bc = inRange ? "#10b981" : "#ef4444";
  return (
    <div style={{ position: "relative", paddingTop: 16, marginTop: 4 }}>
      <div style={{ position: "absolute", top: 0, left: `${valPct}%`, transform: "translateX(-50%)", background: bc, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono',monospace", padding: "1px 4px", borderRadius: 20, whiteSpace: "nowrap", lineHeight: 1.4 }}>{value}</div>
      <div style={{ position: "absolute", top: 12, left: `${valPct}%`, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "3px solid transparent", borderRight: "3px solid transparent", borderTop: `3px solid ${bc}` }} />
      <div style={{ height: 4, borderRadius: 4, position: "relative", overflow: "hidden", background: "rgba(239,68,68,0.25)" }}>
        <div style={{ position: "absolute", left: `${lowPct}%`, width: `${highPct - lowPct}%`, height: "100%", background: "#10b981" }} />
      </div>
    </div>
  );
}

// ── Vital definitions ─────────────────────────────────────────────────────────

const VITALS = [
  {
    id: "bp", label: "Blood Pressure", unit: "mmHg", color: "#4f8ef7", source: "manual",
    goodMin: 90, goodMax: 130, yMin: 50, yMax: 180,
    latestFn: r => (r.bp_s != null && r.bp_d != null) ? `${r.bp_s}/${r.bp_d}` : "–",
    latestNum: r => r.bp_s,
    statusFn: r => r.bp_s == null ? { label: "No data", color: "#98afc4" } : r.bp_s >= 140 || r.bp_d >= 90 ? { label: "High", color: "#ef4444" } : r.bp_s >= 130 ? { label: "Elevated", color: "#f59e0b" } : { label: "Normal", color: "#10b981" },
    chartType: "line", chartKeys: ["bp_s", "bp_d"], chartColors: ["#4f8ef7", "#a78bfa"],
    chartLabels: ["Systolic", "Diastolic"],
    refLines: [{ val: 120, color: "#6ea3ff" }, { val: 80, color: "#a78bfa" }],
    chartYMin: 50, chartYMax: 180,
    data: "manual",
  },
  {
    id: "hr", label: "Heart Rate", unit: "bpm", color: "#ef4444", source: "manual",
    goodMin: 60, goodMax: 100, yMin: 40, yMax: 120,
    latestFn: r => r.hr != null ? `${r.hr}` : "–",
    latestNum: r => r.hr,
    statusFn: r => r.hr == null ? { label: "No data", color: "#98afc4" } : r.hr < 50 ? { label: "Low", color: "#f59e0b" } : r.hr > 100 ? { label: "High", color: "#ef4444" } : { label: "Normal", color: "#10b981" },
    chartType: "line", chartKeys: ["hr"], chartColors: ["#ef4444"],
    chartLabels: ["Heart Rate"],
    refLines: [{ val: 60, color: "#f59e0b" }, { val: 100, color: "#f87171" }],
    chartYMin: 40, chartYMax: 120,
    data: "manual",
  },
  {
    id: "resting_hr", label: "Resting Heart Rate", unit: "bpm", color: "#f87171", source: "manual",
    goodMin: 50, goodMax: 70, yMin: 40, yMax: 90,
    latestFn: r => r.resting_hr != null ? `${r.resting_hr}` : "–",
    latestNum: r => r.resting_hr,
    statusFn: r => r.resting_hr == null ? { label: "No data", color: "#98afc4" } : r.resting_hr > 70 ? { label: "Elevated", color: "#f59e0b" } : r.resting_hr < 50 ? { label: "Low", color: "#4f8ef7" } : { label: "Good", color: "#10b981" },
    chartType: "line", chartKeys: ["resting_hr"], chartColors: ["#f87171"],
    chartLabels: ["Resting HR"],
    refLines: [{ val: 60, color: "#2dd4a0" }, { val: 70, color: "#f59e0b" }],
    chartYMin: 40, chartYMax: 100,
    data: "manual",
  },
  {
    id: "o2", label: "O2 Saturation", unit: "%", color: "#10b981", source: "manual",
    goodMin: 95, goodMax: 100, yMin: 88, yMax: 102,
    latestFn: r => r.o2 != null ? `${r.o2}%` : "–",
    latestNum: r => r.o2,
    statusFn: r => r.o2 == null ? { label: "No data", color: "#98afc4" } : r.o2 >= 98 ? { label: "Excellent", color: "#10b981" } : r.o2 >= 95 ? { label: "Normal", color: "#7eb8d8" } : { label: "Low", color: "#ef4444" },
    chartType: "line", chartKeys: ["o2"], chartColors: ["#10b981"],
    chartLabels: ["O2 Saturation"],
    refLines: [{ val: 95, color: "#f87171" }],
    chartYMin: 88, chartYMax: 102,
    data: "manual",
  },
  {
    id: "weight", label: "Weight", unit: "lbs", color: "#f59e0b", source: "manual",
    goodMin: 180, goodMax: 190, yMin: 170, yMax: 200,
    latestFn: r => r.weight != null ? `${r.weight}` : "–",
    latestNum: r => r.weight,
    statusFn: (r, prev) => {
      if (r.weight == null) return { label: "No data", color: "#98afc4" };
      if (!prev || prev.weight == null) return { label: "No prior", color: "#98afc4" };
      const d = (r.weight - prev.weight).toFixed(1);
      return { label: d > 0 ? `+${d} lb` : `${d} lb`, color: Math.abs(d) < 1 ? "#10b981" : "#f59e0b" };
    },
    chartType: "line", chartKeys: ["weight"], chartColors: ["#f59e0b"],
    chartLabels: ["Weight"],
    refLines: [{ val: 185, color: "#f59e0b" }],
    chartYMin: 178, chartYMax: 196,
    data: "manual",
  },
  {
    id: "temp", label: "Temperature", unit: "°F", color: "#7eb8d8", source: "manual",
    goodMin: 97, goodMax: 99.5, yMin: 96, yMax: 101,
    latestFn: r => r.temp != null ? `${r.temp}°` : "–",
    latestNum: r => r.temp,
    statusFn: r => r.temp == null ? { label: "No data", color: "#98afc4" } : r.temp < 97 ? { label: "Low", color: "#4f8ef7" } : r.temp > 99.5 ? { label: "Fever", color: "#ef4444" } : { label: "Normal", color: "#10b981" },
    chartType: "line", chartKeys: ["temp"], chartColors: ["#7eb8d8"],
    chartLabels: ["Temp"],
    refLines: [{ val: 97, color: "#6ea3ff" }, { val: 99.5, color: "#f87171" }],
    chartYMin: 96, chartYMax: 101,
    data: "manual",
  },
  {
    id: "glucose", label: "Blood Glucose", unit: "mg/dL", color: "#a78bfa", source: "manual",
    goodMin: 70, goodMax: 100, yMin: 60, yMax: 130,
    latestFn: r => r.glucose != null ? `${r.glucose}` : "–",
    latestNum: r => r.glucose,
    statusFn: r => r.glucose == null ? { label: "No data", color: "#98afc4" } : r.glucose > 125 ? { label: "High", color: "#ef4444" } : r.glucose > 100 ? { label: "Pre-diabetic", color: "#f59e0b" } : r.glucose < 70 ? { label: "Low", color: "#ef4444" } : { label: "Normal", color: "#10b981" },
    chartType: "line", chartKeys: ["glucose"], chartColors: ["#a78bfa"],
    chartLabels: ["Fasting Glucose"],
    refLines: [{ val: 100, color: "#f59e0b" }, { val: 126, color: "#f87171" }],
    chartYMin: 60, chartYMax: 130,
    data: "manual",
  },
  {
    id: "bmi", label: "BMI", unit: "", color: "#10b981", source: "manual",
    goodMin: 18.5, goodMax: 24.9, yMin: 15, yMax: 40,
    latestFn: r => { const b = calcBMI(r.weight); return b != null ? `${b}` : "–"; },
    latestNum: r => calcBMI(r.weight),
    statusFn: r => bmiLabel(calcBMI(r.weight)),
    chartType: "line", chartKeys: ["bmi_calc"], chartColors: ["#10b981"],
    chartLabels: ["BMI"],
    refLines: [{ val: 18.5, color: "#6ea3ff" }, { val: 25, color: "#f59e0b" }, { val: 30, color: "#f87171" }],
    chartYMin: 15, chartYMax: 40,
    data: "manual",
  },
  {
    id: "sleep", label: "Sleep", unit: "hrs", color: "#60a5fa", source: "manual",
    goodMin: 7, goodMax: 9, yMin: 3, yMax: 11,
    latestFn: r => r.sleep != null ? `${r.sleep}h` : "–",
    latestNum: r => r.sleep,
    statusFn: r => r.sleep == null ? { label: "No data", color: "#98afc4" } : r.sleep < 6 ? { label: "Poor", color: "#ef4444" } : r.sleep < 7 ? { label: "Below goal", color: "#f59e0b" } : { label: "Good", color: "#10b981" },
    chartType: "bar",
    chartLabels: ["Sleep Hours"],
    chartYMin: 0, chartYMax: 11,
    data: "manual",
  },
];

// Log form
function LogPanel({ onClose, onSave }) {
  const todayISO = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ date: todayISO, time: "", bp_s: "", bp_d: "", hr: "", resting_hr: "", o2: "", weight: "", temp: "", glucose: "", sleep: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fields = [
    { label: "Blood Pressure", inputs: [{ k: "bp_s", ph: "Systolic" }, { k: "bp_d", ph: "Diastolic" }], unit: "mmHg" },
    { label: "Heart Rate", inputs: [{ k: "hr", ph: "BPM" }], unit: "bpm" },
    { label: "Resting Heart Rate", inputs: [{ k: "resting_hr", ph: "BPM" }], unit: "bpm" },
    { label: "O2 Saturation", inputs: [{ k: "o2", ph: "SpO2" }], unit: "%" },
    { label: "Weight", inputs: [{ k: "weight", ph: "lbs" }], unit: "lbs" },
    { label: "Temperature", inputs: [{ k: "temp", ph: "°F" }], unit: "°F" },
    { label: "Blood Glucose", inputs: [{ k: "glucose", ph: "mg/dL (fasting)" }], unit: "mg/dL" },
    { label: "Sleep Hours", inputs: [{ k: "sleep", ph: "e.g. 7.5" }], unit: "hrs" },
  ];

  return (
    <div style={{ position: "absolute", top: 0, right: 0, width: 320, height: "100%", background: "#080c14", borderLeft: "1px solid #1c2a40", display: "flex", flexDirection: "column", zIndex: 20, animation: "slideInRight .22s ease both" }}>
      <div style={{ padding: "18px 18px 14px", borderBottom: "1px solid #1c2a40", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "#6ea3ff", fontFamily: "'DM Mono',monospace", letterSpacing: "1.5px", marginBottom: 4 }}>NEW ENTRY</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: "#dde8f5" }}>Log Vitals</div>
        </div>
        <button onClick={onClose} style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 6, color: "#b0c4d8", fontSize: 14, cursor: "pointer", padding: "4px 8px" }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "18px" }}>
        {/* Date + optional time */}
        <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
          <div style={{ flex: 2 }}>
            <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>Date of Reading</div>
            <input type="date" value={form.date} onChange={e => set("date", e.target.value)}
              style={{ width: "100%", padding: "9px 12px", background: "#0b1220", border: `1px solid ${form.date !== todayISO ? "#4f8ef7" : "#1c2a40"}`, borderRadius: 8, color: "#c4d8ee", fontSize: 13, fontFamily: "'DM Mono',monospace", outline: "none" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>Time (optional)</div>
            <input type="time" value={form.time} onChange={e => set("time", e.target.value)}
              style={{ width: "100%", padding: "9px 12px", background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 8, color: "#c4d8ee", fontSize: 13, fontFamily: "'DM Mono',monospace", outline: "none" }} />
          </div>
        </div>
        {form.date !== todayISO && (
          <div style={{ fontSize: 12, color: "#6ea3ff", fontFamily: "'DM Mono',monospace", marginTop: -10, marginBottom: 16 }}>
            Logging for past date: {new Date(form.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{form.time ? ` at ${form.time}` : ""}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", marginBottom: 16 }}>Leave blank to skip any vital.</div>
        {fields.map(({ label, inputs, unit }) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>
              {label} <span style={{ color: "#a0b4c8" }}>· {unit}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {inputs.map(({ k, ph }) => (
                <input key={k} type="number" placeholder={ph} value={form[k]} onChange={e => set(k, e.target.value)}
                  style={{ flex: 1, padding: "9px 12px", background: "#0b1220", border: `1px solid ${form[k] ? "#4f8ef7" : "#1c2a40"}`, borderRadius: 8, color: "#c4d8ee", fontSize: 14, fontFamily: "'DM Mono',monospace", outline: "none" }} />
              ))}
            </div>
          </div>
        ))}
        <div style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 10, padding: "10px 12px", marginTop: 4 }}>
          <div style={{ fontSize: 12, color: "#98afc4", lineHeight: 1.6 }}>Leave any field blank to skip it. BMI is calculated automatically from your weight and height in Profile.</div>
        </div>
      </div>
      <div style={{ padding: "14px 18px", borderTop: "1px solid #1c2a40", display: "flex", gap: 8 }}>
        <button onClick={() => onSave(form)}
          style={{ flex: 1, padding: "11px", background: "#10b981", border: "none", borderRadius: 9, color: "#fff", fontSize: 13, fontFamily: "'Sora',sans-serif", fontWeight: 600, cursor: "pointer" }}>
          Save Entry
        </button>
        <button onClick={onClose}
          style={{ padding: "11px 16px", background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 9, color: "#b0c4d8", fontSize: 13, fontFamily: "'Sora',sans-serif", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * A-12: the plausibility gate modal. Hard-band fields block the save and
 * offer suggestion buttons (value never auto-corrects — the patient picks);
 * soft-band fields and cross-field issues (e.g. systolic/diastolic swapped)
 * never block, only confirm-and-save with one tap. DEC-019.
 */
function PlausibilityGate({ pending, onConfirm, onSuggestion, onCancel }) {
  const { reading, hardIssues, softFieldIssues, crossFieldIssues } = pending;
  const hasHard = hardIssues.length > 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,7,14,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ width: 360, maxWidth: "90vw", background: "#0b1220", border: "1px solid #16273c", borderRadius: 14, padding: "20px 22px", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ fontSize: 12, color: hasHard ? "#f87171" : "#f59e0b", fontFamily: "'DM Mono',monospace", letterSpacing: "1.5px", marginBottom: 6 }}>
          {hasHard ? "CHECK THIS VALUE" : "UNUSUAL VALUE"}
        </div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, color: "#dde8f5", marginBottom: 14 }}>
          {hasHard ? "This doesn't look right" : "Save this reading?"}
        </div>

        {hardIssues.map(([field, issue]) => (
          <div key={field} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#c4d8ee", marginBottom: 8, lineHeight: 1.5 }}>
              {issue.label}: <strong>{reading[field]}</strong> {issue.unit} is outside a plausible range.
            </div>
            {issue.suggestions.length > 0 ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {issue.suggestions.map(s => (
                  <button key={s} onClick={() => onSuggestion(field, s)}
                    style={{ padding: "7px 12px", background: "#132036", border: "1px solid #244266", borderRadius: 8, color: "#7eb8d8", fontSize: 12.5, fontFamily: "'DM Mono',monospace", cursor: "pointer" }}>
                    Use {s} {issue.unit}?
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#98afc4" }}>No suggested correction. Please edit the value manually.</div>
            )}
          </div>
        ))}

        {softFieldIssues.map(([field, issue]) => (
          <div key={field} style={{ fontSize: 12, color: "#c4d8ee", marginBottom: 10, lineHeight: 1.5 }}>
            {issue.label}: <strong>{reading[field]}</strong> {issue.unit} is far from your typical range.
          </div>
        ))}

        {crossFieldIssues.map((issue, i) => (
          <div key={i} style={{ fontSize: 12, color: "#c4d8ee", marginBottom: 10, lineHeight: 1.5 }}>{issue.message}</div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {!hasHard && (
            <button onClick={onConfirm}
              style={{ flex: 1, padding: "11px", background: "#10b981", border: "none", borderRadius: 9, color: "#fff", fontSize: 13, fontFamily: "'Sora',sans-serif", fontWeight: 600, cursor: "pointer" }}>
              Save Anyway
            </button>
          )}
          <button onClick={onCancel}
            style={{ flex: hasHard ? 1 : "none", padding: "11px 16px", background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 9, color: "#b0c4d8", fontSize: 13, fontFamily: "'Sora',sans-serif", cursor: "pointer" }}>
            {hasHard ? "Edit Manually" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App({ onNavChange }) {
  const [activeNav, setActiveNav] = useState("vitals");
  const handleNav = (id) => { if (id !== "vitals") { onNavChange?.(id); } else { setActiveNav(id); } };
  const [selectedId, setSelectedId] = useState("bp");
  const [timeRange, setTimeRange] = useState(1);
  const [showLog, setShowLog] = useState(false);
  const [manualReadings, setManualReadings] = useState(() => getStore('readings') ?? []);
  const [watchReadings, setWatchReadings]   = useState(() => getStore('watch_daily') ?? []);
  const [time, setTime] = useState(new Date());
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [newReading, setNewReading] = useState({ date:"", time:"", ts:"", bp_s:"", bp_d:"", hr:"", resting_hr:"", o2:"", weight:"", temp:"", glucose:"", sleep:"" });
  const [showFlagged, setShowFlagged] = useState(false);
  const [vitalSearch, setVitalSearch] = useState("");
  // A-12: pending plausibility gate — { reading, hardIssues, softIssues, onDone } | null.
  // Blocks the save until hard-band issues are resolved (or the reading is
  // edited/cancelled); soft-band issues need only a one-tap confirm.
  const [pendingPlausibility, setPendingPlausibility] = useState(null);

  useEffect(() => { const t = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(t); }, []);

  // Re-read readings when a Drive sync merges new data (e.g. logged on the phone).
  useEffect(() => {
    const onSynced = () => {
      setManualReadings(getStore('readings') ?? []);
      setWatchReadings(getStore('watch_daily') ?? []);
    };
    window.addEventListener("mi-data-synced", onSynced);
    return () => window.removeEventListener("mi-data-synced", onSynced);
  }, []);
  const fmt = d => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const fmtDate = d => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const config = VITALS.find(v => v.id === selectedId);
  const isWatch = config.data === "watch";
  const sourceData = isWatch ? watchReadings : manualReadings;
  const filteredRaw = filterByMonths(sourceData, timeRange);
  // For BMI, inject calculated bmi_calc field into each data point
  const filteredData = config.id === "bmi"
    ? filteredRaw.map(r => ({ ...r, bmi_calc: calcBMI(r.weight) })).filter(r => r.bmi_calc != null)
    : filteredRaw;
  // UI-4: per-field, not per-record — see FIELD_KEY_BY_VITAL_ID above.
  const latest = latestForVitalId(config.id);
  const latestWatch = watchReadings[0] ?? null;
  const prev = prevForVitalId(config.id);

  /**
   * A-12: run the plausibility guard on a candidate reading before it's
   * ever written. Hard band blocks the save (patient picks a suggestion or
   * edits manually — nothing auto-corrects); soft band confirms with one
   * tap and never blocks (real extreme values are what the tripwire, A-01,
   * exists to catch, not this guard). Plausibility resolves BEFORE the
   * write, so a blocked typo never reaches mi_readings and can never fire a
   * tripwire flag; a confirmed extreme is written and evaluated normally.
   */
  const attemptSaveReading = (reading, onDone) => {
    const fieldIssues = checkVitalReading(reading);
    const crossFieldIssues = checkVitalCrossFields(reading);
    const hardIssues = Object.entries(fieldIssues).filter(([, v]) => v.band === "hard");
    const softFieldIssues = Object.entries(fieldIssues).filter(([, v]) => v.band === "soft");
    if (hardIssues.length === 0 && softFieldIssues.length === 0 && crossFieldIssues.length === 0) {
      const merged = saveReading(reading);
      setManualReadings(merged);
      onDone();
      return;
    }
    setPendingPlausibility({ reading, hardIssues, softFieldIssues, crossFieldIssues, onDone });
  };

  const commitPendingReading = () => {
    if (!pendingPlausibility) return;
    const merged = saveReading(pendingPlausibility.reading);
    setManualReadings(merged);
    pendingPlausibility.onDone();
    setPendingPlausibility(null);
  };

  const applySuggestionToPending = (field, value) => {
    if (!pendingPlausibility) return;
    const updated = { ...pendingPlausibility.reading, [field]: value };
    // Recompute the flag — the corrected value must not keep the stale flag
    // the original typo earned.
    updated.flag = defaultVitalFlag(updated);
    setPendingPlausibility(null);
    attemptSaveReading(updated, pendingPlausibility.onDone);
  };

  const handleSave = form => {
    const reading = mkReading({
      date: form.date, time: form.time,
      bp_s: form.bp_s, bp_d: form.bp_d, hr: form.hr, resting_hr: form.resting_hr,
      o2: form.o2, weight: form.weight, temp: form.temp, glucose: form.glucose, sleep: form.sleep,
    });
    attemptSaveReading(reading, () => setShowLog(false));
  };

  const handleSaveReading = () => {
    const reading = mkReading({
      date: newReading.date, time: newReading.time,
      bp_s: newReading.bp_s, bp_d: newReading.bp_d, hr: newReading.hr, resting_hr: newReading.resting_hr,
      o2: newReading.o2, weight: newReading.weight, temp: newReading.temp, glucose: newReading.glucose, sleep: newReading.sleep,
    });
    attemptSaveReading(reading, () => {
      setShowEntryForm(false);
      setNewReading({ date:"", time:"", ts:"", bp_s:"", bp_d:"", hr:"", resting_hr:"", o2:"", weight:"", temp:"", glucose:"", sleep:"" });
    });
  };

  const flaggedManual = manualReadings.filter(r => r.flag).length;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#07090f", color: "#d4e2f0", fontFamily: "'Sora',sans-serif", overflow: "hidden" }}>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1a2840;border-radius:4px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes slideInRight{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .section-label{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#a0b4c8;font-family:'DM Mono',monospace;margin-bottom:10px}
        .vcard{background:#0b1220;border:1px solid #1c2a40;border-radius:12px;padding:12px 14px;cursor:pointer;transition:all .15s;margin-bottom:7px;animation:fadeUp .3s ease both}
        .vcard:hover{border-color:#1a2f4a}
        .vcard.sel{border-color:#6ea3ff;background:rgba(79,142,247,.07)}
        .time-btn{padding:4px 10px;border-radius:6px;border:none;font-size:12px;font-family:'DM Mono',monospace;cursor:pointer;background:#0f1e30;color:#7eb8d8;font-weight:500}
        .time-btn:hover{background:#162840}
        .time-btn.on{background:#4f8ef7;color:#fff}
        .hist-row{display:grid;grid-template-columns:72px 88px 54px 54px 62px 54px 64px 52px;gap:0;padding:8px 0;border-bottom:1px solid #1c2a40;align-items:center;font-size:12px}
        .hist-row:last-child{border-bottom:none}
        @media print { .no-print { display:none !important; } body { background:white !important; } }
      `}</style>

      {/* Sidebar */}
      <AppSidebar activeNav={activeNav} onNav={handleNav} />

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Top bar: shared (WO_DASHBOARD_POLISH_02 item 4; DEC-059) */}
        <TopBar activeNav={activeNav} onNav={handleNav} />
        {/* Screen actions */}
        <div className="screen-bar">
          <button onClick={()=>setShowLog(true)}
            style={{ padding:"7px 16px", background:"#10b981", border:"none", borderRadius:8, color:"#fff", fontSize:12, fontFamily:"'Sora',sans-serif", fontWeight:600, cursor:"pointer" }}>
            + Log Vitals
          </button>
          <PrintButton reportType="vitals" onPrint={() => printVitalsReport(manualReadings)} />
        </div>

        {/* Content */}
        <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative" }}>

          {/* Left — vital selector */}
          <div style={{ width:234, minWidth:234, borderRight:"1px solid #1c2a40", overflowY:"auto", padding:"18px 12px" }}>
            <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:21, color:"#dde8f5", fontWeight:400, letterSpacing:"-0.4px", marginBottom:3 }}>Vitals</h1>
            <p style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", marginBottom:14 }}>{manualReadings.length} readings · {flaggedManual} flagged</p>

            {/* Summary chips */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:14 }}>
              <div style={{ background: showFlagged ? "rgba(239,68,68,.08)" : "#0b1220", border: showFlagged ? "1px solid rgba(239,68,68,.4)" : "1px solid #1c2a40", borderRadius:10, padding:"9px 11px", cursor:"pointer", transition:"all .15s" }} onClick={() => setShowFlagged(f => !f)}>
                <div style={{ fontSize:17, fontWeight:700, color:"#f87171", lineHeight:1, marginBottom:2 }}>{flaggedManual}</div>
                <div style={{ fontSize:12, color: showFlagged ? "#f87171" : "#7eb8d8", fontWeight:600 }}>Flagged</div>
                <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>{showFlagged ? "clear" : "filter"}</div>
              </div>
              <div style={{ background:"#0b1220", border:"1px solid #1c2a40", borderRadius:10, padding:"9px 11px" }}>
                <div style={{ fontSize:17, fontWeight:700, color:"#6ea3ff", lineHeight:1, marginBottom:2 }}>{manualReadings.length}</div>
                <div style={{ fontSize:12, color:"#7eb8d8", fontWeight:600 }}>Readings</div>
              </div>
            </div>

            {/* Search */}
            <input
              value={vitalSearch}
              onChange={e => setVitalSearch(e.target.value)}
              placeholder="Search vitals…"
              style={{ width:"100%", background:"#080c14", border:"1px solid #1c2a40", borderRadius:8, padding:"7px 10px", fontSize:12, color:"#c4d8ee", fontFamily:"'DM Mono',monospace", outline:"none", marginBottom:10 }}
            />

            {/* Vital cards */}
            {VITALS.filter(v => v.label.toLowerCase().includes(vitalSearch.toLowerCase())).map((vc, i) => {
              const isWatch = vc.data === "watch";
              // Per-card, not the outer latest/prev (those are for the currently-SELECTED vital only).
              const latestR = isWatch ? (watchReadings[0] ?? null) : latestForVitalId(vc.id);
              const cardPrev = isWatch ? (watchReadings[1] ?? null) : prevForVitalId(vc.id);
              const val = latestR ? vc.latestNum(latestR) : null;
              const status = latestR ? vc.statusFn(latestR, cardPrev) : null;
              const isSelected = selectedId === vc.id;
              return (
                <div key={vc.id} className={`vcard ${isSelected?"sel":""}`} style={{ animationDelay:`${i*40}ms` }} onClick={()=>setSelectedId(vc.id)}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:vc.color, textTransform:"uppercase", letterSpacing:"0.5px", fontFamily:"'DM Mono',monospace" }}>{vc.label}</div>
                    {isWatch && <span style={{ fontSize:12, background:"rgba(79,142,247,.15)", color:"#6ea3ff", padding:"1px 5px", borderRadius:8, fontFamily:"'DM Mono',monospace", fontWeight:600 }}>WATCH</span>}
                  </div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:5, marginBottom:2 }}>
                    <span style={{ fontSize:19, fontWeight:700, color: status && status.color === "#ef4444" ? "#f87171" : "#dde8f5", lineHeight:1 }}>
                      {latestR ? vc.latestFn(latestR) : "–"}
                    </span>
                    <span style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>{vc.unit}</span>
                  </div>
                  {status && <div style={{ fontSize:12, color:status.color, fontWeight:600 }}>{status.label}</div>}
                  {latestR?.date && <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", marginTop:2 }}>Last: {formatDateUS(latestR.date)}</div>}
                </div>
              );
            })}
          </div>

          {/* Center — chart + detail */}
          <div style={{ flex:1, overflowY:"auto", padding:"22px 26px", minWidth:0 }}>
            {/* Log Reading button */}
            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
              <button onClick={() => setShowEntryForm(o => !o)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:"rgba(79,142,247,.12)", border:"1px solid rgba(79,142,247,.3)", borderRadius:8, color:"#7eb8d8", fontSize:12, fontFamily:"'Sora',sans-serif", cursor:"pointer" }}>
                + Log Reading
              </button>
            </div>

            {showEntryForm && (
              <div style={{ marginBottom:20, padding:"18px", background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:12 }}>
                <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"1.5px", marginBottom:14 }}>NEW VITAL READING</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 }}>
                  {[
                    { label:"DATE", key:"date", placeholder:"", type:"date" },
                    { label:"TIME (OPTIONAL)", key:"time", placeholder:"", type:"time" },
                    { label:"BP SYSTOLIC", key:"bp_s", placeholder:"131" },
                    { label:"BP DIASTOLIC", key:"bp_d", placeholder:"71" },
                    { label:"HEART RATE", key:"hr", placeholder:"64" },
                    { label:"RESTING HR", key:"resting_hr", placeholder:"58" },
                    { label:"O2 SATURATION %", key:"o2", placeholder:"99" },
                    { label:"WEIGHT (lbs)", key:"weight", placeholder:"184.2" },
                    { label:"TEMP (°F)", key:"temp", placeholder:"98.4" },
                    { label:"GLUCOSE", key:"glucose", placeholder:"98" },
                    { label:"SLEEP (hrs)", key:"sleep", placeholder:"7.5" },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", display:"block", marginBottom:4 }}>{f.label}</label>
                      <input
                        type={f.type || "text"}
                        style={{ background:"#080c14", border:"1px solid #1a2f4a", borderRadius:6, padding:"7px 10px", fontSize:12, color:"#c4d8ee", fontFamily:"'Sora',sans-serif", width:"100%", outline:"none" }}
                        placeholder={f.placeholder}
                        value={newReading[f.key]}
                        onChange={e => setNewReading(prev => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={handleSaveReading} style={{ padding:"8px 18px", background:"rgba(79,142,247,.15)", border:"1px solid rgba(79,142,247,.4)", borderRadius:8, color:"#7eb8d8", fontSize:12, fontFamily:"'Sora',sans-serif", cursor:"pointer" }}>Save Reading</button>
                  <button onClick={() => setShowEntryForm(false)} style={{ padding:"8px 14px", background:"transparent", border:"1px solid #1c2a40", borderRadius:8, color:"#b0c4d8", fontSize:12, fontFamily:"'Sora',sans-serif", cursor:"pointer" }}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ animation:"fadeUp .3s ease both" }}>

              {/* Header */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:3 }}>
                    <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:24, color:"#dde8f5", fontWeight:400, letterSpacing:"-0.4px" }}>{config.label}</h2>
                    {isWatch && (
                      <span style={{ fontSize:12, background:"rgba(79,142,247,.15)", color:"#6ea3ff", padding:"3px 8px", borderRadius:5, fontFamily:"'DM Mono',monospace", fontWeight:600 }}>AUTO · APPLE WATCH</span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>
                    {filteredData.length} readings in view
                    {isWatch && " · Daily sync via HealthKit"}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <button
                    onClick={() => {
                      const latestR = isWatch ? latestWatch : latest;
                      const latestStr = latestR ? config.latestFn(latestR) : null;
                      const showLatest = latestStr && latestStr !== "–";
                      const prompt = `Please analyze my ${config.label} readings${showLatest ? ` (most recent: ${latestStr}${config.unit ? " " + config.unit : ""})` : ""} over the last ${timeRange} month${timeRange > 1 ? "s" : ""}. Cross-reference the trend with my medications, conditions, other vitals, and labs; flag anything concerning; and tell me what to discuss with my care team.`;
                      localStorage.setItem("mi_ai_pending", prompt);
                      onNavChange?.("ai");
                    }}
                    title={`Ask AI to analyze your ${config.label} trend`}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", background:"rgba(79,142,247,.14)", border:"1px solid rgba(79,142,247,.4)", borderRadius:8, color:"#7eb8d8", fontSize:12, fontFamily:"'Sora',sans-serif", fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}
                  >
                    ✦ Ask AI
                  </button>
                  <div style={{ display:"flex", gap:4 }}>
                    {[1,3,6].map(m => (
                      <button key={m} className={`time-btn ${timeRange===m?"on":""}`} onClick={()=>setTimeRange(m)}>{m}mo</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stat strip */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
                {(() => {
                  const latestR = isWatch ? latestWatch : latest;
                  const status = latestR ? config.statusFn(latestR, prev) : null;
                  const vals = filteredData.map(r => config.latestNum(r)).filter(v => v != null);
                  const avgVal = avg(vals);
                  const flagged = filteredData.filter(r => {
                    const v = config.latestNum(r);
                    return v != null && (v < config.goodMin || v > config.goodMax);
                  }).length;
                  return [
                    { label:"Latest", value: latestR ? config.latestFn(latestR) : "–", sub: isWatch ? latestWatch?.date : latest?.date, color: status?.color ?? "#dde8f5" },
                    { label:"Avg (period)", value: avgVal ? avgVal.toFixed(1) : "–", sub: config.unit, color:"#c4d8ee" },
                    { label:"Out of Range", value: flagged, sub:`of ${filteredData.length} readings`, color: flagged > 0 ? "#ef4444" : "#10b981" },
                    { label:"Data Source", value: isWatch ? "Watch" : "Manual", sub: isWatch ? "HealthKit daily" : "Sporadic entry", color: isWatch ? "#4f8ef7" : "#7eb8d8" },
                  ];
                })().map(({ label, value, sub, color }) => (
                  <div key={label} style={{ background:"#0b1220", border:"1px solid #1c2a40", borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", marginBottom:6 }}>{label}</div>
                    <div style={{ fontSize:16, fontWeight:700, color, marginBottom:2 }}>{value}</div>
                    <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div style={{ background:"#0b1220", border:"1px solid #1c2a40", borderRadius:14, padding:"16px 14px 10px", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div className="section-label" style={{ marginBottom:0 }}>{timeRange}-Month Trend</div>
                  <div style={{ display:"flex", gap:12 }}>
                    {config.chartLabels.map((lbl, i) => (
                      <div key={lbl} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>
                        <div style={{ width:14, height:2, background: config.chartType === "band" ? (i===0?"rgba(248,113,113,0.4)":config.color) : (config.chartColors?.[i] ?? config.color), borderRadius:2 }}/>
                        {lbl}
                      </div>
                    ))}
                  </div>
                </div>
                {config.chartType === "line" && (() => {
                  // Dynamic y-axis: expand config bounds to fit actual data + padding
                  let yMin = config.chartYMin;
                  let yMax = config.chartYMax;
                  if (filteredData.length >= 2) {
                    const vals = filteredData
                      .flatMap(r => config.chartKeys.map(k => r[k]))
                      .filter(v => v != null);
                    if (vals.length >= 2) {
                      const dMin = Math.min(...vals);
                      const dMax = Math.max(...vals);
                      const pad  = Math.max((dMax - dMin) * 0.2, 3);
                      yMin = Math.floor(Math.min(yMin, dMin - pad));
                      yMax = Math.ceil(Math.max(yMax, dMax + pad));
                    }
                  }
                  return <LineChart data={filteredData} keys={config.chartKeys} colors={config.chartColors} yMin={yMin} yMax={yMax} refLines={config.refLines ?? []} />;
                })()}
                {config.chartType === "band" && (
                  <BandChart data={filteredData} minKey="hr_min" maxKey="hr_max" restingKey="resting_hr" color={config.color} yMin={config.chartYMin} yMax={config.chartYMax} />
                )}
                {config.chartType === "bar" && (
                  <BarChart data={filteredData} valueKey="sleep" color={config.color} yMin={config.chartYMin} yMax={config.chartYMax} targetMin={7} targetMax={9} />
                )}
              </div>

              {/* History table — focused on selected vital */}
              {!isWatch && (
                <div style={{ background:"#0b1220", border:"1px solid #1c2a40", borderRadius:14, padding:"14px 18px" }}>
                  <div className="section-label">Reading History</div>
                  {(() => {
                    const rows = filterByMonths(manualReadings, timeRange);
                    const id = config.id;
                    // column definitions per vital
                    const cols = id === "bp"
                      ? [{ h:"Date", fn:r=><>{formatDateUS(r.date)}{r.flag&&<span style={{marginLeft:3,fontSize:12,color:"#f87171"}}>▲</span>}</>, c:r=>"#98afc4" },
                         { h:"Systolic",  fn:r=>r.bp_s??'–', c:r=>r.bp_s>=140?"#ef4444":r.bp_s>=130?"#f59e0b":"#c4d8ee", bold:true },
                         { h:"Diastolic", fn:r=>r.bp_d??'–', c:r=>r.bp_d>=90?"#ef4444":"#c4d8ee" },
                         { h:"HR",        fn:r=>r.hr??'–',   c:r=>"#7eb8d8" }]
                    : id === "o2"
                      ? [{ h:"Date",       fn:r=><>{formatDateUS(r.date)}{r.flag&&<span style={{marginLeft:3,fontSize:12,color:"#f87171"}}>▲</span>}</>, c:r=>"#98afc4" },
                         { h:"O2 Sat %",     fn:r=>r.o2!=null?`${r.o2}%`:'–', c:r=>r.o2!=null&&r.o2<95?"#ef4444":r.o2!=null&&r.o2<97?"#f59e0b":"#10b981", bold:true },
                         { h:"HR",         fn:r=>r.hr??'–',  c:r=>"#7eb8d8" }]
                    : id === "weight"
                      ? [{ h:"Date",   fn:r=><>{formatDateUS(r.date)}{r.flag&&<span style={{marginLeft:3,fontSize:12,color:"#f87171"}}>▲</span>}</>, c:r=>"#98afc4" },
                         { h:"Weight (lbs)", fn:r=>r.weight??'–', c:r=>"#f59e0b", bold:true },
                         { h:"Change", fn:(r,i,arr)=>{const p=arr[i+1]; return p&&r.weight&&p.weight?(r.weight-p.weight>0?"+":"")+(r.weight-p.weight).toFixed(1):"–"}, c:(r,i,arr)=>{const p=arr[i+1]; if(!p||!r.weight||!p.weight)return"#a0b4c8"; return r.weight>p.weight?"#ef4444":r.weight<p.weight?"#10b981":"#a0b4c8";} }]
                    : id === "temp"
                      ? [{ h:"Date",     fn:r=><>{formatDateUS(r.date)}{r.flag&&<span style={{marginLeft:3,fontSize:12,color:"#f87171"}}>▲</span>}</>, c:r=>"#98afc4" },
                         { h:"Temp °F",  fn:r=>r.temp!=null?`${r.temp}°`:'–', c:r=>r.temp>99.5?"#ef4444":r.temp>99?"#f59e0b":"#b0c4d8", bold:true }]
                    : id === "glucose"
                      ? [{ h:"Date",       fn:r=><>{formatDateUS(r.date)}{r.flag&&<span style={{marginLeft:3,fontSize:12,color:"#f87171"}}>▲</span>}</>, c:r=>"#98afc4" },
                         { h:"Glucose mg/dL", fn:r=>r.glucose??'–', c:r=>r.glucose>125?"#ef4444":r.glucose>100?"#f59e0b":r.glucose<70?"#ef4444":"#10b981", bold:true },
                         { h:"Status", fn:r=>r.glucose>125?"High":r.glucose>100?"Pre-diabetic":r.glucose<70?"Low":"Normal", c:r=>r.glucose>125?"#ef4444":r.glucose>100?"#f59e0b":r.glucose<70?"#ef4444":"#10b981" }]
                    : id === "resting_hr"
                      ? [{ h:"Date",       fn:r=><>{formatDateUS(r.date)}{r.flag&&<span style={{marginLeft:3,fontSize:12,color:"#f87171"}}>▲</span>}</>, c:r=>"#98afc4" },
                         { h:"Resting HR", fn:r=>r.resting_hr!=null?`${r.resting_hr} bpm`:'–', c:r=>r.resting_hr==null?"#a0b4c8":r.resting_hr>70?"#f59e0b":"#10b981", bold:true },
                         { h:"Status", fn:r=>r.resting_hr==null?"–":r.resting_hr>70?"Elevated":r.resting_hr<50?"Low":"Good", c:r=>r.resting_hr==null?"#a0b4c8":r.resting_hr>70?"#f59e0b":"#10b981" }]
                    : id === "bmi"
                      ? [{ h:"Date",   fn:r=><>{formatDateUS(r.date)}</>, c:r=>"#98afc4" },
                         { h:"Weight", fn:r=>r.weight!=null?`${r.weight} lbs`:'–', c:r=>"#f59e0b" },
                         { h:"BMI",    fn:r=>{const b=calcBMI(r.weight);return b!=null?`${b}`:'–';}, c:r=>{const b=calcBMI(r.weight);return bmiLabel(b).color;}, bold:true },
                         { h:"Category", fn:r=>bmiLabel(calcBMI(r.weight)).label, c:r=>bmiLabel(calcBMI(r.weight)).color }]
                    : id === "sleep"
                      ? [{ h:"Date",     fn:r=><>{formatDateUS(r.date)}{r.flag&&<span style={{marginLeft:3,fontSize:12,color:"#f87171"}}>▲</span>}</>, c:r=>"#98afc4" },
                         { h:"Sleep hrs", fn:r=>r.sleep?`${r.sleep}h`:'–', c:r=>r.sleep<6?"#ef4444":r.sleep<7?"#f59e0b":"#10b981", bold:true },
                         { h:"Status", fn:r=>r.sleep<6?"Poor":r.sleep<7?"Below goal":"Good", c:r=>r.sleep<6?"#ef4444":r.sleep<7?"#f59e0b":"#10b981" }]
                      : [];
                    if (!cols.length) return null;
                    return (
                      <>
                        <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols.length},1fr)`, gap:8, borderBottom:"1px solid #1c2a40", paddingBottom:7, marginBottom:2 }}>
                          {cols.map(c => <div key={c.h} style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"0.8px" }}>{c.h}</div>)}
                        </div>
                        {rows.length === 0 && <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", padding:"10px 0" }}>No readings yet.</div>}
                        {rows.map((r,i,arr) => (
                          <div key={r.ts} style={{ display:"grid", gridTemplateColumns:`repeat(${cols.length},1fr)`, gap:8, padding:"6px 0", borderBottom:"1px solid #0a1525" }}>
                            {cols.map((c,ci) => (
                              <div key={ci} style={{ fontSize:12, color:c.c(r,i,arr), fontWeight:c.bold?600:400, fontFamily:"'DM Mono',monospace" }}>{c.fn(r,i,arr)}</div>
                            ))}
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Watch history — resting HR */}
              {isWatch && (
                <div style={{ background:"#0b1220", border:"1px solid #1c2a40", borderRadius:14, padding:"14px 18px" }}>
                  <div className="section-label">Daily Watch Data</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:6 }}>
                    {filteredData.slice(0,28).map(r => (
                      <div key={r.ts} style={{ background:"#080c14", borderRadius:8, border:"1px solid #1c2a40", padding:"8px 10px" }}>
                        <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", marginBottom:4 }}>{formatDateUS(r.date)}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#f87171" }}>{r.resting_hr} <span style={{ fontSize:12, color:"#98afc4" }}>bpm</span></div>
                        <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>Range {r.hr_min}–{r.hr_max}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {showLog && <LogPanel onClose={()=>setShowLog(false)} onSave={handleSave} />}
        </div>
      </div>
      {pendingPlausibility && (
        <PlausibilityGate
          pending={pendingPlausibility}
          onConfirm={commitPendingReading}
          onSuggestion={applySuggestionToPending}
          onCancel={() => setPendingPlausibility(null)}
        />
      )}
    </div>
  );
}

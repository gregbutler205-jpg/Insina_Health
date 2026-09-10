// ─────────────────────────────────────────────────────────────────────────────
// companionUI.jsx — Shared design tokens & primitive components for the companion
// Dark-navy theme matching the web app. DO NOT alter color values.
// ─────────────────────────────────────────────────────────────────────────────

// ── Design tokens ─────────────────────────────────────────────────────────────
export const C = {
  bg:     "#07090f",
  card:   "#0b1220",
  b1:     "#1a2f4a",
  b2:     "#1c2a40",
  blue:   "#6ea3ff",
  green:  "#2dd4a0",
  amber:  "#f59e0b",
  red:    "#f87171",
  purple: "#a78bfa",
  p:      "#dde8f5",
  s:      "#7eb8d8",
  dim:    "#98afc4",
  ghost:  "#8299ad",
};

export const mono  = "'DM Mono',monospace";
export const serif = "'DM Serif Display',serif";
export const sans  = "'Sora',sans-serif";

// Severity → color, shared by symptoms / flags / safety levels
export const LEVEL_COLOR = { critical: C.red, caution: C.amber, info: C.blue, ok: C.green };

// ── Section label ───────────────────────────────────────────────────────────
export function SL({ children, mb = 8 }) {
  return (
    <div style={{ fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: C.dim, fontFamily: mono, marginBottom: mb }}>
      {children}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{ background: C.card, border: `1px solid ${C.b2}`, borderRadius: 12, padding: "14px 16px", ...style }}>
      {children}
    </div>
  );
}

// ── In-screen back bar (for screens reached from a tab, e.g. Emergency, Visit) ──
export function BackBar({ title, onBack, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.card, borderBottom: `1px solid ${C.b2}`, flexShrink: 0, position: "sticky", top: 0, zIndex: 10 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.blue, fontSize: 20, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>←</button>
      <div style={{ fontFamily: serif, fontSize: 18, color: C.p, fontWeight: 400, flex: 1 }}>{title}</div>
      {right}
    </div>
  );
}

// ── Pill / chip ─────────────────────────────────────────────────────────────
export function Pill({ children, color = C.blue }) {
  return (
    <span style={{ fontSize: 12, background: color + "22", color, border: `1px solid ${color}40`, borderRadius: 10, padding: "2px 8px", fontFamily: mono, flexShrink: 0 }}>
      {children}
    </span>
  );
}

// ── Primary action button ─────────────────────────────────────────────────────
export function Btn({ children, onClick, disabled, color = C.blue, style = {} }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        width: "100%", padding: 12, background: `${color}1a`, border: `1px solid ${color}4d`,
        borderRadius: 10, color, fontSize: 13, fontFamily: sans, fontWeight: 600,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1, ...style,
      }}>
      {children}
    </button>
  );
}

// ── Lightweight prose renderer for AI markdown (bold headers, bullets, dividers)
function inlineBold(text, keyBase) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**")
      ? <strong key={`${keyBase}-${i}`} style={{ color: C.p }}>{seg.slice(2, -2)}</strong>
      : <span key={`${keyBase}-${i}`}>{seg}</span>
  );
}
export function Prose({ text }) {
  const lines = String(text || "").split("\n");
  return (
    <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6 }}>
      {lines.map((raw, i) => {
        const line = raw.trim();
        if (!line) return <div key={i} style={{ height: 6 }} />;
        if (/^[-—*_]{3,}$/.test(line)) return <div key={i} style={{ borderTop: `1px solid ${C.b2}`, margin: "8px 0" }} />;
        const header = line.match(/^\*\*(.+)\*\*:?$/);
        if (header) return <div key={i} style={{ color: C.s, fontWeight: 700, fontSize: 12, margin: "8px 0 3px" }}>{header[1]}</div>;
        const bullet = line.match(/^[-•]\s+(.*)$/);
        if (bullet) return (
          <div key={i} style={{ display: "flex", gap: 7, padding: "2px 0" }}>
            <span style={{ color: C.blue }}>•</span><span style={{ flex: 1 }}>{inlineBold(bullet[1], i)}</span>
          </div>
        );
        const numbered = line.match(/^(\d+)\.\s+(.*)$/);
        if (numbered) return (
          <div key={i} style={{ display: "flex", gap: 7, padding: "2px 0" }}>
            <span style={{ color: C.blue, fontFamily: mono }}>{numbered[1]}.</span><span style={{ flex: 1 }}>{inlineBold(numbered[2], i)}</span>
          </div>
        );
        return <div key={i} style={{ padding: "2px 0" }}>{inlineBold(line, i)}</div>;
      })}
    </div>
  );
}

// ── Empty-state line ──────────────────────────────────────────────────────────
export function Empty({ children }) {
  return <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, padding: "20px 0", textAlign: "center", lineHeight: 1.8 }}>{children}</div>;
}

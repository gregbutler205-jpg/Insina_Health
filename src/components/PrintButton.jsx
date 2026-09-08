// ── THE Print button (WO_DASHBOARD_POLISH_02 item 5 A and C; DEC-061) ────────
// One look on every screen (the top bar button idiom, 44px targets) and one
// gate: every print runs through the RIE preflight (requestReport) before the
// report is generated. Pass `reportType` + `onPrint` for one report, or
// `items` [{ label, reportType, onPrint }] for a small menu where a screen
// offers two reports. `compact` renders the icon only (aria-label "Print").
import { useEffect, useRef, useState } from "react";
import { Printer, ChevronDown } from "lucide-react";
import { requestReport } from "../rie/preflightChecks.js";

export default function PrintButton({ reportType = "report", onPrint, items, label = "Print", compact = false, disabled = false, title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const fire = (type, fn) => {
    setOpen(false);
    if (typeof fn !== "function") return;
    requestReport(type || "report", fn);
  };
  const cls = compact ? "topbar-icon" : "topbar-btn";
  const icon = <Printer size={compact ? 20 : 18} aria-hidden="true" />;

  if (items && items.length) {
    return (
      <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
        <button type="button" className={cls} aria-haspopup="true" aria-expanded={open} aria-label={compact ? label : undefined} title={title || label} disabled={disabled} onClick={() => setOpen(o => !o)}>
          {icon}{!compact && <span>{label}</span>}<ChevronDown size={14} aria-hidden="true" />
        </button>
        {open && (
          <div role="group" aria-label="Print options" className="print-menu">
            {items.map(it => (
              <button key={it.label} type="button" className="print-menu-item" onClick={() => fire(it.reportType, it.onPrint)}>{it.label}</button>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <button type="button" className={cls} aria-label={compact ? label : undefined} title={title || label} disabled={disabled} onClick={() => fire(reportType, onPrint)}>
      {icon}{!compact && <span>{label}</span>}
    </button>
  );
}

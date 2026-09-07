// ── Bell: passive events behind an icon (WO_DASHBOARD_FEED_01 4.10; DEC-053) ──
// Backups, syncs, vitals logged, in-range result sets, imports completed.
// There is no unified event log, so the list is composed from the timestamps
// the record already keeps (Tier 2, reported). Nothing here is a flag.
import { useEffect, useRef, useState } from "react";
import { Bell as BellIcon } from "lucide-react";
import { passiveEvents, bellUnseenCount, markBellSeen } from "./feed.js";

const MONO = "'DM Mono',monospace";

export default function Bell({ readings = [], refreshKey = 0 }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(() => passiveEvents(readings));
  const [unseen, setUnseen] = useState(() => bellUnseenCount(passiveEvents(readings)));
  const ref = useRef(null);

  useEffect(() => {
    const ev = passiveEvents(readings);
    setEvents(ev);
    setUnseen(bellUnseenCount(ev));
  }, [readings, refreshKey]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = () => {
    setOpen(o => {
      const next = !o;
      if (next) { markBellSeen(); setUnseen(0); }
      return next;
    });
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        aria-label={unseen > 0 ? `Updates, ${unseen} new` : "Updates"}
        aria-expanded={open}
        title="Updates"
        onClick={toggle}
        style={{ width: 44, minWidth: 44, minHeight: 44, borderRadius: 10, border: "1.5px solid transparent", background: "transparent", color: "var(--text-dim)", cursor: "pointer", position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        <BellIcon size={22} aria-hidden="true" />
        {unseen > 0 && (
          <span aria-hidden="true" style={{ position: "absolute", top: 4, right: 4, background: "var(--accent-blue)", color: "#07090f", fontSize: 12, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", fontFamily: "'Sora',sans-serif" }}>{unseen}</span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="What's new" style={{ position: "absolute", right: 0, top: 52, minWidth: 320, maxWidth: 380, background: "var(--card)", border: "1px solid var(--border-strong)", borderRadius: 12, padding: 6, boxShadow: "0 16px 40px rgba(0,0,0,.5)", zIndex: 300 }}>
          <div style={{ padding: "8px 12px 4px", fontSize: 13, fontWeight: 600, color: "var(--text-label)", fontFamily: MONO, letterSpacing: "1px", textTransform: "uppercase" }}>What's new</div>
          {events.length === 0 && (
            <div style={{ padding: "10px 12px 12px", fontSize: 14, color: "var(--text-dim)", lineHeight: 1.5 }}>No updates yet. Backups, syncs, logged vitals, and in-range results will show here.</div>
          )}
          {events.map(e => (
            <div key={e.id} style={{ minHeight: 44, padding: "8px 12px", borderRadius: 8, color: "var(--text-primary)", fontSize: 14, lineHeight: 1.4 }}>
              {e.text}
              <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", fontFamily: MONO }}>{e.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

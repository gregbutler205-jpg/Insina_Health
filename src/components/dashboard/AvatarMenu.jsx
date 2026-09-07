// ── Avatar menu (WO_DASHBOARD_FEED_01 4.12; DEC-056) ─────────────────────────
// Patient name and condition line, then Profile, Settings, Backup, Log out.
// Log out keeps the WO-1 confirmation: the record stays on the device,
// encrypted and locked. Closes on outside click and on Escape.
import { useEffect, useRef, useState } from "react";
import { User, Settings, DatabaseBackup, LogOut } from "lucide-react";

function patientLine() {
  let name = "", condition = "";
  try { name = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}").name || ""; } catch { /* locked or unset */ }
  try {
    const c = JSON.parse(localStorage.getItem("mi_conditions") || "[]").filter(x => x.status === "active");
    condition = c[0]?.name || "";
  } catch { /* locked or unset */ }
  return { name, condition };
}

export default function AvatarMenu({ onNav, picture }) {
  const [open, setOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const ref = useRef(null);
  const { name, condition } = patientLine();
  const initial = (name || "?")[0].toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const go = (nav, page) => {
    setOpen(false);
    if (page) { try { sessionStorage.setItem("insina_backup_page", page); } catch { /* non-fatal */ } }
    onNav(nav);
  };

  const item = (Icon, label, onClick) => (
    <button key={label} onClick={onClick}
      style={{ width: "100%", minHeight: 44, border: "none", background: "transparent", color: "var(--text-primary)", fontSize: 15, fontFamily: "'Sora',sans-serif", textAlign: "left", padding: "0 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--card-deep)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      <Icon size={18} aria-hidden="true" /> {label}
    </button>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button aria-label="Account" aria-expanded={open} title="Account" onClick={() => setOpen(o => !o)}
        style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid var(--border-strong)", background: picture ? "transparent" : "linear-gradient(135deg, #4f8ef7, #a78bfa)", color: "#07090f", fontWeight: 700, fontSize: 15, fontFamily: "'Sora',sans-serif", cursor: "pointer", padding: 0, overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {picture ? <img src={picture} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} /> : initial}
      </button>
      {open && (
        <div role="menu" aria-label="Account menu" style={{ position: "absolute", right: 0, top: 52, minWidth: 230, background: "var(--card)", border: "1px solid var(--border-strong)", borderRadius: 12, padding: 6, boxShadow: "0 16px 40px rgba(0,0,0,.5)", zIndex: 300 }}>
          <div style={{ padding: "8px 12px 8px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-bright)" }}>{name || "Your record"}</div>
            {condition && <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>{condition}</div>}
          </div>
          {item(User, "Profile", () => go("profile"))}
          {item(Settings, "Settings", () => go("backup", "settings"))}
          {item(DatabaseBackup, "Backup", () => go("backup", "backup"))}
          {item(LogOut, "Log out", () => { setOpen(false); setLogoutConfirm(true); })}
        </div>
      )}
      {logoutConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div role="alertdialog" aria-modal="true" aria-label="Log out of Insina Health?" style={{ background: "var(--card)", border: "1px solid var(--border-strong)", borderRadius: 14, padding: 28, maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontSize: 17, color: "var(--text-bright)", marginBottom: 10 }}>Log out of Insina Health?</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 22, lineHeight: 1.6 }}>
              Your record stays on this device, encrypted and locked. Log back in with your password.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setLogoutConfirm(false)}
                style={{ minHeight: 44, padding: "9px 20px", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 9, color: "var(--text-secondary)", fontFamily: "var(--font-sans)", fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => { setLogoutConfirm(false); window.dispatchEvent(new Event("insina-logout")); }}
                style={{ minHeight: 44, padding: "9px 24px", background: "rgba(79,142,247,.18)", border: "1px solid rgba(79,142,247,.45)", borderRadius: 9, color: "var(--accent-soft)", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

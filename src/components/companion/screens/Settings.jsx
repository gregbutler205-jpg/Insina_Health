// ── Settings — notification preferences (3 independent types). ─────────────────
// The app is fully usable with all of these off.
import { useState } from "react";
import { C, mono, serif, Card } from "../companionUI.jsx";
import { getNotifPrefs, setNotifPrefs, requestNotifPermission } from "../../../lib/notify.js";
import { signInWithRedirect } from "../../../lib/googleAuth.js";

function startDriveRestore() {
  try { sessionStorage.setItem("insina_companion_restore", "1"); } catch { /* private mode */ }
  signInWithRedirect();
}

const TYPES = [
  { key: "appts",  label: "Appointment reminders", blurb: "Ahead of upcoming visits, with a prompt to review the brief." },
  { key: "alerts", label: "Attention alerts",      blurb: "When a pattern flag or out-of-range result is worth a glance." },
];

export default function Settings({ onBack }) {
  const [prefs, setPrefs] = useState(getNotifPrefs());
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  async function toggle(key) {
    let granted = perm === "granted";
    if (!prefs[key] && !granted) { granted = await requestNotifPermission(); setPerm(granted ? "granted" : (Notification?.permission || "denied")); }
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); setNotifPrefs(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.card, borderBottom: `1px solid ${C.b2}`, position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.blue, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>←</button>
        <div style={{ fontFamily: serif, fontSize: 18, color: C.p, flex: 1 }}>Notifications</div>
      </div>

      <div style={{ overflowY: "auto", padding: 16 }}>
        {/* Sync/restore: adopt the web app's vault so this phone shows the same
            record and syncs both ways. Needed once, if this device set up its
            own vault instead of restoring. */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: C.p, fontWeight: 600 }}>Sync with the web app</div>
          <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginTop: 4, marginBottom: 10, lineHeight: 1.5 }}>
            Pull your record from Google Drive and share the web app's vault, so this phone shows your data and syncs both ways. You'll unlock with your existing password.
          </div>
          <button onClick={startDriveRestore}
            style={{ width: "100%", background: "rgba(79,142,247,.12)", border: `1px solid ${C.b1}`, borderRadius: 10, padding: "11px", color: C.blue, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Restore from Google Drive
          </button>
        </Card>

        {perm === "denied" && (
          <div style={{ background: "#1c1200", border: `1px solid ${C.amber}40`, borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#fcd34d", fontFamily: mono, lineHeight: 1.5 }}>
            Notifications are blocked in your browser settings: enable them there to use these.
          </div>
        )}
        {perm === "unsupported" && (
          <div style={{ background: "#0d1a28", border: `1px solid ${C.b1}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: C.dim, fontFamily: mono }}>
            This browser doesn’t support notifications. The app works fully without them.
          </div>
        )}

        {TYPES.map(t => (
          <Card key={t.key} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: C.p, fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginTop: 2, lineHeight: 1.4 }}>{t.blurb}</div>
              </div>
              <Toggle on={prefs[t.key]} onClick={() => toggle(t.key)} />
            </div>
          </Card>
        ))}

        <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, lineHeight: 1.5, marginTop: 8, paddingBottom: 24 }}>
          Medication reminders are set per dose-time on the Meds screen. Reminders run while the app is open; background push will arrive in a later update.
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{ width: 44, height: 26, borderRadius: 13, border: `1px solid ${on ? C.green : C.b1}`, background: on ? "rgba(16,185,129,.25)" : C.bg, position: "relative", cursor: "pointer", flexShrink: 0, transition: "all .15s" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: on ? C.green : C.ghost, transition: "left .15s" }} />
    </button>
  );
}

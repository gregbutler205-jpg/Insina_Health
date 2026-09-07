// ── Sign-in / welcome gate — shown before the app when not connected. ──────────
// Full-screen, safe-area aware (so nothing hides under the iOS status bar/notch),
// with a large, easily-tappable Google sign-in. Signing in is optional: capture
// works offline, so "Continue without signing in" is offered too.
import { C, mono, serif, sans, Btn } from "../companionUI.jsx";

const LOGO = import.meta.env.BASE_URL + "logo-white.png";

export default function SignIn({ onSignIn, onSkip }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
      textAlign: "center", background: C.bg, fontFamily: sans,
      padding: "calc(env(safe-area-inset-top) + 48px) 28px calc(env(safe-area-inset-bottom) + 40px)",
    }}>
      <img src={LOGO} alt="Insina Health" style={{ width: 176, height: 176, objectFit: "contain", marginBottom: 24, opacity: 0.95 }} />
      <div style={{ fontFamily: serif, fontSize: 30, color: C.p, lineHeight: 1.1 }}>Insina Health</div>
      <div style={{ fontSize: 12, color: C.s, fontFamily: mono, letterSpacing: "3px", textTransform: "uppercase", marginTop: 6 }}>Companion</div>

      <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.7, margin: "22px 0 30px", maxWidth: 300 }}>
        Sign in with Google to sync your health record. Your data stays in your own Google Drive: Insina’s servers never see it.
      </div>

      <div style={{ width: "100%", maxWidth: 320 }}>
        <Btn onClick={onSignIn} style={{ padding: 14, fontSize: 14 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
            <GoogleG /> Sign in with Google
          </span>
        </Btn>
        <button onClick={onSkip}
          style={{ width: "100%", marginTop: 14, background: "none", border: "none", color: C.ghost, fontSize: 12, fontFamily: mono, cursor: "pointer", padding: 8 }}>
          Continue without signing in
        </button>
      </div>

      <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, lineHeight: 1.6, marginTop: 30, maxWidth: 300 }}>
        You can capture vitals, meds, symptoms, and visits offline either way. They’ll sync once you connect.
      </div>
    </div>
  );
}

// Inline Google "G" so the button reads as a real Google sign-in without an asset.
function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18A13.7 13.7 0 0 1 10.96 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A22 22 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 9.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 3.05 29.93 1 24 1 15.4 1 7.96 5.93 4.34 13.12l7.35 5.7C13.42 13.62 18.27 9.75 24 9.75z" />
    </svg>
  );
}

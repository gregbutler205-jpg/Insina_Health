import { wirePrintWindow } from "../lib/printWindow.js";

const PRINT_LOGO = import.meta.env.BASE_URL + "logo.png";

// ─────────────────────────────────────────────────────────────────────────────
// PrintableConsent — opens a formatted print window with the Advanced Mode
// consent document. Call printConsent(consentData) to trigger the print dialog.
// consentData: { mode, consentDate, consentVersion }
// ─────────────────────────────────────────────────────────────────────────────

export function printConsent(consentData = {}) {
  const {
    mode          = "Advanced",
    consentDate   = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    consentVersion = "1.0",
  } = consentData;

  const win = window.open("", "_blank", "width=860,height=720");
  if (!win) return;

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Insina Health: Advanced Mode Consent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      max-width: 720px;
      margin: 56px auto;
      color: #1a1a1a;
      font-size: 13.5px;
      line-height: 1.75;
      padding: 0 24px;
    }
    .logo { height: 52px; margin-bottom: 22px; display: block; }
    h1 {
      font-size: 26px;
      font-weight: 700;
      text-align: center;
      letter-spacing: -.4px;
      margin-bottom: 6px;
    }
    .subtitle {
      text-align: center;
      font-size: 13px;
      color: #555;
      font-family: 'Courier New', monospace;
      margin-bottom: 28px;
    }
    .rule { border: none; border-top: 2px solid #2563eb; margin-bottom: 28px; }
    h2 {
      font-size: 15px;
      font-weight: 700;
      margin-top: 22px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: .5px;
    }
    p { margin-bottom: 12px; }
    ul { margin: 0 0 12px 22px; }
    li { margin-bottom: 6px; }
    .consent-record {
      margin-top: 32px;
      border: 1.5px solid #2563eb;
      border-radius: 6px;
      padding: 16px 20px;
      background: #f0f6ff;
    }
    .consent-record .label {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #555;
      text-transform: uppercase;
      letter-spacing: .5px;
      margin-bottom: 4px;
    }
    .consent-record .value {
      font-size: 13px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 12px;
    }
    .footer {
      margin-top: 44px;
      border-top: 1px solid #ccc;
      padding-top: 12px;
      font-size: 10.5px;
      color: #888;
      font-family: 'Courier New', monospace;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { margin: 28px auto; }
      button { display: none !important; }
    }
  </style>
</head>
<body>

  <img src="${PRINT_LOGO}" class="logo" alt="Insina Health" />
  <h1>Advanced AI Mode: Informed Consent</h1>
  <div class="subtitle">Insina Health: Consent Document v${consentVersion}</div>
  <hr class="rule" />

  <h2>What Advanced Mode Does</h2>
  <p>
    Advanced Mode uses a more powerful AI model (Claude Opus) to provide deeper, more detailed
    analysis of your personal health data. This includes cross-referencing your lab results,
    medications, vitals, conditions, and surgical history to surface insights and flag concerns
    beyond what Standard Mode offers.
  </p>

  <h2>Understanding the Limitations</h2>
  <p>
    Advanced Mode AI analysis is a <strong>personal health intelligence tool</strong>. It is
    <strong>not</strong> a substitute for professional medical advice, diagnosis, or treatment.
    Specifically:
  </p>
  <ul>
    <li>AI responses are informational only and do not constitute medical advice.</li>
    <li>Always consult your physician or transplant team before making any changes to your medications, diet, or treatment plan.</li>
    <li>The AI model may make errors or omissions. Do not act on AI analysis alone.</li>
    <li>In an emergency, call 911 or go to your nearest emergency room. Do not consult the app.</li>
  </ul>

  <h2>Your Data and Privacy</h2>
  <p>
    Your health record is stored on your device. When you use AI, information needed for your
    request is sent pseudonymously and securely through Insina to Anthropic to generate the
    response. Insina's proxy does not store or log message content. No request content is
    retained after the response is delivered. The hosting infrastructure that runs the proxy
    (Render) retains standard HTTP access metadata (IP addresses, timestamps, request paths) as
    part of normal server operation, independent of anything Insina's own code does. Pseudonymous
    is not the same as anonymous: your data is identified only by a random ID, never your name,
    but it is still your data.
  </p>
  <ul>
    <li>Your data is never sold or shared with third parties.</li>
    <li>All health records remain in your browser's local storage under your control.</li>
    <li>You can switch back to Standard Mode at any time from the Settings &amp; Backup.</li>
    <li>You can export or delete all your data at any time.</li>
  </ul>

  <h2>Consent and Acknowledgment</h2>
  <p>
    By activating Advanced Mode, you acknowledge that:
  </p>
  <ul>
    <li>You have read and understood this consent document.</li>
    <li>You understand Advanced Mode AI analysis is for informational purposes only.</li>
    <li>You consent to your health data being processed by the Anthropic API to generate responses.</li>
    <li>You will continue to follow your physician's guidance and not use this app as a replacement for professional care.</li>
    <li>You understand you can withdraw consent and return to Standard Mode at any time.</li>
  </ul>

  <div class="consent-record">
    <div class="label">Consent Mode</div>
    <div class="value">${mode} Mode: Advanced AI Analysis</div>
    <div class="label">Consent Date</div>
    <div class="value">${consentDate}</div>
    <div class="label">Consent Version</div>
    <div class="value">v${consentVersion}</div>
    <div class="label">Consent Status</div>
    <div class="value" style="color:#16a34a">&#10003; Active: Informed Consent Given</div>
  </div>

  <div class="footer">
    <span>Insina Health: Personal Health Intelligence</span>
    <span>Printed ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
  </div>

</body>
</html>`);
  win.document.close();
  wirePrintWindow(win); // CSP-safe: the opener fires print; inline scripts are blocked in the popup
}

// ─────────────────────────────────────────────────────────────────────────────
// React component version — renders inline consent text (used inside modals)
// ─────────────────────────────────────────────────────────────────────────────
export default function ConsentText({ style = {} }) {
  const s = {
    fontSize: 11.5,
    color: "#a8c4dc",
    lineHeight: 1.7,
    fontFamily: "'Sora', sans-serif",
    ...style,
  };
  const h2 = {
    fontSize: 11,
    fontWeight: 700,
    color: "#c4d8ee",
    fontFamily: "'DM Mono', monospace",
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 4,
  };
  const li = { marginBottom: 4, paddingLeft: 4 };

  return (
    <div style={s}>
      <div style={h2}>What Advanced Mode Does</div>
      <p style={{ marginBottom: 10 }}>
        Advanced Mode uses Claude Opus, a more capable AI model, to provide deeper cross-referenced
        analysis of your labs, medications, vitals, and history. Responses are richer and more detailed
        than Standard Mode.
      </p>

      <div style={h2}>Important Limitations</div>
      <ul style={{ paddingLeft: 16, marginBottom: 10 }}>
        <li style={li}>AI responses are informational only. Not medical advice.</li>
        <li style={li}>Always consult your physician before changing medications or treatment.</li>
        <li style={li}>In an emergency, call 911. Do not rely on this app.</li>
        <li style={li}>The AI may make errors. Never act on AI analysis alone.</li>
      </ul>

      <div style={h2}>Your Data</div>
      <ul style={{ paddingLeft: 16, marginBottom: 10 }}>
        <li style={li}>Your health record is stored on your device. Information needed for your request is sent pseudonymously and securely through Insina to Anthropic to generate the response.</li>
        <li style={li}>Insina's proxy does not store or log message content, though the hosting infrastructure retains standard HTTP access metadata (IPs, timestamps, paths) as part of normal operation.</li>
        <li style={li}>Pseudonymous is not the same as anonymous. Your data is identified by a random ID, never your name, but it is still your data.</li>
        <li style={li}>You can return to Standard Mode at any time in Settings &amp; Backup.</li>
      </ul>

      <div style={h2}>Your Acknowledgment</div>
      <p style={{ marginBottom: 0 }}>
        By enabling Advanced Mode you confirm you have read and understood this consent, and you agree
        your health data may be processed by the Anthropic API to generate your responses.
      </p>
    </div>
  );
}

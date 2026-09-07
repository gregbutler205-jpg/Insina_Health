// ── Onboarding privacy footer (ONBOARDING_SPEC v1.1 §9.1) ────────────────────
// The §9.1 copy is exact and lives ONLY here (acceptance §11.1 greps for it
// verbatim and for the absence of the old mockup strings). Do not paraphrase.

export default function PrivacyFooter() {
  return (
    <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text-secondary)", maxWidth: 640, margin: "0 auto" }}>
      <strong style={{ color: "var(--text-primary)" }}>Your data. Your control.</strong>{" "}
      Your records are stored on your device or in your own Google Drive: never on Insina
      servers. When you use AI features like document reading or analysis, only the information
      needed for that request is sent securely to our AI processor to generate your result;
      it isn&apos;t stored there.
    </p>
  );
}

// §9.3 medical disclaimer — welcome screen + every generated artifact footer.
export function MedicalDisclaimer() {
  return (
    <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text-secondary)", maxWidth: 640, margin: "0 auto" }}>
      Insina organizes your health information and helps you prepare questions for your care
      team. It does not diagnose, treat, or provide medical advice. For urgent symptoms,
      contact your transplant team or call 911.
    </p>
  );
}

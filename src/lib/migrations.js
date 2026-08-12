// ── Schema versioning & migration rails (A-08) ───────────────────────────────
// Every mi_* store change from here forward is an ordered, idempotent migration
// gated by mi_schema_version, run once at boot before first render. Twenty-plus
// prior releases evolved the stores with no recorded version; this file is the
// starting rail going forward, not a retroactive migration of undocumented
// history — migration v1 below is a no-op version stamp for exactly that reason.
//
// P-02 (vault encryption) and A-07 (binary blob move, Phase 2) are the first
// real migrations to land on these rails.

import { appendAudit } from "../rie/auditLog.js";

const VERSION_KEY     = "mi_schema_version";
const INTERRUPTED_KEY = "mi_migration_interrupted";

function getVersion() {
  const raw = localStorage.getItem(VERSION_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}
function setVersion(v) { localStorage.setItem(VERSION_KEY, String(v)); }

/**
 * Download a full JSON export of the current mi_* record. This is the
 * export-backup-first step ahead of a major migration (CHANGELOG's own MAJOR
 * definition: breaking changes to how data is stored). It is a fire-and-forget
 * browser download, not a blocking confirmation — an individual major
 * migration (e.g. P-02's vault encryption) builds its own interactive
 * confirm/backup UI on top of this hook when the migration itself warrants
 * blocking the user for consent; this function guarantees a safety-net file
 * exists on disk regardless.
 */
function autoExportBackup(reason) {
  try {
    const snapshot = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("mi_")) snapshot[key] = localStorage.getItem(key);
    }
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `insina-backup-pre-migration-${reason}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    console.warn("[migrations] auto-export backup failed:", e);
  }
}

/**
 * Ordered migration list. Each entry:
 *   version     — target schema version this migration produces
 *   major       — true if this is a breaking change to how data is stored;
 *                 triggers the export-backup step first
 *   description — human-readable; written to the RIE audit log
 *   run()       — performs the migration; must be safe to no-op if the data
 *                 already looks migrated (defends against a retried/partial run)
 */
const MIGRATIONS = [
  {
    version: 1,
    major: false,
    description: "Baseline: stamp existing installs with schema version 1. No data changed — establishes the starting point for every future migration.",
    run() { /* no-op: version stamp only */ },
  },
  {
    version: 2,
    major: false, // additive only: adds fields, never removes or restructures existing ones
    description: "UI-4 / A-12: normalize mi_readings onto the shared vital schema (id, canonical date, enteredAt, optional time). Fixes four independently-written vital-save paths disagreeing on shape — one used a locale display string for `date` and a separate `ts` for the real date, another used an epoch-millisecond `ts` with no `date` at all.",
    run() {
      let readings;
      try { readings = JSON.parse(localStorage.getItem("mi_readings") || "[]"); } catch { readings = []; }
      if (!Array.isArray(readings) || readings.length === 0) return;

      const isCanonicalDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
      let idCounter = 0;
      const genId = () => `mig-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

      const migrated = readings.map((r) => {
        // Already on the new schema (has id, enteredAt, and a canonical date) — leave untouched.
        if (r.id && r.enteredAt && isCanonicalDate(r.date)) return r;

        let canonicalDate;
        if (isCanonicalDate(r.date)) {
          canonicalDate = r.date; // companion entries: already YYYY-MM-DD
        } else if (isCanonicalDate(r.ts)) {
          canonicalDate = r.ts; // Tab06 entries: ts held the real YYYY-MM-DD, `date` was a display string
        } else if (typeof r.ts === "number" && Number.isFinite(r.ts)) {
          const d = new Date(r.ts);
          canonicalDate = isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
        } else {
          canonicalDate = new Date().toISOString().slice(0, 10); // unrecoverable — last resort, not silently dropped
        }

        return {
          ...r,
          id: r.id || genId(),
          date: canonicalDate,
          time: r.time || "",
          enteredAt: r.enteredAt || `${canonicalDate}T12:00:00.000Z`,
          source: r.source || "manual",
        };
      });

      localStorage.setItem("mi_readings", JSON.stringify(migrated));
    },
  },
  {
    version: 3,
    major: true, // moves data between stores (mi_imaging → mi_diagnostics), then removes the old key
    description: "Diagnostics tab: migrate mi_imaging entries into mi_diagnostics. Each imaging study becomes a diagnostic study (name from type + body part, e.g. \"MRI — Liver\"); ordered-by / reading-provider / impression / related-condition start blank for the patient to fill in. mi_imaging is removed after a verified copy.",
    run() {
      let imaging;
      try { imaging = JSON.parse(localStorage.getItem("mi_imaging") || "[]"); } catch { imaging = []; }
      if (!Array.isArray(imaging)) imaging = [];

      let diagnostics;
      try { diagnostics = JSON.parse(localStorage.getItem("mi_diagnostics") || "[]"); } catch { diagnostics = []; }
      if (!Array.isArray(diagnostics)) diagnostics = [];

      if (imaging.length > 0) {
        const existingIds = new Set(diagnostics.map(d => d.id));
        let idCounter = 0;
        const genId = () => `imgmig-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
        const converted = imaging
          .filter(e => !existingIds.has(e.id)) // re-entrant safe: a retried run never duplicates
          .map(e => ({
            id: e.id || genId(),
            name: [e.type, e.bodyPart].filter(Boolean).join(" — ") || "Imaging study",
            date: e.date || "",
            orderedBy: "",
            readingProvider: "",
            impression: "",
            relatedCondition: "",
            facility: e.facility || "",
            migratedFromImaging: true,
          }));
        const merged = [...diagnostics, ...converted];
        localStorage.setItem("mi_diagnostics", JSON.stringify(merged));
        // Verify the write landed before deleting the source store.
        const verify = JSON.parse(localStorage.getItem("mi_diagnostics") || "[]");
        if (!Array.isArray(verify) || verify.length < merged.length) {
          throw new Error("mi_diagnostics write verification failed — mi_imaging left untouched");
        }
      }
      localStorage.removeItem("mi_imaging");
    },
  },
  {
    version: 4,
    major: false, // additive only: new keys with defaults, one new metadata field; nothing removed or reshaped
    description: "History Builder (DEC-P44/P45/P46 pending merge): seed mi_attestations and mi_history_builder with defaults, stamp tier 'archive' on existing documents (absent tier already means archive; the stamp makes it explicit), and seed mi_staged_items. Idempotent: every write is skipped when the key or field already exists.",
    run() {
      const seed = (key, value) => {
        if (localStorage.getItem(key) == null) {
          localStorage.setItem(key, JSON.stringify(value));
        }
      };
      seed("mi_attestations", { medsCompleteAt: null, allergiesResolvedAt: null, conditionsReviewedAt: null });
      seed("mi_staged_items", []);
      if (localStorage.getItem("mi_history_builder") == null) {
        let goal = "skipped";
        try {
          const ob = JSON.parse(localStorage.getItem("mi_onboarding_state") || "null");
          const map = { appointment_prep: "appointment", track_meds_labs: "meds_labs", emergency_packet: "emergency", organize_meds: "organize_meds", patient_profile: "profile" };
          goal = map[ob?.goal] || "skipped";
        } catch { /* unmapped resolves to skipped */ }
        localStorage.setItem("mi_history_builder", JSON.stringify({ goal, targetAppointmentId: null, dismissals: [], s4Covered: false, emergencyReadyShownAt: null }));
      }
      for (const key of ["mi_documents", "mi_ref_docs"]) {
        let docs;
        try { docs = JSON.parse(localStorage.getItem(key) || "[]"); } catch { docs = []; }
        if (!Array.isArray(docs) || docs.length === 0) continue;
        if (docs.every(d => d && d.tier)) continue; // already stamped: idempotent no-op
        localStorage.setItem(key, JSON.stringify(docs.map(d => (d && !d.tier ? { ...d, tier: "archive" } : d))));
      }
    },
  },
  // Future migrations (A-07 blob-store move, etc.) append here, in order,
  // each bumping `version` by 1.
];

/**
 * Run every migration between the currently stored version and the latest
 * defined migration, in order. Safe to call on every boot: already-applied
 * migrations are skipped by version check, and each run() must itself be
 * re-entrant-safe in case a prior attempt was interrupted mid-migration.
 */
export function runMigrations() {
  let current = getVersion();
  const pending = MIGRATIONS.filter(m => m.version > current).sort((a, b) => a.version - b.version);
  if (pending.length === 0) return { ran: 0, version: current };

  for (const m of pending) {
    if (m.major) {
      localStorage.setItem(INTERRUPTED_KEY, String(m.version));
      autoExportBackup(`v${m.version}`);
    }
    try {
      m.run();
      setVersion(m.version);
      current = m.version;
      appendAudit({ action: "migration", version: m.version, major: m.major, description: m.description });
      if (m.major) localStorage.removeItem(INTERRUPTED_KEY);
    } catch (e) {
      // Leave INTERRUPTED_KEY set (major) / version un-bumped (either case) so
      // the next boot retries this migration instead of silently skipping it.
      console.error(`[migrations] migration v${m.version} failed:`, e);
      // F-14: record the error TYPE only in the persisted audit, never the
      // message — a thrown error could theoretically embed record content, and
      // the audit is stored at rest. The full message still goes to the
      // ephemeral console above for debugging.
      appendAudit({ action: "migration_failed", version: m.version, major: m.major, description: m.description, error: e?.name || "Error" });
      break; // stop; never apply later migrations out of order over a failure
    }
  }
  return { ran: pending.length, version: current };
}

/** True if a prior boot started a major migration that never completed. */
export function hasInterruptedMigration() {
  return localStorage.getItem(INTERRUPTED_KEY) !== null;
}

export function currentSchemaVersion() { return getVersion(); }

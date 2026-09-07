# Insina Health Decisions Log

This file records **why** the system is the way it is: the load-bearing decisions,
the reasoning behind them, and the alternatives that were rejected. It is deliberately
distinct from the other two repo docs:

- **DECISIONS.md** (this file): why a thing was decided, and what reversing it would undo.
- **CHANGELOG.md**: what shipped and when.
- **CLAUDE.md**: how the project works (context for building).

Keep them separate. A feature that ships is a CHANGELOG entry. A choice you would not
want silently reversed six months from now is a DECISIONS entry.

---

## For Claude Code

Read this file at the start of every session, alongside CLAUDE.md. Do not reverse or
re-implement anything marked **Settled** without explicit instruction from Greg. If a
task would contradict a Settled decision, stop and flag it rather than proceeding.

---

## Conventions

- **Append-only.** Never edit away an old decision. To change one, add a new entry and
  mark the old one `Superseded by DEC-NNN`. The history of the reasoning is the point.
- **Stable IDs.** Each entry has a `DEC-NNN` id. Cite it in commit messages and specs
  (for example: "implements DEC-005 provider-range provenance").
- **Status values:** `Settled`, `Settled (pending implementation)`, `Open`, `Superseded`.
- **Scope.** This file is for safety, regulatory, architectural, and data-integrity
  decisions. Routine UI and feature choices belong in CHANGELOG.md.
- **Standing caveat.** Entries that touch FDA classification or clinical thresholds
  reflect reasoning, not legal advice. They are marked where external regulatory counsel
  is required before commercialization.

## Standing regulatory context (so future sessions do not re-litigate it)

- The whole platform splits into two risk buckets. Aggregation, display, organizing,
  formatting, and exporting the patient's own records is essentially a personal health
  record: low risk, very likely not a device. The AI Analysis module is where device
  risk lives, and where the decisions below apply.
- Most 2025 to 2026 state health-AI laws target two actors Insina is not: providers using
  AI in diagnosis or treatment, and payers using AI in utilization review or prior
  authorization. Insina's real state touchpoints are narrower: developer-transparency
  statutes (Colorado AI Act, Texas TRAIGA) if the AI is deemed high-risk, and California
  AB 489 on license-implying naming (see OPEN-2). The state layer is unsettled: a federal
  effort to preempt state AI laws is underway, but as of mid-2026 those laws still stand.

---

## DEC-001: AI Analysis stays strictly informational (the device-line firewall)

**Date:** 2026-07-02
**Status:** Settled (principle). Marketing and overview copy alignment is Open (OPEN-1).

**Decision.** The AI Analysis module presents the patient's own data and the questions to
raise with their care team. It does not interpret disease state, declare what is clinically
wrong, or issue treatment or management directives. "Things to discuss with [doctor]" is the
substance of every output, not a disclaimer appended to a conclusion.

**Reasoning.** FDA reissued its final Clinical Decision Support (CDS) guidance on 2026-01-06
(reissued 2026-01-29). It states that CDS intended to provide recommendations to patients or
caregivers (non-clinicians) generally meets the device definition, and that existing device
policies continue to apply to patient-facing software functions. The general wellness
off-ramp is unavailable because Insina is explicitly disease-specific (transplant,
immunosuppression), not general wellness. Intended use is established largely by claims and
marketing, so directive-style output is itself evidence that can convert the software into a
regulated device. A "does not diagnose" disclaimer does not neutralize this, because FDA
reads function and claims, not disclaimers.

**Alternatives rejected.**
- Let the AI state clinical conclusions (for example "critically sub-therapeutic, requires
  immediate action"). Rejected: directive-giving is the device-flavored behavior being avoided.
- Rely on a disclaimer to cover directive output. Rejected: disclaimers do not control the
  FDA intended-use analysis.

**External validation.** The device-classification line should be reviewed by an FDA
regulatory attorney before the AI module is commercialized.

**Related:** DEC-002, DEC-003, OPEN-1, OPEN-2, OPEN-5.

---

## DEC-002: The operative line is tripwire vs. clinical interpretation, not urgent vs. not urgent

**Date:** 2026-07-02
**Status:** Settled

**Decision.** The app may recognize a value crossing a known threshold and route the person
toward care with appropriate urgency (a "tripwire"). It must not interpret why a value is
abnormal, declare what it means about the disease, or state a management step. Routing and
speed statements are allowed; diagnosis and treatment statements are not.

**Reasoning.** "This number can be an emergency, seek care now" is a routing statement, the
same category as a smoke detector or a pharmacy red-flag line. "Your level is sub-therapeutic
and needs action" is a clinical judgment about the patient's disease. Both feel urgent to the
patient; only the second is the thing regulators treat as a device function. The referral must
be the endpoint of a display function, not a caveat bolted onto a conclusion already delivered.

**Alternatives rejected.**
- Treat all urgency as forbidden to stay maximally conservative. Rejected: that produces a
  product that stays calm and analytical while a patient is at 220/180, which is both
  indefensible and unsafe.

**Related:** DEC-001, DEC-003.

---

## DEC-003: Emergency escalation runs as a deterministic layer outside the AI

**Date:** 2026-07-02
**Status:** Settled (principle). Threshold table and firing copy pending (OPEN-3).

**Decision.** Red-flag escalation is a hard-coded threshold check, separate from the AI
Analysis narrative. It fires identically every time on a number, points the person to emergency
services or their care team, and does not name a diagnosis. It is deliberately not generated by
the language model.

**Reasoning.** Keeping escalation as plain threshold logic keeps it in the defensible safety
tripwire category rather than entangled with the interpretive module. Separately, a generative
model should not be the thing deciding whether someone is having an emergency; that decision
must be deterministic and repeatable. This is the one place where "AI proposes, patient
disposes" is the wrong pattern: an emergency tripwire should fire, not propose.

**Alternatives rejected.**
- Omit emergency escalation to appear more conservative. Rejected: leaving it out is the actual
  safety failure, not a conservative virtue.
- Let the LLM decide case by case what counts as an emergency. Rejected: non-deterministic and
  unsafe for a life-safety function.

**Implementation guidance.** Keep the emergency thresholds a short, fixed, well-established list
drawn from standard sources. Point to emergency services, not to a named condition (say "seek
emergency care," not "you may be in hypertensive crisis"). Keep the check in its own code path,
not in the model prompt.

**External validation.** Where "obvious red-flag value" ends and "clinical interpretation"
begins is a judgment call at the margins; the threshold list and its firing copy should be
reviewed by regulatory counsel.

**Related:** DEC-002, DEC-004, OPEN-3, OPEN-5.

---

## DEC-004: The tripwire layer covers critical labs, not only vital signs

**Date:** 2026-07-02
**Status:** Settled

**Decision.** The red-flag threshold layer includes critical laboratory values, tacrolimus at
both the low and high ends, not just acute vital signs.

**Reasoning.** For a liver-transplant recipient, a tacrolimus level that is too low is not
benign. Sustained sub-therapeutic levels are how rejection gains a foothold and can threaten the
graft. A vitals-only emergency layer would miss dangerous labs entirely. Both ends of the range
carry real risk and both belong in the tripwire.

**Alternatives rejected.**
- Limit the tripwire to acute vital-sign emergencies such as 220/180. Rejected: labs can be
  red-flag values too, and for this patient population the low end of a drug level is as
  dangerous as the high end.

**Related:** DEC-003, DEC-005.

---

## DEC-005: Critical thresholds use provider-set, individualized ranges with attributed provenance

**Date:** 2026-07-02
**Status:** Settled (principle). Schema and provenance model pending (OPEN-4).

**Decision.** Critical-lab tripwires fire against the range the patient's treating physician set
for that individual (example: a tacrolimus target of 3 to 6 for a tac-sensitive living-donor
recipient, not the lab default of 5 to 20). The range is captured by prompting the patient to
obtain it from their provider (via Consultation Prep) and is stored as a distinct, attributed,
dated field that records the provider as the author. It is not blended into a generic
"normal range" column.

**Reasoning.** Applying a clinician-set parameter is about as far from "software making the
clinical call" as possible; it is closer to a reminder than to CDS. It moves the clinical
judgment back to the clinician and leaves the app with only "did we cross the line the physician
drew." Provenance must be legible: if asked what basis the app used to flag a value, the answer
should be "the range the patient's hepatologist specified for them." This also fixes the
generic-threshold failure mode, where a fixed default would either cry wolf or, worse, stay
silent inside an atypical patient's real danger zone.

**Alternatives rejected.**
- Hard-coded generic reference ranges for critical labs. Rejected: wrong for atypical patients,
  and authored by the software rather than by the physician.

**Implementation guidance.** When a tripwire fires, cite the provider's threshold, state the
stakes in general terms, and route to the care team. Do not explain why the value changed or
what it implies about the graft. Store provider-set ranges as their own field with author and
date, separate from any generic reference range.

**Related:** DEC-004, DEC-006, OPEN-4.

---

## DEC-006: A missing critical-lab range surfaces a prompt, never a silent default

**Date:** 2026-07-02
**Status:** Settled

**Decision.** When a patient has no provider-set range for a critical lab, the app surfaces a
Consultation Prep prompt asking them to obtain their target range from their care team. It does
not silently substitute a generic default and flag against it.

**Reasoning.** Falling back to a generic range reintroduces the exact problem DEC-005 solved and
can under-alert a sensitive patient. The app must never be the author of a critical threshold,
including by default.

**Alternatives rejected.**
- Silent fallback to a generic lab reference range when the personalized range is absent.
  Rejected: under-alerts atypical patients and makes the software the threshold's author.

**Related:** DEC-005.

---

## DEC-007: Account-level security hardening is staged, deferred until before the first additional user

**Date:** 2026-07-02
**Status:** Settled (staged). Trigger: before any second person's data enters the system. Component split: the password component is resolved by DEC-009 (passphrase encryption, before any second user); the 2FA component's trigger is refined by DEC-010 (server-side login surface).

**Decision.** Two-step verification, alphanumeric passwords, and per-user authentication are
deferred. The app currently uses a 4-digit PIN (SHA-256, session unlock) plus inactivity
auto-lock, and that is accepted as proportionate for the current single-user, single-owner-device
situation. The deferred hardening is committed to land before any person other than Greg stores
data in the app.

**Reasoning.** 2FA and per-user auth protect an account boundary that does not exist in a
single-user app. Building them now would mean designing against a multi-user architecture that has
not been designed yet. The 4-digit PIN protects a local-only store on a device Greg controls,
which is a proportionate posture for n-of-1 use. The risk this defers (weak brute-force resistance
on a 10,000-value PIN space) is bounded because the hash is not synced and the data is local.

**Trigger (explicit, so the gate is not missed).** The hardening must be implemented before the
first non-Greg user's data enters any instance. Onboarding a second user without it is a gate
violation, not a later cleanup.

**Alternatives rejected.**
- Build 2FA and per-user auth now. Rejected: premature, against an undesigned multi-user model.
- Leave the trigger unstated ("handle it before launch"). Rejected: a deferral with no named
  trigger is how pre-launch gates get skipped.

**Related:** DEC-008, CL-015, CL-016, CL-017.

---

## DEC-008: Encryption at rest is committed before multi-user; present plaintext is a deliberate posture; the storage abstraction layer lands first

**Date:** 2026-07-02
**Status:** Settled (staged), with one present-tense sub-item (the abstraction layer). Amended by DEC-009: encryption mechanism specified (passphrase-derived, PG-10); the accepted plaintext posture ends at the pilot gate.

**Decision.** Three parts.
1. The current posture, the full record stored as plaintext in localStorage and as a plaintext
   JSON on the user's Google Drive, is accepted as a deliberate choice for the current single-user
   situation, protected by the device login, the Google account, and the app PIN.
2. Encryption at rest is committed to land before any additional user stores data, alongside the
   hardening in DEC-007.
3. The storage abstraction layer (a unified read/write interface over localStorage and Drive)
   should be built earlier than the encryption itself, so that adding encryption later is a
   contained change to one layer rather than a rewrite of every read and write, the merge logic,
   and the restore path.

**Reasoning.** For a single-user app on a controlled device, plaintext at rest behind existing
logins is a legitimate posture, but it is one worth choosing on purpose, because the data
(transplant status, medications, labs, insurance IDs) is already sensitive and already Greg's,
today. Encryption is not a flip-the-switch pre-launch task: it changes the data model and touches
storage, backup format, merge, and restore. Bolting it on at launch, the same moment the first real
second user and their data arrive, is the highest-risk time to change how data is stored. Landing
the abstraction layer first de-risks that.

**Scope boundary (to prevent false comfort).** At-rest encryption does not address the AI proxy
transit question (CL-003). The record must reach the model in readable form to be used, so
encrypting localStorage and Drive does nothing about data passing through the proxy. At-rest and
in-transit-to-a-third-party are separate axes; CL-003 remains open on its own terms.

**Alternatives rejected.**
- File encryption entirely under "before launch" as a single late task. Rejected: it is partly a
  present-posture question about Greg's own data, and it is too data-model-invasive to safely land
  at launch without the abstraction layer already in place.
- Encrypt now. Not rejected on principle, but not required; the accepted single-user posture makes
  it optional at this stage. If chosen early, the abstraction layer still comes first.

**Related:** DEC-007, CL-003, OPEN-6.

---

---

## DEC-009: Amends DEC-008 — "password protection" means passphrase-derived encryption, not a login screen

**Date:** 2026-07-11
**Status:** Settled (pending implementation). Trigger: before any pilot user's data enters the system.

**Decision.** "Password protected," as a pilot-readiness milestone, means the password derives
an encryption key (PBKDF2 or Argon2 via WebCrypto) that encrypts the record at rest
(localStorage, AES-GCM) and before every Drive upload. A recovery-key export is required at
setup so a forgotten passphrase does not destroy the record. The existing 4-digit PIN may
remain as a quick-unlock convenience in front of decryption, but is not itself the security
boundary and must not be described as one in user-facing copy.

**Reasoning.** DEC-007/DEC-008 gated "encryption" before additional users without specifying
mechanism. In a non-custodial architecture, a password that only gates UI access (the current
PIN model) protects nothing: there is no server-side record for it to guard, and the underlying
data is plaintext in localStorage regardless.

**Related:** DEC-007, DEC-008 (amended by this entry), PG-10, APP_CHANGES_SPEC P-02.

---

## DEC-010: Two-step authorization deferred until a server-side login surface exists

**Date:** 2026-07-11
**Status:** Settled (deferred). Trigger: introduction of server-side accounts — itself a DEC-level event.

**Decision.** 2FA protects a remote account/login surface. This architecture has none — storage
is local/Drive, not server-authenticated accounts. Building 2FA now would protect nothing that
exists. Defer until server-side accounts are introduced, and treat that introduction itself as
a decision point: it is the first time this app would hold custodial data (login credentials),
which changes the non-custodial posture at DEC level and deserves its own entry, not a quiet
addition alongside an unrelated feature.

**Reasoning.** Refines DEC-007's bundled trigger for the 2FA component specifically: the
password component of DEC-007's deferred hardening is resolved by DEC-009 (passphrase
encryption, before any second user); the 2FA component waits for a login surface to protect.

**Related:** DEC-007 (trigger refined for the 2FA component), DEC-009, PILOT_GATE "Deferred".

---

## DEC-011: Clinical prompt content must be patient-generic or patient-injected, never founder-specific static text

**Date:** 2026-07-11
**Status:** Settled (pending implementation). Trigger: before any pilot user's data enters the system.

**Decision.** Static prompt text carries zero patient-specific clinical facts. Content is
either (a) condition-generic and gated on the patient's own injected problem list, or
(b) generated per patient and versioned like any other clinical content. This is a hard rule
for all AI-facing surfaces (Tab05, Tab11, Tab14, and any future tab), not a one-time cleanup.

**Reasoning.** Pilot review found the AI system prompts and reference-data blocks contain the
founder's specific clinical facts as hardcoded static text (serostatus, a specific prophylaxis
regimen, condition-specific dietary framing) rather than deriving them from injected patient
data. For a second user, the app would confidently deliver the founder's clinical context as
if it were theirs.

**Related:** PG-06, A-09, A-06, INSINA_AI_PROMPTS §1 (architecture principles).

---

## DEC-012: The RIE flag-don't-fix principle extends to the AI prompt-build layer

**Date:** 2026-07-11
**Status:** Settled (pending implementation). Trigger: before any pilot user's data enters the system.

**Decision.** Any correction to patient-entered clinical terminology, wherever in the codebase
it happens, routes through the Review Queue for explicit patient confirmation. No silent
rewrites of clinical fact, full stop — this was already the rule for RIE itself; this decision
closes the gap where a similar rewrite existed outside RIE's scope.

**Reasoning.** The surgical-history prompt-injection step silently rewrites "kidney
transplant"/"LDKT" to "Liver Transplant (LDLT) [corrected]" before the model ever sees it —
the same class of risk RIE's flag-don't-fix principle exists to prevent, but outside RIE, in
prompt-construction code, invisible to the patient, and corrupting for any real
kidney-transplant user.

**Related:** PG-07, A-05, the RIE flag-don't-fix principle.

---

## DEC-013: Deterministic urgency thresholds must be evaluated in code, not left to the model

**Date:** 2026-07-11
**Status:** Settled (pending implementation). Required before pilot, and independently required for the SaMD positioning already on record.

**Decision.** Incoming labs are evaluated against `URGENCY_THRESHOLDS` deterministically at
import and sync time; the result is a flag the AI can explain and echo, never a classification
the AI originates. This applies per patient, since thresholds may carry personalized
doctor-set ranges (existing custom-range handling).

**Reasoning.** `urgencyThresholds.js` defines critical lab bounds with a header comment
claiming Standard Mode AI uses them, but no code path evaluates the array. The LLM is
currently the only thing classifying lab-value urgency (Routine/Soon/Today/Emergency), which
conflicts with the deterministic-tripwire-layer decision already on record (DEC-003).

**Related:** DEC-002, DEC-003, DEC-005, OPEN-3, OPEN-4 (both land via A-01), PG-09, A-01.

---

## DEC-014: Repo hygiene — no live credentials, no local-machine metadata, in the public repository

**Date:** 2026-07-11
**Status:** Settled. Immediate, independent of pilot timing.

**Decision.** `*.docx`, `.claude/`, and any file containing credentials are gitignored. Any
credential ever committed is treated as compromised and rotated immediately, not just deleted
from the working tree — deletion alone leaves it recoverable in git history and requires a
history purge.

**Reasoning.** A live GitHub personal access token was found committed inside a .docx file in
the repo root (undetected by GitHub's secret scanning, since docx is a zip container). Local
Claude Code settings, including local file paths, were also committed.

**Related:** PG-01, S-01, S-06.

---

## DEC-015: The AI proxy requires authentication and enforced rate limiting before any pilot user relies on it

**Date:** 2026-07-11
**Status:** Settled (pending implementation). Trigger: before any pilot user's data enters the system.

**Decision.** Rate limiting is enabled with a real cap; a hard Anthropic spend cap is set as a
backstop; and per-pilot-user bearer tokens are issued out-of-band as a right-sized stopgap for
a small invited group. Stronger device-attestation-based auth (App Attest / Play Integrity) is
deferred to the native migration, where it becomes feasible, and is not required to clear this
pilot gate.

**Reasoning.** The proxy currently has rate limiting disabled (`skip: () => true`) and relies
on CORS as its only access control, which does not stop non-browser requests. The proxy URL
and model allowlist are visible in the public repo's bundled client code.

**Related:** PG-04, S-05.

---

## DEC-016: BYO Anthropic key — keep, hardened, at release

**Date:** 2026-07-11
**Status:** Settled (direction and timing). Routing sub-decision Open, parked for S-08.

**Decision.** Keep. It completes the non-custodial architecture (data and compute both free of
lock-in), serves the heaviest users at their own cost, and keeps the app functional independent
of the proxy. Dormant through the pilot: A-02 removes the direct calls now; S-08 hardening
(encrypted at rest, session-only option, warning copy) lands at the release gate. Sub-decision
parked for S-08: proxy-forwarded (retains model allowlist and caps; key transits the stateless
proxy, never stored) versus direct-from-browser (key never touches Insina infrastructure).
Current lean: proxy-forwarded.

**Alternatives rejected.**
- Delete the BYO-key tier. Rejected: it is the compute half of the non-custodial story, and
  removing it makes the app proxy-dependent.

**Related:** A-10, S-08, DEC-018.

---

## DEC-017: Lab data windows for AI — 12-month digest default, 24-month on Advanced

**Date:** 2026-07-11
**Status:** Settled.

**Decision.** Both AI surfaces default to a 12-month per-analyte digest (last 6 values, window
min and max, computed trend line with first, last, direction, and draw count, delta, ranges,
tripwire status), with a 60-day full-resolution window alongside. Advanced mode gets the same
digest at 24 months, included app-side when the question is longitudinal or the patient
toggles it: the app decides inclusion, never the model (non-agentic by design). The trend line
keeps slow declines visible for analytes drawn more often than the listed values; full
per-month anchors remain optional future work. The AI window is a fixed default, independent
of the on-screen Trends toggle.

**Reasoning.** Tab 11 shipped the full lab history per call (cost, attention degradation);
Tab 05 shipped only the latest value per test (trend-blind, defeating the product's flagship
trend detection). One digest fixes both.

**Related:** A-03 (amended), DEC-018.

---

## DEC-018: AI cost policy — input-size levers first, model routing gated

**Date:** 2026-07-11
**Status:** Settled. Cost set applied to specs; A-11 gated.

**Decision.** The primary cost levers are input size and caching, applied now: the 12-month
digest replaces full-history payloads, builders order payloads cache-first (stable sections
lead, volatile trail), MODEL_MAP carries per-surface max_tokens, and document excerpts are
included only when referenced or newly added. Model downgrades are a secondary lever governed
by consequence of error, not task complexity: surfaces that read or interpret clinical values
stay on strong models; note summaries and report annotation are the Haiku candidates. No
reassignment ships until the threshold fixtures and prompt rollout exist to verify behavior
holds (tracked as A-11, deferred).

**Reasoning.** Founder approved cost reductions with standing permission; input-size and
caching levers carry no clinical-behavior risk, while model reassignment does and therefore
waits for the verification instruments.

**Related:** A-11, A-02, A-03, A-09, DEC-016, DEC-017.

---

## DEC-019: Input plausibility guard — two bands, distinct from the tripwire

**Date:** 2026-07-11
**Status:** Settled.

**Decision.** A versioned plausibility layer runs before tripwire evaluation at the same
hooks. Hard band (physiologically impossible, set beyond any recorded human value) blocks
manual save with correction suggestions the patient picks from; nothing auto-corrects. Soft
band (implausible but possible) confirms and saves with one tap and never blocks, because rare
extreme values are exactly what the tripwire exists to catch. Extraction values out of band go
to the RIE Review Queue with the raw extracted text; unit mismatches are their own flag, no
auto-conversion in v1.

**Reasoning.** Manual entry and OCR extraction can produce obvious errors (a systolic of 1138,
a lost decimal). Error-catching and urgency-flagging must not blur: a typo needs a correction
prompt, a real extreme value needs an urgent flag, and confusing the two harms in both
directions.

**Related:** A-12, DEC-013, the RIE flag-don't-fix principle.

---

## DEC-020: Analysis context gathering — bounded at five, one round, emergencies exempt

**Date:** 2026-07-11
**Status:** Settled.

**Decision.** Conversational analysis surfaces may ask up to 5 targeted questions in a single
batched round, only when answers would materially change the analysis; partial answers or a
request to proceed end the gathering; recorded facts are never re-asked; emergency-pattern
symptoms get the emergency response before any questionnaire. One-shot analyses get an
optional launch field injected as {sessionContext}, app-decided, non-agentic. Lab Q&A stays
capped at one question.

**Reasoning.** Good analysis sometimes needs context the record cannot contain. Unbounded
questioning degrades the product and adds cost.

**Related:** A-13, INSINA_AI_PROMPTS v2.3.

---

## DEC-021: UI change plan reconciled against the engineering specs

**Date:** 2026-07-11
**Status:** Settled.

**Decision.** The UI plan is kept as INSINA_UI_CHANGES.md with UI-N IDs and the shared phase
scheme. Reconciliation rulings: UI-6 (tripwire failure) and UI-5 (pseudonymized payloads) are
duplicates deferred to A-01 and P-01/P-03, keeping only their display constraints and approved
wording; UI-13 (replace PIN) is rewritten to defer to P-02, and its authentication/
recovery-reset language is removed as incompatible with the non-custodial encryption model;
UI-3 (lab grouping) is absorbed into A-04, a minimal version of which is pulled into Phase 1;
UI-15 (AI Analysis layout) merges with A-13 and adds the four-section response structure to
the prompt spec (v2.4). All other UI items carried through, reformatted and phase-aligned.

**Reasoning.** A separate UI assessment (~30 items) overlapped the engineering specs at nine
points, including two direct contradictions; one reconciled document prevents divergent
implementations of the same code.

**Related:** INSINA_UI_CHANGES.md, DEC-009 (UI-13 ruling), DEC-013 (UI-6 ruling), A-04, A-13.

---

## DEC-022: Save AI analysis to Notes, with an AI-generated label

**Date:** 2026-07-11
**Status:** Settled.

**Decision.** Approved. Analyses save into Notes as dated entries carrying an explicit
AI-generated label distinguishing them from clinician or patient-authored text, and remain
downloadable as markdown. The labeling requirement resolves the earlier concern; this is no
longer deferred.

**Reasoning.** The UI review approved "Save to My Notes" on the AI Analysis screen; a prior
amendment had deferred saving AI output into the record over a labeling concern. With the
label explicit, AI-generated content entering Notes is distinguishable at a glance and on
export.

**Related:** A-13, UI-15, DEC-021.

---

## DEC-023: Emergency access under full-record encryption — exportable packet, not in-app reduced-auth view

**Date:** 2026-07-11
**Status:** Option A settled; option B Open pending founder decision (OPEN-7).

**Decision.** (Option A, the safe default): emergency information is provided by the
exportable/printable Surface H ED packet the patient keeps outside the app (paper, phone
wallet, lock-screen medical ID). The live encrypted app exposes no no-passphrase view, so the
encryption boundary is not breached. Option B (a patient-designated, lighter-protected in-app
Emergency Card for a chosen subset) is a possible future addition and would require its own
DEC as a deliberate, documented weakening of the boundary. Built to A.

**Reasoning.** UI-13 called for a "limited Emergency Information view," which has no clean
answer once the record is encrypted behind a passphrase (P-02): any reduced-authentication
window into the live app is a hole in the encryption model.

**Related:** DEC-009, UI-13, P-02, Surface H, OPEN-7.

---

## DEC-024: Clinical Safety Core version 1.0 → 1.1 — tripwire evaluation envelope

**Date:** 2026-07-11
**Status:** Settled (shipped in prompt spec v2.1; logged here per §8 change control).

**Decision.** CSC rule 4 now receives tripwire flags inside an evaluation envelope with a
status of current, stale, or unavailable, plus evaluatedAt and newestLabDate. The model may
treat the absence of a flag as meaningful only when the envelope status is current; when stale
or unavailable it must say the app's threshold check has not run against the latest data,
treat flag status as unknown rather than reassuring, and route concerns to the care team.
CSC_VERSION bumps 1.0 → 1.1.

**Reasoning.** Without envelope status, a silent or failed tripwire engine reads to the model
— and therefore to the patient — as a clean bill. A missing check must never masquerade as a
passing one. (This is also the UI-6 ruling: tripwire failure cannot produce false
reassurance.)

**Related:** DEC-013, A-01, INSINA_AI_PROMPTS §3, §6, §8, UI-6.

---

## DEC-025: Prompts-as-code rollout (A-09) — hardcoded clinical facts removed; four surfaces built but not wired

**Date:** 2026-07-12
**Status:** Settled (shipped in code; logged per the master prompt's ground rule 2).

**Decision.** Tab11, Tab05, and Tab10's inline system-prompt strings are replaced by the shared
`src/prompts/` builders (CSC v1.1 + per-surface delta). In the process, every hardcoded
patient-specific clinical fact standing in as a "no data yet" fallback — real diagnoses,
medications, doctors' names, and an entire unconditional NSAID/Tacrolimus/diet/infection-risk
reference block injected for every patient regardless of recorded diagnosis — is deleted, not
carried forward. Tab05's two AI calls also stop sending the patient's real legal name.
Surfaces D (document extraction), E (Vision OCR), F (companion visit summary), and H (report
generation) are built to spec but deliberately not wired into their real candidate call sites,
because each of those call sites has an output contract (a JSON extraction schema feeding
record creation, or a JSON schema feeding `confirmMedChange()`'s med-change pipeline, or a
free-text-only report with no template layer) that the spec's version doesn't match — wiring
them is a data-model or feature redesign, not a prompt swap. Surface G (symptom preparation) has
no consumer at all; no symptom-prep screen exists yet.

**Reasoning.** CSC rule 7 (data fidelity) prohibits presenting fabricated defaults as record
data — a fallback string reading "Tacrolimus (Prograf) 3mg BID" when no medication is actually
on file is exactly the kind of thing rule 7 exists to prevent, regardless of whether it
originated as founder placeholder content. CSC rule 12 (identity) prohibits sending the
patient's legal name; the AI-facing side of Tab05 predated that rule. The condition-specific
safety block (NSAID/Tacrolimus interactions, diet restrictions, infection risks) unconditionally
injected on every request is what A-06's conditionModules mechanism exists to replace with
per-patient, per-condition selection — leaving it hardcoded in the interim would mean every pilot
user, not just a liver-transplant patient, receives founder-specific dietary and drug-interaction
guidance. Ground rule 5 (scope discipline) governs the deferred surfaces: forcing D/E/F/H's real
consumers onto the spec's output contract this item would silently break working extraction and
med-confirmation pipelines outside what A-09 itself specifies.

**Related:** A-09, A-02, A-03, A-06, A-01, P-01, A-05, INSINA_AI_PROMPTS §2, §3, §7, §9.

---

## DEC-026: Tripwire engine v1 default library — universal panic values only, gated unreviewed; "unavailable" extended to cover an unreviewed library

**Date:** 2026-07-12
**Status:** Settled (Greg's decision via AskUserQuestion during A-01; shipped in code).

**Decision.** A-01's spec limits the default threshold library to "analytes with defensible
universal critical bounds" without enumerating them, and separately states the library "sit[s]
behind the same clinical review gate as modules" (INSINA_AI_PROMPTS §6). Rather than have Claude
Code pick the actual numbers unilaterally, Greg was asked directly. Decision: seed v1 with six
genuinely diagnosis-agnostic panic-value analytes only — Potassium, Sodium, Glucose, Hemoglobin,
Platelets, WBC, urgent tier only (no "abnormal" tier, since normal ranges are far less universal
than panic values) — sourced from widely published clinical critical-value conventions, not
authored clinical judgment of this app's own. `src/config/tripwireDefaults.js` ships with
`reviewedBy: null`, gated by the same `mi_allow_unreviewed_modules` flag as
MOD-IMMUNOSUPPRESSION (one "founder preview" toggle, not two) — meaning the urgent tier produces
zero flags for any pilot user, including Greg by default, until he reviews and approves it.
Everything transplant/tacrolimus-specific from the old `urgencyThresholds.js` (Tacrolimus, CMV
PCR, liver/kidney panel "rejection"/"nephrotoxicity" framing, LDL/HbA1c targets) is left out of
v1 entirely — that content is A-01's condition-aware tier (b), deferred (OPEN-10).

A second, related interpretive decision made in the same item: `getTripwireEnvelope()` returns
`status: "unavailable"` — not the spec's literal "current, flags: []" — whenever the default
library is unreviewed (and no provider-custom ranges exist to evaluate instead). The spec's
literal three-state definition ties "unavailable" only to a missing/malformed flag store. Applied
literally, an unreviewed library would still compute as "current" once the engine runs (since it
genuinely did run — it just has nothing eligible to check), and CSC rule 4 treats "current, no
flags" as license to reassure the patient that an unflagged value is fine. That reassurance would
be false: almost nothing was actually checked. Extending "unavailable" to also cover "engine ran,
nothing eligible to evaluate" closes that gap.

**Reasoning.** Ambiguity resolves upward, not into improvisation (CLAUDE.md ground rule 1) —
the specific panic-value numbers are medical-judgment content with real patient-safety stakes
(they gate "call your doctor now" / "seek emergency care" messaging), not an engineering choice
Claude Code should make unilaterally. The unreviewed-library gate mirrors A-06's own precedent
(DEC entries for MOD-IMMUNOSUPPRESSION) rather than inventing a new mechanism. The "unavailable"
extension is the conservative, safety-first reading available within the spec's three-state
model: CSC rule 4 already instructs the model to withhold reassurance and route concerns to the
care team whenever status is anything but current — exactly the behavior wanted while the
library sits unreviewed, and exactly what would NOT happen if "current, flags: []" were reported
instead.

**Related:** A-01, A-06, DEC-025, PILOT_GATE PG-09, INSINA_AI_PROMPTS §6.

---

## DEC-027: Vault encryption (P-02) — Storage-API interception over a store-abstraction rewrite; PIN quick-unlock deferred; migration made idempotent against concurrent invocation

**Date:** 2026-07-12
**Status:** Settled (Greg's decision via AskUserQuestion during P-02; shipped in code).

**Decision.** P-02's spec names `store.js` as an integration point, assuming it is the access layer
for `mi_*` data. It isn't: `store.js` wraps a handful of keys; a grep found 167 direct
`localStorage.getItem/setItem/removeItem("mi_...")` call sites across 25 other files (Tab05, Tab11,
Tab13, Tab14, companionData.js, and more), none going through any shared abstraction. This matches
OPEN-6, which had already flagged "build the storage abstraction layer ahead of encryption" as
unfinished prerequisite work. Rather than either build that abstraction first (a separate,
multi-session undertaking) or ship encryption covering only the fraction of data `store.js` already
wraps, Greg chose: intercept at the Storage API itself. `src/lib/secureStorage.js` monkey-patches
`Storage.prototype.getItem/setItem/removeItem` for `mi_*` keys against an in-memory plaintext cache
(populated by decrypting every ciphertext blob at unlock); all 167 existing call sites keep calling
`localStorage.getItem/setItem` completely unchanged and transparently get plaintext in, ciphertext
out. `src/lib/vault.js` implements the crypto primitives: PBKDF2-SHA256 (600k iterations) deriving a
KEK that wraps a random AES-GCM DEK, with a second independent wrap under a one-time-shown 256-bit
recovery key. `LockScreen.jsx` is rebuilt around passphrase setup/unlock/recovery instead of a PIN.

Two scope decisions made in the same item: (1) spec point 6 allows the old PIN to remain as an
optional in-session "quick-unlock" layered in front of an already-unlocked vault — not built; every
unlock in this pass goes through the real passphrase or recovery key. Tab13's PIN-management UI is
replaced with a passphrase-change UI (`secureStorage.changePassphrase()`, re-wraps the DEK, never
re-encrypts data) rather than left in place, since a working "Change PIN" panel that no longer
gates anything would itself be exactly the false-security pattern this item exists to eliminate.
(2) The old LockScreen's "Forgot PIN → delete all data" destructive reset is replaced by the
recovery-key unlock path; a destructive wipe is offered only as the explicit last resort when both
passphrase and recovery key are lost (per spec point 9: no reset restores access without one of
those two, and cryptographically there is nothing else to offer at that point).

**Bugs found and fixed during implementation** (all caught before touching real data, per Greg's
own instruction to test thoroughly with synthetic data first): (a) an early version of the
migration's resume path derived a *fresh* DEK on retry instead of re-deriving the original from the
already-persisted envelope — a second interrupted-migration attempt would have permanently orphaned
any key already encrypted under the first DEK. Fixed by persisting the envelope before encrypting
any data, so a resume always unwraps the same DEK. (b) the resume/migration loop populated the
in-memory plaintext cache only for freshly-encrypted keys, not for keys skipped because they were
already ciphertext from an earlier partial attempt — leaving them unreadable after a successful
resume despite being correctly encrypted on disk. (c) live browser testing (not caught by the Node
test suite, which calls the module directly) surfaced that `setupVaultAndMigrate()` is reachable
concurrently — observed in practice, most likely React 18 StrictMode's dev-mode double-invoke
behavior — and a genuine race between two concurrent calls was possible. Fixed with an in-flight
promise guard so a second call while one is running returns the first call's result rather than
racing it.

**Reasoning.** Ambiguity resolves upward (CLAUDE.md ground rule 1): the spec's own assumption about
`store.js` didn't match the codebase, and picking between "encrypt everything via a new interception
layer" and "build the abstraction layer first, encryption later" is an architecture-scale call with
real risk (a bug either way risks the patient's actual medical record), not a detail to improvise.
Interception was chosen because it achieves point 5's "all mi_* record stores encrypt" without a
separate, larger refactor first, at the cost of an unusual (though not unprecedented) pattern
instead of the spec's assumed literal architecture. Every fix in the "bugs found" section came from
actually exercising the code — first an adversarial Node test suite designed to simulate exactly the
interrupted-migration and concurrent-call scenarios a real device could hit, then a live browser
walkthrough of setup → migration → recovery-key display → lock → reload → unlock → data-persists —
rather than trusting the crypto logic's correctness from inspection alone.

**Related:** P-02, PILOT_GATE PG-10, OPEN-6 (superseded by this decision for the encryption-access
question specifically; the general storage-abstraction cleanup remains open for its own sake),
DEC-008.

---

---

## DEC-028: A-12/UI-4 full scope — a fifth, previously-undocumented vital-entry surface found and fixed

**Date:** 2026-07-13
**Status:** Settled (Greg's decision via AskUserQuestion: "Full scope now"; shipped in code).

**Decision.** A-12's spec named two vital-save paths in the desktop Vitals tab (Tab06) and two in
the companion app. A survey ahead of implementation found a fifth, undocumented one: `App.jsx`'s
Dashboard "Quick Vitals" modal (`showVitalsModal`/`quickReading`/`handleQuickSave`), reachable from
the Dashboard's "Log Vitals" hot button. It carried the same class of bugs the other four had:
silent carry-forward of the last known value into any blank field (`cf()`'s
`readings.find(r => r[key] != null)?.[key] ?? null` fallback), a free-text "DATE" input with no
picker, no time field, `store.js`'s date-keyed `mergeReadings()` (which keys by `.ts` — a field the
new shared schema doesn't produce, so calling it on a `mkReading()`-shaped object would have
collapsed every reading without a `.ts` into one map entry), and no plausibility check at all.
Fixed under the same "Full scope now" answer already given for A-12: rewired onto
`mkReading`/`saveReading` (`src/lib/vitals.js`), added a real date + optional time picker, and wired
the same hard-block/soft-confirm plausibility gate used everywhere else in this item. `store.js`'s
`mergeReadings()` is left in place for the bulk-import path (Tab09/Tab12 parsed-import merge),
which is out of this item's scope.

Separately, `src/components/Dashboard.jsx` (a standalone file with its own `MANUAL_READINGS`
module-level frozen constant and the crash bugs the spec described — `MANUAL_READINGS[0].weight`
with no guard) was found to be dead code: not imported anywhere. The live dashboard is the inline
one in `App.jsx`, which already read `readings` as live state and already guarded per-field lookups
(`readings.find(r => r.bp_s != null && ...)`) — it did not have the crash bug the spec's brief
description implied; the undocumented Quick Vitals modal did. `components/Dashboard.jsx` was left
untouched (not deleted) — deleting dead files is not what this item specifies, and removing it is
better scoped as its own small cleanup (see OPEN-13).

**Reasoning.** The master prompt's own instruction is to report the delta between spec and reality
rather than patch blind or silently expand scope. This is the same category of bug already in
A-12's granted full scope (silent same-day/blank-field data loss, no plausibility gate) on a
previously unknown surface, not a new item.

**Related:** A-12, DEC-019, UI-4.

---

## DEC-029: A-13/UI-15 implementation — DEC-022 governs Save; Surface G safety gap closed in-item; Tab11 layout redesigned in place

**Date:** 2026-07-13
**Status:** Settled (Greg's decisions via AskUserQuestion during A-13; shipped in code).

**Decision.** Four calls made implementing A-13 + merged UI-15:

1. **Stale spec text vs settled decision on Save.** APP_CHANGES_SPEC's A-13 entry says saving
   analyses into Notes is "future work … not built now," but DEC-022 (Settled, 2026-07-11, same
   day) and INSINA_UI_CHANGES UI-15 both approve "Save to My Notes" with an explicit AI-generated
   label. DEC-022 governs: the analysis overlay's Save writes an `aiGenerated: true` note in
   Tab10's canonical shape, and analyses remain downloadable as dated markdown (type + date
   filename, {lastSync} freshness stamp, Surface H footer).

2. **Surface G was dead code — fixed as part of A-13** (Greg's explicit choice). The companion's
   symptom-prep AI ran on `companionAI.js`'s thin ad-hoc prompt carrying no Clinical Safety Core,
   no tripwire envelope, and no rule-5 emergency routing; `buildSurfaceG()` existed but was never
   called anywhere. A-13's "Surface G inherits the same context-gathering block" could not be true
   without fixing this. Now: a symptom handoff ("Ask Insina about this") tags the AI session as
   symptom prep, and the whole session runs on `buildSymptomPrepSystem()` — the full Surface G
   builder with the spec's payload (recent symptoms, active conditions, medications, care team,
   tripwire envelope). The companion's *generic* chat still runs on the lightweight
   `buildRecordSystem()` prompt, because no spec surface covers generic companion chat — inventing
   one would be improvisation; logged as OPEN-15 instead.

3. **UI-15 redesigns Tab11's main screen in place** (Greg's explicit choice), not a separate new
   screen: Quick Prompts and the context panel (renamed "Data used in this analysis") collapse;
   the mode bar gains a Change action (routes to Settings & Backup, where mode/consent is actually
   managed) and drops the raw model-id chip; per-message badges/footers say Standard/Advanced
   without model names; assistant messages carry timestamps and an "Open as report" control into
   the shared full-screen `AnalysisOverlay` (modal, not window.open — its Print uses a print
   stylesheet scoped to the overlay, satisfying the popup-blocker/PWA requirement).

4. **Tab05's silent Full-Analysis auto-save to Notes is removed**, replaced by the overlay's
   explicit, labeled Save button. The auto-save wrote a flat-`content` note shape that crashed
   Tab10's editor on open (`note.sections.map` of undefined); Tab11's save-to-Notes had a sibling
   bug (`heading` vs the `header` field Tab10 reads). Both writers now use one shared
   `mkAnalysisNote()`, and Tab10 normalizes the legacy shapes read-time so existing broken notes
   open instead of crashing.

**Bug found and fixed in passing:** Tab11's `buildDataSections()` formatted vitals from field
names nothing ever writes (`systolic`/`pulse`/`spo2` instead of the schema's `bp_s`/`hr`/`o2`), so
BP, HR, and O2 silently never reached Surface A's VITALS HISTORY section; and `sendMessage`
referenced an undefined `model` variable in its audit-log call, throwing inside the success path
and overwriting every completed streamed answer with "Error: model is not defined." Both corrected.

**Related:** A-13, UI-15, DEC-020, DEC-022, INSINA_AI_PROMPTS v2.3/v2.4, OPEN-15.

---

## DEC-030: A-04 minimal — canonical grouping is a reversible name map, not a record rewrite

**Date:** 2026-07-13
**Status:** Settled.

**Decision.** Lab test-name canonicalization is implemented as one new module,
`src/lib/labCanonical.js`, exposing `canonicalLabId(name)` — the single source of truth for
"same analyte across facilities." Two layers: a seed synonym table (the union of the three
alias tables that already existed but never fed grouping — tripwire.js's inline `ALIASES`,
plausibilityBounds' `LAB_ALIASES`, medDictionary's `LAB_SYNONYMS`), and a patient-confirmed
`mi_lab_name_map` (`{ normalized source name → canonical display name }`). Every grouping site now
keys on `canonicalLabId`: the digest (`labDigest.js`), Tab05's dedupe / detail history / print,
custom-range lookup, and tripwire evaluation's dedupe. The RIE `checkLabs` synonym nag also uses
it and stops firing once a grouping is confirmed.

Three UI-3 requirements drove the shape:

1. **Non-destructive / source-preserving.** The pre-existing "Duplicate Lab Names" merge
   *rewrote* `lab.name` in place, losing the original string, was irreversible, and wrote a
   `mi_lab_canonical` map nothing ever read. That is replaced: confirming a group writes only the
   name map; `mi_labs` records keep their original names forever. `displayLabName()` applies the
   chosen canonical label at render time only.
2. **Reversible.** Because records are never rewritten, "Ungroup" simply removes the mapping and
   the original names reappear — no data reconstruction needed.
3. **Manual grouping + asks before grouping.** The Group Tests panel is always available (not
   only when auto-candidates exist): it lists confirmed groups with Ungroup, offers a
   multi-select "group these arbitrary names" affordance, and still surfaces auto-detected
   candidates (seed-synonym or noise-stripped collisions) for one-tap confirmation. Nothing groups
   without the patient's action (flag, don't fix).

**Flag badge (UI-3, other half).** Ordinary out-of-range values get a compact amber "FLAGGED"
badge in the routine lab list. Amber is deliberate: the urgent tripwire banner and the detail
"OUT OF RANGE" pill both already use red, so an ordinary flag must not read as urgent. The
badge/dot/value amber (`#f59e0b`) matches the existing out-of-range dot color.

**Scope.** The seeded-synonym *richness* (a large clinical alias library) and the full
canonical-ID digest upgrade stay Phase 2 per the spec's A-04 split; this is the minimal slice the
A-03 digest and multi-facility pilot data need. `mi_lab_name_map` is added to the backup/restore
key list and syncs to Drive with the rest of the `mi_*` record.

**Related:** A-04, UI-3, A-03, A-01 (tripwire dedupe now shares this canonicalization).

---

## DEC-032: P-02 data-remanence bug — "Erase & Start Fresh" left encrypted health blobs on disk

**Date:** 2026-07-13
**Status:** Settled (bug fix, found by live verification).

**Decision / fix.** `secureStorage.js`'s patched `Storage.prototype.removeItem` only forwarded a
managed-key deletion to real storage when the vault was *unlocked*
(`if (dek !== null) nativeRemove(key)`). But the destructive reset,
`LockScreen.handleWipe()`, runs entirely from the lock screen — i.e. while locked — so every
`removeItem("mi_…")` it issued cleared only the in-memory cache (empty while locked) and left the
actual encrypted blob on disk. The reset removed only the *exempt* keys (`mi_vault`,
`mi_schema_version`); all managed ciphertext (`mi_labs`, `mi_meds_full`, `mi_rie_audit`,
`mi_tripwire_flags`, …) survived, orphaned and undecryptable but physically present. A user who
chose "erase everything" (P-02 spec point 9 / DEC-027 — the only path left when both passphrase and
recovery key are lost) would still have all their encrypted PHI sitting in localStorage.

Fix: `removeItem` now always calls `nativeRemove(key)` for managed keys regardless of lock state —
deletion never needs the DEK (you are erasing, not decrypting), so gating it on being unlocked was
the defect.

**How found.** Live browser verification (this is precisely the class of bug the Node suite missed,
because it calls the module directly rather than exercising the lock-screen reset): clicking "Erase
& Start Fresh" on a locked vault left `mi_vault` and the managed blobs in place, and the app
returned to the unlock screen on reload instead of the first-run setup. Confirmed fixed both by a
new Node regression test (managed keys cleared by a locked wipe) and live (`removeItem` loop while
locked now empties every `mi_` key).

**Related:** P-02, DEC-027, PG-10.

---

## DEC-031: UI-1 Foundation split — mechanical slice done now, sweeping visual work deferred to live verification

**Date:** 2026-07-13
**Status:** Settled (Greg's decision via AskUserQuestion).

**Decision.** The UI-1 Foundation set (UI-10 shared shell, UI-8 typography/contrast tokens, UI-11
labels, UI-14 semantic icons, UI-9 collapsible nav) is almost entirely *visual*, and its
done-when lines are visual acceptance tests ("readable without zoom," "no competing global nav,"
"one consistent icon"). The dev app is currently locked behind the P-02 vault passphrase, so none
of it can be live-verified this session. A survey also showed UI-10 is a high-risk ~15-file
structural rewrite (the four standalone tabs — Medications/Labs/Vitals/Symptoms — each re-implement
the entire sidebar/topbar/NAV inline, and App.jsx runs a dual standalone-vs-shell render path)
that everything else sits on.

Rather than rewrite 15 files blind, Greg chose to ship only the mechanical, reason-verifiable
slice now and defer the sweeping visual work until the vault can be unlocked for in-browser
verification:

- **Done now:** UI-11 nav-label standardization (Health Profile / Medical Records / Source
  Documents / My Notes, applied in the shared sidebar, the four duplicated standalone-tab NAVs,
  and Search); dead-file deletion (OPEN-13 — Dashboard.jsx + Sidebar.jsx, both unimported); and
  the UI-14 *Print* half (a shared `PrinterIcon`/`PrintLabel`, adopting one consistent printer
  icon + visible "Print" label across every print button, replacing the `⎙`/`🖨`/`✦` mix).
- **Deferred to a vault-unlocked session (part of OPEN-14 verification):** UI-10 shell
  consolidation, UI-8 body-size increases (11→15px) across hundreds of inline styles, UI-9
  collapsible Today/My Health/Records & Tools nav with direct Emergency access, and the rest of
  UI-14's icon-family unification (nav glyphs, emoji hot-buttons). Also unresolved: the
  "Export & Backup" vs "App Settings" label split, which needs a new tab, not a relabel.

**Related:** UI-10, UI-8, UI-11, UI-14, UI-9, OPEN-13, OPEN-14.

---

## DEC-033: UI-1 Foundation visual work — scope shipped, choices made

**Date:** 2026-07-14
**Status:** Settled (shipped; live-verified against the real record in the dev pane).

**Decision.** The DEC-031-deferred visual half of the UI-1 Foundation shipped in five commits
(UI-8 tokens, UI-10 shared sidebar, UI-9 grouped nav + a follow-up fix, UI-14 icons). The
judgment calls, each the minimal reading of its spec item:

1. **UI-8 is "establish and adopt in the shell," not a whole-app sweep.** `src/index.css` now
   defines the tokens (surface/text/accent custom properties, font stacks, 15px body/nav,
   13px floor, 44px touch targets) and the shared shell classes consume them. The hundreds of
   9–11px inline literals inside tab content bodies are adopted progressively as later UI items
   touch each module — sweeping them blind was the risk DEC-031 deferred in the first place.
   Google Fonts load once from index.html; the identical @import in 16 files is gone.
2. **UI-10 is sidebar consolidation, not a full shell rewrite.** The five byte-identical
   sidebar/NAV copies (App.jsx + the four standalone tabs) became one `AppSidebar.jsx`. The
   standalone tabs keep owning their own layout and topbar — those are module headers, not a
   competing global nav, so the done-when holds without restructuring App.jsx's dual render
   path.
3. **UI-9 group assignment:** Today = Dashboard, Appointments; My Health = Health Profile,
   Conditions, Surgeries, Medications, Labs & Trends, Vitals, Symptoms, Care Plan/Team;
   Records & Tools = Medical Records, Source Documents, My Notes, AI Analysis, Import Records,
   Settings & Backup. Collapse state persists in a plain non-vault key (`insina_nav_collapsed`
   — a mi_* key would be encrypted and unreadable while locked); the active screen's group
   force-expands; Emergency Information is pinned below the groups on every screen and opens
   the printable packet (DEC-023 model), whose builder moved to `src/lib/printEmergency.js`.
4. **UI-14: emoji are gone from routine controls; the nav's geometric-glyph family stays.**
   The spec bans emoji in primary nav and routine controls — the nav glyphs (⬡◯◈…) are a
   uniform non-emoji family already, so replacing them was not required; the actual emoji
   (dashboard hot buttons, backup banner, Clear All, pins, the print buttons earlier) are now
   one shared stroke-SVG family in `icons.jsx`.

**Related:** UI-8, UI-9, UI-10, UI-14, DEC-031, DEC-023.

---

## DEC-034: Companion vault gate — PIN quick-unlock ships; passphrase stays the root secret

**Status:** Settled (Greg picked PIN quick-unlock, 2026-07-16)

**Problem.** P-02's storage interception is installed unconditionally (main.jsx), but only the
web app had an unlock surface (LockScreen). The companion rendered with the vault locked:
every mi_* read returned null and every capture was silently dropped by the interception —
while the UI showed "✓ Reading saved." Silent data loss on the exact surface meant to be the
primary capture point. APP_CHANGES_SPEC P-02 never mentioned the companion; DEC-027 had
explicitly deferred PIN quick-unlock.

**Decision.** The companion gates behind `screens/Lock.jsx` before anything renders or syncs:

1. **PIN quick-unlock** (Greg's pick over passphrase-every-open): the full password is entered
   once on the device, then a 4–8 digit PIN wraps the SAME DEK under a PIN-derived KEK
   (PBKDF2-SHA256, same 600k iterations, fresh salt — all reused from vault.js; no new crypto).
   The envelope lives in `mi_pin_wrap` (EXEMPT key, same storage class as mi_vault).
2. **Attempt limit as the online defense:** 5 wrong PINs deletes the PIN envelope entirely —
   password required, then a new PIN can be set. Honest threat model: a short PIN cannot resist
   an offline brute force by someone who copies device storage; that protection remains the
   password envelope plus the phone's own device lock. The PIN adds convenience without
   becoming a second root secret.
3. **Fresh-device setup on the phone:** no vault → create password (8+ chars) → one-time
   recovery-key display with explicit "I've saved it" gate → optional PIN. Runs the same
   `setupVaultAndMigrate()` as the web, so legacy plaintext on the device migrates, not orphans.
4. **Post-unlock:** `runMigrations()` (mirrors LockScreen.afterUnlock), then an immediate Drive
   re-sync — the mount-time sync ran against a locked store and its merge writes were dropped.

**Verified live** (throwaway vault, dev preview): setup → recovery key → PIN → capture persists
as `{v:1,iv,data}` ciphertext at rest; reload → PIN gate; wrong PIN decrements ("4 attempts
left"); correct PIN restores the record intact.

**Deferred:** inactivity auto-lock on the companion (web has autoLock; phone relies on the
device lock screen for now), and Face ID/biometric unlock (WebAuthn) as a later convenience
layer on the same envelope pattern.

**Related:** P-02, DEC-027, PG-10.

---

## DEC-035: Landing at root, app moves to /app/, companion unchanged; root SW kill-switch

**Status:** Settled and shipped (v1.27.0, 2026-07-19)

**Problem.** The production app lived at the domain root (`insinahealth.com/`). A public marketing
landing page needs that root, and the app needs a stable path of its own so linking to it (Sign In,
the demo, task-engine deep links) doesn't collide with the landing's routing.

**Decision.** Static landing (`landing/`) publishes to the root; the full app moves to `/app/`
(new Vite build target, `scripts/build.mjs`, with its own `base: '/app/'`); the mobile companion
stays at `/companion/`, untouched. `localStorage` is origin-scoped, so the existing vault is
unaffected by the path move — same-origin, different path. A root-scope service-worker
**kill-switch** ships at the old `/sw.js` path: any browser still holding the old root-scoped
worker fetches this file on its next check, which immediately unregisters itself and forces a
re-fetch from the new root (the landing page), so stale cached app shells don't get stuck serving
from `/`. `/app/` and `/companion/` each register their own scoped worker independently.

**Related:** commit `67345db`, v1.27.0 CHANGELOG entry, DEC-036/037 (the demo-isolation decisions
that build on this same path split).

---

## DEC-036: The 2026-07-19 incident — the demo wiped a real record; root cause and the fix line

**Status:** Settled and shipped (v1.27.1 → v1.28.0 → v1.32.1, 2026-07-19/20)

**What happened.** Greg's real, encrypted record on `insinahealth.com/app/` was wiped by the
public demo loader. Root cause: `loadDemoData()` / the standalone `/demo/` seeder called
`localStorage.clear()` **unconditionally** before seeding the fictional dataset — with no check
for an existing real vault. The demo had just been linked from the new landing page's "Open Demo"
button, and the browser that hit it was serving a **cached pre-guard copy** of the demo (the SW
hadn't yet retired the stale asset), so even the first guard attempt didn't run. Recovered from a
local `insina-backup-pre-encryption-*.json` safety-net file (not from Drive — see DEC-037's
finding on why Drive alone couldn't restore).

**Decision — layered fix, each landing as its own release:**
1. **v1.27.1 (immediate hotfix):** every demo loader (`/demo/`, `/demo-review/`, in-app
   `loadDemoData()`) never calls `localStorage.clear()` again and refuses to run outright when
   any real record is present (an encrypted vault, a non-demo PIN, or real health-data keys).
2. **v1.28.0:** closed the *reverse* leak — a user who explores the demo then creates a real vault
   previously carried the demo data forward into their new encryption. Added an unambiguous
   `mi_is_demo` marker (safer than reusing the PIN hash, since a real user could legitimately pick
   PIN 1234) and clear demo data before `setupVaultAndMigrate()` runs.
3. **v1.32.1:** discovered the demo had actually been broken (silently, showing "Encrypt your
   health record" instead of the demo) since P-02 shipped encryption, because the storage
   interception and the lock screen both applied unconditionally. Added
   `secureStorage.isDemoMode()` — true only when the demo marker is set **and no vault exists** —
   to skip interception/lock/auto-lock/onboarding for demo installs. `hasVault()` always wins;
   verified live in both directions (real vault + a forged demo marker still locks; no vault +
   marker opens straight to the dashboard with data rendering).
4. **DEC-037 (#49):** the demo was later moved to its own origin entirely, making this whole class
   of bug structurally impossible regardless of what the code does.

**Related:** DEC-037 (Drive gap), DEC-038 (demo origin isolation), FINDINGS_SEC_02 (confirmed the
`isDemoMode()` gate is correctly bypass-proof against a real vault).

---

## DEC-037: Drive backup now carries the wrapped key-envelope — closes the "Drive can't actually restore you" gap

**Status:** Settled and shipped (v1.28.0, 2026-07-19; crypto-proven via `scripts/testVaultRestore.mjs`)

**Problem — exposed by the DEC-036 incident.** Greg's real record lived in his Google Drive backup
the whole time, but when his device was wiped, **Drive alone could not recover it.** P-02's
envelope model wraps a random 256-bit DEK under a passphrase-derived KEK; `driveSync.js`
deliberately uploaded ciphertext data but **excluded the envelope itself** (`mi_vault` was
never part of the backup payload). So a wiped/new device had the locked data but no way to
re-derive the key that opens it — "your data lives in your Drive" was not true in a recoverable
sense. Greg was saved only by an unrelated local pre-encryption backup file, not by Drive.

**Decision.** `collectLocalCiphertext()` now includes `_vaultEnvelope` (the wrapped-DEK
envelope) in every Drive upload. A new `restoreFromDrive()` rebuilds a wiped/new device from
that backup **without needing the DEK**: it writes the envelope + every ciphertext blob to
localStorage while still locked, then the caller reloads and unlocks normally with the existing
passphrase or recovery key (either one re-derives the same DEK from the restored envelope). A
backup with no envelope (pre-fix, or genuinely missing) restores nothing rather than stranding
undecryptable blobs. "Restore from Google Drive" was added to both the desktop lock screen (on
the setup/no-vault view) and the companion's first-run screen.

**Threat-model tradeoff, accepted.** Carrying the envelope in Drive means an attacker who gets the
Drive backup can attempt an **offline** passphrase brute-force (previously they'd have had only
undecryptable ciphertext with no envelope to attack). Mitigated by PBKDF2-SHA256 at 600,000
iterations and a 256-bit random recovery key; this is the standard "encrypted vault synced to the
cloud" pattern (1Password, Bitwarden, etc. all make the same tradeoff) and is what makes
cross-device recovery possible at all. Flagged for disclosure-accuracy review (FINDINGS_SEC_02,
F-11) — the "your data never leaves in a usable form" story now depends on passphrase strength,
not on the envelope being physically absent from the cloud copy.

**Verified:** a standalone crypto test (`npm run test:vault-restore`, 5/5 passing) proves the
envelope-carried key reconstructs and decrypts on a fresh device via both the passphrase and the
recovery key, and that a wrong passphrase is still rejected. Verified live end-to-end the same
night: desktop pushed a fresh Drive backup, phone companion ran "Restore from Google Drive," and
Greg's real data appeared correctly on the phone.

**Resolves OPEN-12** (see below) — a second real device (the phone) has now been exercised
against a live Drive backup produced by this code, with real data, not just unit tests.

**Related:** DEC-036 (the incident that exposed this), OPEN-12.

---

## DEC-038: Demo isolation — dedicated subdomain, separate origin, separate storage (#49)

**Status:** Settled and shipped (v1.32.0/v1.32.1, 2026-07-20)

**Problem.** DEC-036's in-app guards (never clear, refuse when a real record exists) stop the demo
from *executing* a wipe, but the demo still shared an origin — and therefore `localStorage` — with
the real app. Defense in depth, not a structural fix; a future code change or another stale-cache
scenario could reopen the same class of bug.

**Decision.** The demo now runs on its own origin, `demo.insinahealth.com` (a second GitHub repo +
Pages site, `npm run build:demo` producing a dedicated build with the demo seeder at the root and
the app at `/app/` — no duplicate copy of the marketing landing or the companion). Because browser
storage is strictly per-origin, the demo **cannot** see, overwrite, or clear a real record no
matter what the code does — the isolation is enforced by the browser, not by application logic.
The landing's "Open Demo" buttons point at `https://demo.insinahealth.com/`. The in-app guards
(DEC-036) remain as defense in depth on the isolated origin too.

**Verified live:** demo origin resolves over HTTPS with a valid Let's Encrypt cert; opening the
demo and then opening `insinahealth.com/app/` in the same browser leaves the real record
untouched (confirmed by Greg directly: "Demo looks good, and my history is intact").

**Related:** DEC-036, DEC-037, `docs/DEMO_SUBDOMAIN_SETUP.md`.

---

## DEC-039: Tripwire advisory copy — proactive contact, never advise waiting for the coordinator callback (provisional pending clinical review)

**Status:** Settled for pilot prep, **subject to revision on formal clinical review** (2026-07-20)

**Problem.** Greg's transplant coordinator reliably calls same-day or next-day after labs are
drawn — a workflow the deterministic advisory templates (INSINA_AI_PROMPTS §9, verbatim/
snapshot-tested) didn't explicitly address. Question: should a TODAY-tier advisory on an imported
(staged) lab tell the patient to wait for that expected callback, or contact the coordinator
proactively regardless?

**Decision (Greg, Option A).** Keep the shipped copy exactly as written: always proactive contact,
never "wait and see if they call." Reasoning: the TODAY band already represents a near-critical
value (e.g. potassium 6.2, platelets 30) where a redundant call costs the coordinator ninety
seconds but a missed/delayed callback (wrong number on file, result landing Friday at 5pm,
coordinator out) costs real time on a value that matters. The staged-import template's existing
clause — "If you have not already discussed this result with your care team, contact them now" —
already covers centers with a fast callback workflow: it only pushes action when the callback
*didn't* already happen.

**Explicitly provisional.** Both the band thresholds and this copy decision are marked DRAFT /
REVIEW-REQUIRED pending formal clinical review before/during the pilot, which may revise either.
Any resulting change ships as a deliberate template-version bump (`ADVISORY_TEMPLATES_VERSION`
1.0.0 → 1.1.0+, snapshot tests updated on purpose) — never a silent wording edit. Advisory firing
stays behind `TRIPWIRE_ADVISORY_ENABLED = false` regardless.

**Related:** A-01/PG-09, the tripwire threshold review artifact
(`https://claude.ai/code/artifact/16648614-9f0f-4eb7-b99e-1c391f8248e1`), `src/data/advisoryTemplates.js`.

---

## DEC-040: Folder Backup — the no-Google backup channel is a user-chosen folder, encrypted-payload-only, not a second cloud integration

**Status:** Settled and shipped (v1.38.0, 2026-07-21)

**Problem.** Drive is the only automatic backup/sync channel, which leaves two user segments
uncovered: people with no Google account, and people who deliberately won't use Google — a real
segment for a privacy-first product. Options considered: (a) manual file export only (shipped,
but easy to neglect — the eviction-exposed segment), (b) File System Access API folder backups,
(c) native Dropbox/OneDrive/WebDAV OAuth integrations, (d) Insina-hosted encrypted storage.

**Decision (Greg, Option b).** Ship folder backup via the File System Access API: the user picks
a folder once; Insina writes dated encrypted backup files there (rolling 4, mirroring the Drive
weekly window). Pointing the folder at a Dropbox/OneDrive/iCloud-synced directory yields
automatic off-device backup on the user's own cloud with **zero new OAuth integrations** and no
change to the non-custodial story. (c) is deferred — each provider is a real integration plus
threat-model review; iCloud has no usable web API anyway. (d) is off the table without its own
DEC: even ciphertext-only hosting changes "we never hold your record," which is load-bearing in
the landing copy and legal drafts.

**Constraints that are part of the decision, not implementation detail:**
1. **Encrypted payload only.** The folder file comes from the same `collectLocalCiphertext()`
   as a Drive backup (ciphertext + wrapped key-envelope). Never `collectLocalData()` — the
   chosen folder may sync to a third-party cloud, and plaintext PHI there would silently undo
   P-02 point 7. (The human-readable plaintext export remains a deliberate, separate action.)
2. **Encrypted restores go through the raw-import path only** (`restoreFromBackupObject`, the
   #50 primitive). Writing ciphertext through the patched `setItem` while unlocked
   double-encrypts and corrupts — a latent bug this work also fixed in Tab13's file import.
3. **Two refusal guards on file restore:** an envelope-less file restores nothing (stranded
   ciphertext), and a file whose envelope differs from the device's live vault is refused
   (restoring it would lock the user out; its blobs wouldn't decrypt locally anyway).
4. Chromium-desktop-only surface, feature-detected; Safari/Firefox users keep manual export
   (positioned as "save it into your own cloud folder"). Silent weekly folder backups run only
   while the browser still grants the folder permission; otherwise the existing reminder banner
   returns with a one-click re-auth path.

**Related:** DEC-037 (envelope in backups — what makes these files disaster-recovery-grade),
P-02 point 7, `src/lib/folderBackup.js`, `scripts/testVaultRestore.mjs` (20 cases).

---

## DEC-041: Care-team questions — one open-ended umbrella question per topic, with a required "Why you're asking" education section

**Status:** Settled and shipped (v1.39.0, 2026-07-21 work order Part 1)

**Decision (Greg, work order).** Care-team question generation is restricted to one open-ended
umbrella question per topic (a topic = a clinical change or discrepancy, not each downstream
implication). Questions never name a specific test to order, level to recheck, dose to adjust,
or timing to change — prohibited shapes include "Should we recheck my [drug] level" and
"Do we need to adjust timing or dose"; the permitted shape is "[What changed] since my last
visit. Is there anything we need to do differently?" Reconciliation questions ("which of these
am I supposed to be taking") are exempt: clarification, not direction. Settled education topics
for the patient's long-term conditions are excluded from the question list unless the record
shows an active problem — but may appear in the new, **required** "Why you're asking" section
as stated facts with an "Ask your physician if you'd like more information" pointer. Education
items state the clinical fact **without mechanism** and never predict or suggest physician
actions. Numeric limit/dose queries follow the existing record-cite-or-defer posture (now
regression-covered). The contact routing paragraph is retained unchanged.

**Rationale (from the work order).** Physician-directed specificity reads as the patient — and
therefore Insina — directing care; it damages physician receptivity and drifts toward directing
clinical action. Questions open the door; education equips the patient to walk through it.

**Placement.** Prompt-layer, NOT Clinical Safety Core: a shared QUESTION GENERATION / WHY
YOU'RE ASKING / NUMERIC LIMITS block in `src/prompts/core.js`, composed via `assembleSystem`
onto every surface that produces care-team questions — A (Tab11), B1/B2 (Tab05), C (Tab10),
G (companion symptom prep), H (report annotation), and Tab14's Consultation Prep (whose bare
pre-A-09 prompt gets the block appended; its full builder migration remains the known gap
documented in `surfaceH.js`). PROMPT_VERSION bumped to X-1.1 on A/B/C/G/H; spec doc updated
(INSINA_AI_PROMPTS.md v2.5). Deterministic regression: `scripts/testQuestionRules.mjs`
(49 cases — block on every surface, omeprazole prohibited/permitted shapes, Tylenol
record-cite-or-defer, doc↔code parity).

**Explicitly NOT changed:** CSC rule 11's example phrasing (`Suggested question for your care
team: "Should we...?"`) now **diverges** from these rules. CSC edits are gated (§8 change
control; same handling as the pending rule 10 rewording) — the divergence is flagged here and
in the spec doc for a future deliberate CSC version bump, and the test suite asserts CSC v1.1
is byte-unchanged.

---

## DEC-042: AI Analysis becomes multi-turn conversation sessions with an explicit End & Save Report

**Status:** Settled and shipped (v1.40.0, 2026-07-21 work order Part 2)

**Decision (Greg, work order).** The AI Analysis tab (Tab11) runs as explicit conversation
sessions: "New Conversation" is the primary, prominent action; each session is a persistent
chat thread; "End & Save Report" is always visible while a session is open and closes it by
generating one discussion report for the whole session. An open session survives tab
navigation and app restarts (localStorage); on return, a banner offers Resume / End & save
report / Discard. **Context per turn = patient record + current session turns only.** Saved
prior conversations shown in the tab are archive UI only and are never included in API
context; session context clears on End & Save or explicit discard. Rationale: cost control
(payload compounding), quality (stale conversations contaminate current analysis), and
boundary integrity (the report captures exactly what the AI saw). Anything durable belongs in
the patient record, not chat history.

**Report format (no AI summary step).** Header (session date/time); the raw transcript of
every turn **verbatim as displayed** (each turn timestamped; assistant turns pass through the
same deterministic F-03 output filter the screen applied — the report shows exactly what the
patient saw); "Questions for your care team" and "Why you're asking" consolidated and
deduplicated across turns **deterministically** (client-side section extraction + normalized
dedup — no model call, so no synthesis step where wording or hedges could drift); a single
contact-routing block at the end, rendered from the care-team record. The report saves to My
Notes with the AI-generated label (DEC-022) and opens in the AnalysisOverlay.

**Consultation Prep is unchanged** as a one-shot document (its question output follows
DEC-041). The existing per-conversation Transcript/Summary print buttons remain as separate
conveniences.

**Finding — daily question limit:** the work order asked to verify the believed 10/day limit;
**no such limit exists anywhere in the codebase** (the only throttles are the proxy's 60/hr/IP
chat and 20/hr/IP extract caps). Nothing was invented: whether to add a true daily turn cap was
recorded as OPEN-17(a). **Resolved 2026-07-21 (Greg): 15 questions per day per user**, shipped
v1.41.0 — enforced client-side per conversation turn in Tab11 (`src/lib/dailyQuestionLimit.js`):
successful sends only (a rejected request or cold-start failure never consumes quota, so Retry
can't double-charge), local-midnight reset, visible "N of 15 left today" counter, Send disabled
at zero. Fail-open on corrupted state — the proxy's hourly caps remain the hard backstop.

---

## DEC-043: Tripwire advisory — external-review disposition (nine engineering/wording items now; thresholds and symptom-gating to the clinical-review packet)

**Status:** Settled and shipped flag-OFF (v1.42.0, 2026-07-21). Threshold decisions remain DRAFT.

**Provenance.** ChatGPT reviewed the deterministic table and patient wording (architecture A,
thresholds C+, wording B−); Claude reconciled the review against the actual implementation
(several claims corrected: diastolic <50 was already TODAY; the audit log already carried
table/template versions and dismissal semantics; A-12 already confirms extreme manual entries;
stale/undated imports were already badge-only). Greg authorized the nine non-clinical items.
External-model clinical citations are treated as unverified inputs per the intake rules —
they shape the packet, they are not sign-off.

**Shipped now (all inert behind `TRIPWIRE_ADVISORY_ENABLED = false`):**
1. **Band fall-through gaps closed** (table v1.1.0-draft): low-side TODAY bands get exclusive
   uppers at the next clinical boundary (K 3.0, Na 130, glucose 70, Hgb 8.0, platelets 50;
   SpO2 [88,92); HR [40,50)). Previously a hemoglobin of 7.95 fired NOTHING. Strictly
   sensitivity-increasing; no previously-firing value changes tier. Boundary battery + exact-
   critical-value pins added (exact bound = TODAY stays the convention — matrix question Q-G1).
2. **Audit log** gains `readingId` + `verification` (patient-entered / unverified-import /
   patient-verified / patient-rejected), wired from every call site.
3. **Verify-first for staged imports:** an in-window staged hit now renders "The imported value
   appears to be… Verify it against the original report now" FIRST; the EMERGENCY/TODAY
   workflow fires only after the patient confirms ("The value is wrong" logs a rejection and
   routes back to Import Review). Consistent with CL-025's flag-don't-fix and "AI proposes,
   patient disposes"; does not alter DEC-039's proactive-contact ruling.
4. **Templates v1.1.0:** "meets Insina Health's emergency/same-day alert threshold" replaces
   "safe range"/"emergency range" (the app states its threshold fired; it does not certify a
   range as safe); per-metric symptom sentences replace the generic four-symptom line (lab
   sentences mirror the A-01 guidance clauses; vital sentences are NEW DRAFTS pending review);
   the no-coordinator fallback routes transplant-line-then-ED instead of "urgent care clinic";
   emergency wording adds do-not-drive-yourself transportation guidance.
5. **Context-rich alerts:** value carries its unit, staged values carry the result date, and a
   meta line states source + verification status. Table version stays internal (log only).
6. **"Mark care team contacted — self-reported"** button, separate from dismissal, own
   timestamp, explicitly user-reported; dismissal continues to mean only "warning closed."
7. **Separation asserted:** the advisory pipeline never reads patient/provider display ranges —
   now a standing test, not an implicit property. (Provider-set individualized urgency ranges
   remain DEC-005/OPEN-4 future work layered on top.)
8. **CLINICAL_REVIEW_MATRIX.md** created: every threshold, boundary-inclusivity ruling,
   value-only-vs-symptom-gated question, wording string, and deferred item as sign-off
   checkboxes for a licensed transplant clinician.
9. **AI-originated-urgency language sweep:** no in-repo document or product copy describes AI
   urgency (only historical/decision records quoting the rejected language, and the rule
   banning it). The remaining offender is the external overview/marketing copy — OPEN-1,
   needs-attorney, unchanged.

**Explicitly deferred to the combined clinical(+legal) review:** ADA-style hypoglycemia
treatment steps (care direction — DEC-001/device line, needs-attorney), symptom-gated
EMERGENCY classification, the low-temperature bound, a lower high-glucose same-day cutoff,
repeat-reading protocols, SpO2 baseline display, hemolysis metadata.

**Related:** DEC-002/003 (deterministic urgency), DEC-026 (library gating), DEC-039
(proactive contact, provisional copy), CL-025, `scripts/testAdvisory.mjs` (77 cases).

---

## DEC-044: Clinical-reviewer credential bar — a licensed clinician (physician, NP, or PA) is sufficient for the threshold matrix; NP review authorized

**Status:** Settled (Greg, 2026-07-21)

**Question.** Who may sign CLINICAL_REVIEW_MATRIX.md? The external review (DEC-043 provenance)
recommended "a licensed transplant clinician"; the project's own documents (DEC-026, PG-09,
INSINA_AI_PROMPTS §8) require licensed clinical review with a recorded `reviewed_by` but never
specify the credential — setting the bar is Greg's Bucket 1 call.

**Decision.** A licensed clinician — physician, nurse practitioner, or physician assistant — is
sufficient. Greg's NP will perform the review. Rationale: (1) the v1 table is deliberately
diagnosis-agnostic panic values (DEC-026) — standard critical-value bounds any experienced
licensed clinician is competent to adjudicate — plus wording and boundary-semantics questions;
(2) this is content review for informational software, not clinical practice on a patient — the
review requirement is self-imposed risk management (PG-09), so the credential bar is Insina's to
set; (3) the review is versioned and upgradeable — a specialist co-signature can be added before
any scale beyond the pilot.

**The one transplant-flavored number is independently sourced.** The 100.4°F fever trigger is
confirmed against the patient's own transplant program reference manual (Greg, 2026-07-21) — no
separate transplant-team concurrence required. The matrix records this provenance on the
temperature row.

**Scope (added 2026-07-22, Greg):** the approval instrument is **product-level, not
patient-specific** — the reviewer approves the thresholds and wording for Insina Health's
intended adult user population, so the same sign-off carries into production/multi-user use.
The matrix and handout were generalized accordingly (no patient-specific framing in the
approval; the fever-trigger provenance cites transplant-program reference guidance rather than
an individual's chart; per-patient provider-set ranges remain the DEC-005 layer on top).

**Boundaries.** MOD-IMMUNOSUPPRESSION (the condition module) is a separate, genuinely
transplant-specific review item — NOT covered by this decision; it keeps its own gate. The
"does reviewer credential matter for our liability posture?" question rides with the attorney
pass (OPEN-5) — cheap to ask, and its answer can upgrade this bar later without reopening it
here. The review handout (`Insina Health — Clinical Review Packet.docx`) is generated from the
matrix and lives outside the repo (`*.docx` is gitignored per S-01); the in-repo
CLINICAL_REVIEW_MATRIX.md remains the source of truth the signed paper copy is transcribed
back into.

**Related:** DEC-026, DEC-039, DEC-043, PG-09, CLINICAL_REVIEW_MATRIX.md.

---

## DEC-045: The public demo tells the truth about AI being off, and ships a saved example instead

**Status:** Settled and shipped (v1.46.1, 2026-08-08)

**Problem.** `demo.insinahealth.com` is deliberately excluded from the proxy's CORS allowlist so a
public page can never spend the AI budget (AUDIT_SEC_02 **F-12**, accepted as security-positive).
The consequence was worse than "AI doesn't work." A browser reports a blocked cross-origin request
as `TypeError: Failed to fetch` — indistinguishable, client-side, from a network failure — and every
surface's error handling maps that to a Render cold start. So the demo told visitors
**"Server is waking up… click Retry when ready."** Advice that can never come true, on the tab a
first-time viewer is most likely to open, followed by a Retry button that fails identically forever.
F-12 called graceful copy "optional future polish"; it is not optional when the fallback actively
misleads.

**Decision.** Gate at the choke point, not per surface. `isDemoMode()` short-circuits inside
`aiClient.js` — the one module every AI call already goes through (A-02/PG-08) — so no future
surface can be added that misses the gate and inherits the fake cold-start again.

1. **403, deliberately not 503.** 503 is the cold-start code several surfaces map to "server waking
   up," which is precisely the wrong message. The response body carries `{error, demo: true}` so a
   surface can render demo-specific copy without string-matching.
2. **The demo never reaches the network at all.** The short-circuit returns a synthetic `Response`
   before `fetch`, so the budget protection no longer depends on the CORS allowlist alone —
   allowlist and client gate are now independent controls.
3. **Show the output, don't just describe it.** The demo ships a saved example analysis pinned in
   My Notes, written in the DEC-041/042 report format against the demo patient's own values. A
   viewer sees what the AI actually produces without a single API call. The Tab11 notice points
   there by name.

**Also seeded, because the demo was hollow where it mattered.** Verified live: `mi_pharmacies`,
`mi_diagnostics`, `mi_emergency_contacts` and `mi_notes` were all empty while meds/labs/conditions
were full. That silently broke the two newest features as demo material — the v1.46.0 pharmacy card
had nothing to show, and the v1.45.0 deterministic search ("when was my last cervical MRI") returned
nothing, since imaging lives in `mi_diagnostics`. Pharmacy names were chosen to match the pharmacy
strings already on the demo medication records, so the two views corroborate rather than contradict.

**Gotcha this work uncovered — the demo dataset exists in two places.** `src/demoData.js` (used by
the app's in-place demo toggle) and an inlined `DEMO` object in `public/demo/index.html` (the
standalone seeder that `demo.insinahealth.com` actually runs). **Editing one does not affect the
other.** Both were updated here. Unifying them is real work — the seeder must run before the app
boots and cannot import a module from the app bundle — and is logged as intake rather than done
inline, but any future demo-data change must touch both files until it is.

**Amendment — version-aware re-seeding (v1.46.2, 2026-08-09).** A claim in the original entry
needs correcting: the seeder was thought to leave returning visitors on stale data. It does not —
it rewrites every `DEMO` key on every visit, verified live. (The 0/0/0/0 reading that suggested
otherwise was GitHub Pages CDN lag on the just-pushed root HTML, checked seconds after the push.)

The real defect is narrower and worse. Keys created by **using** the demo are not in `DEMO`, so a
plain overwrite never clears them. Deleting an appointment writes a tombstone to
`mi_record_tombstones` (v1.44.0 deletion memory, working as designed); the next visit rewrites
`mi_appointments` fresh, but the surviving tombstone filters that record straight back out —
permanently, on that device. `mi_lab_name_map`, `mi_dismissed_alerts`, the RIE audit and the
`insina_ai_*` family drift the same way. The demo degrades the more it is used, and the person
most exposed is whoever demos it repeatedly on one laptop.

**Decision.** The seeder carries `DEMO_DATASET_VERSION`. A stored version mismatch triggers a full
demo reset — every `mi_*` and `insina_*` key removed, then the dataset written fresh — instead of
an overwrite. `?reset=1` forces it on demand. The version is deliberately **not** `package.json`'s:
tying them would force a reset on every unrelated release, including mid-demo.

**Why this is safe in the one file that has wiped a live record (2026-07-19).** The bulk delete —
the only one in the codebase — sits strictly inside the branch the pre-existing guard has already
cleared (vault present, or health data without `mi_is_demo`, still returns before any of this). It
re-checks for a vault immediately before deleting and throws rather than deletes if one appears, is
scoped to the app's own key prefixes, and `clear()` is still never called. `?reset=1` grants no new
power: a device holding a real record is refused exactly as before. The version is stamped **last**,
so a throw mid-seed leaves it stale and the next visit retries rather than assuming success.
`scripts/testDemoSeeder.mjs` executes the real inline script in a `vm` sandbox (39 cases) — the
seeder previously had no test coverage of any kind, being plain inline HTML with no import graph.

**Amendment — the companion joins the demo (v1.46.3, 2026-08-09).** The demo had no phone
experience at all, for two unrelated reasons. `build-demo.mjs` built only the web app, so
`/companion/` was a 404. And `CompanionApp` gated purely on `isUnlocked()`, so even with the demo
record seeded on that origin it demanded a password. The allowance was never in doubt —
`isDemoMode()`'s docstring has said "skip the encryption interception **and the lock screen**"
since P-02 — the web app implemented its half in `App.jsx` and the companion simply never did.

**Decision.** Build the companion into the demo, and let it take the same
`isUnlocked() || isDemoMode()` path the web app takes. The Google sign-in wall is skipped in demo
mode too: it is the immediate next gate, with no account to connect and nothing to sync.

**The cold-entry problem, and why a redirect is involved.** Nothing links to the companion — you
reach it by typing the URL — so a visitor can arrive at `/companion/` having never run the seeder
at `/`. Empty storage means `isDemoMode()` is false and they meet the password screen anyway, so
honouring demo mode alone would not have been enough. The demo build injects a guard into its
companion HTML that bounces such a visitor to `/?next=companion`; the seeder honours that
parameter and hands back to the phone UI. Constraints that are part of the decision: an
unrecognised `?next` falls back to the app (never an open redirect), the guard tests `mi_vault`
first so a real record is untouched, and the injection happens in the demo build only — the
production companion never carries it, asserted against `dist/` after every build.

**Safety.** `hasVault()` still wins everywhere. Verified live: with a vault planted, the companion
renders "Unlock your record" and no record content appears; without one, the demo opens directly.
The `?next=companion` hand-off refuses just as the seeder does when a vault is present.

**Related:** AUDIT_SEC_02 F-12 (OPEN-16), DEC-041/042 (the report format the example follows),
DEC-038/#49 (demo origin isolation), P-02 (the vault gate this deliberately bypasses for demos
only), `src/lib/aiClient.js`, `src/components/companion/CompanionApp.jsx`,
`scripts/build-demo.mjs`, `scripts/testDemoSeeder.mjs`.

---

## DEC-046: AI reports carry forward into Consultation Prep by explicit patient marking

**Status:** Settled and shipped (v1.47.0, 2026-08-11)

**Problem (Greg, from use).** A symptom analysis recommended raising specific points with three
specialists — and Consultation Prep could not see any of it. The prep prompt reads conditions,
meds, and keyword-matched documents, but never `mi_notes`, where every AI analysis is saved. The
app produced advice, then forgot it at exactly the moment it mattered. (Distinct from DEC-042,
which deliberately keeps saved conversations out of AI context; this gap was never decided,
just never built — the Surface H / OPEN-9 scope note territory.)

**Decision (Greg): explicit marking, not search.** When a report is generated and saved, the
patient marks it for the care-team members it concerns; Consultation Prep for a matching
appointment carries the marked report into its prompt. Chosen over prep-time notes search
because it is deterministic (no fuzzy matching deciding what the AI sees), bounded (only what
was marked rides along), and consistent with the house principle — the analysis proposes, the
patient disposes.

**Mechanism.**
1. **Marking:** after Save to Notes (AnalysisOverlay; Tab11's session report passes its note id
   through), a picker lists the care team with the members the report text mentions
   **pre-checked** — deterministic last-name + distinctive-specialty matching
   (`suggestPrepTargets`; "hepatologist" matches a Hepatology member via y-stemming; generic
   words like "transplant"/"medicine" are stoplisted so they never suggest anyone). Nothing
   persists until the patient applies. Any AI note can be marked or retargeted later in Tab10.
2. **Storage:** `prepTargets` on the note (id + name/specialty snapshot per member), inside
   `mi_notes` — so encrypted at rest, backed up, tombstoned for free.
3. **Prep side (Tab14):** marked reports matching the appointment — provider resolved through
   the shared `matchCareTeamMember` scorer, specialty fallback — are listed **before**
   generating, each with an exclude toggle (the Tab11 "Data used" transparency pattern), capped
   at the 3 newest with the overflow counted visibly. Included reports enter the prompt as
   S-07 document blocks (3,000-char visible truncation) under an instruction to carry findings
   and questions forward rather than re-derive. **With nothing marked the prompt is
   byte-identical to pre-DEC-046** — pinned by test.
4. **Lifecycle (Greg):** a mark means "for my next visit with this doctor." Completing the
   appointment clears the matching targets (both completion paths route through Tab14's
   `handleSave`); marks for other doctors on the same note survive. Manual unmark anytime.

**Merge-layer change this required.** `_mergeArrays` is local-first-wins by record id, which
silently discards field *edits* arriving from the other device — a mark made on the laptop
would never reach the phone's copy, and the phone's next upload would put the unmarked copy
back on Drive. The union now prefers the copy with the **newer numeric `updatedAt`** when both
sides carry one; `setPrepTargets`/clears stamp it. Double-gated: no store stamped `updatedAt`
before this, so nothing else changes behavior — verified by a merge test asserting unstamped
records keep local-first-wins.

**Scope (Greg):** web Consultation Prep only; the logic lives in `src/lib/prepMarks.js`
precisely so the companion's visit prep can adopt it as a follow-on without duplication.

**Related:** DEC-041 (question rules, still governing prep output), DEC-042 (explicitly NOT
reopened), DEC-022 (AI-generated labeling), S-07 (document delimiting), OPEN-9 / Surface H
(the prep surface's full builder migration remains open), `scripts/testPrepMarks.mjs`
(37 cases).

---

## Open items (spawned by the decisions above)

- **OPEN-1** (priority): Bring the Insina overview and any marketing copy in line with DEC-001.
  Current overview language ("generates urgent alerts ... with specific action guidance,"
  "requiring immediate action," "critically sub-therapeutic") describes the directive version of
  the product and reads as marketing an uncleared device. Needs attorney eyes.
  *2026-07-21 (DEC-043 item 9): in-repo sweep confirms NO repository document or shipped product
  copy describes AI-originated urgency — the landing page and all specs carry the deterministic
  framing; the only hits are decision records quoting the rejected language and the §8 rule
  banning it. What remains open here is exactly the EXTERNAL overview/marketing copy.*
- **OPEN-2:** Naming and copy pass against California AB 489 (effective 2026-01-01), which
  prohibits AI systems from using terms or design elements implying the AI holds a healthcare
  license. Review module names and voice.
- **OPEN-3:** Build the emergency threshold table and the firing copy (DEC-003), starting with
  tacrolimus at both ends. Deterministic code path, not model-generated.
- **OPEN-4:** Implement the provider-set range schema with attributed, dated provenance (DEC-005).
- **OPEN-5:** Engage an FDA regulatory attorney on the intended-use question for the AI module,
  and on where the red-flag versus interpretation line sits for transplant-specific labs, before
  commercializing the AI module.
- **OPEN-6:** Build the storage abstraction layer (a unified read/write interface over localStorage
  and Drive) ahead of encryption, per DEC-008 part 3. Bucket 2 design, then Claude Code. This is the
  contained-change enabler; it is worth doing before launch pressure, not during it. **Partially
  addressed by DEC-027:** P-02 shipped encryption without this layer, via Storage-API interception
  instead — the "encrypt everything" need this item named is met. The general cleanup case (one
  real API instead of 167 scattered direct-localStorage call sites, easier future maintenance) is
  still open on its own merits.
- **OPEN-7:** Emergency Card option B (a patient-designated, lighter-protected in-app subset:
  transplant status, allergies, meds, emergency contacts). A deliberate, documented weakening of the
  P-02 encryption boundary; requires its own DEC before any build. Pending founder decision.
  (Spawned by DEC-023.)
- **OPEN-8** (DECISION for Greg, from S-06): Repository visibility — public vs private. Context:
  no PHI is in the repository (re-verified 2026-07-11: the only personal-data matches in tracked
  files are the public GitHub username in deploy URLs and one cosmetic form placeholder,
  "e.g. Sarah Butler", noted for the Phase 1 de-personalization pass), but the AI prompts and
  clinical configuration are world-readable in a public repo, and GitHub Pages also deploys from
  private repos on paid plans. Either outcome is fine; it must be a recorded choice, not a
  default. Neither Claude Code nor anyone else picks this — Greg answers, then this becomes a
  DEC entry.
- **OPEN-9:** Wire Surfaces D (extraction), E (Vision OCR), F (companion visit summary), and H
  (report generation) into their real consumers once the larger changes DEC-025 named for each are
  done: D/E need Tab09/Tab12/proxy-OCR's extraction schemas reconciled with the spec's schema
  (data-model change across multiple tabs); F needs `visitCapture.js`'s `summarizeVisit()` JSON
  contract reconciled with F's markdown-narrative spec, or the module split into a JSON variant;
  H needs Tab14's Consultation Prep rebuilt around a deterministic template with annotation-only
  AI fields, per its own spec section. Surface G (symptom prep) needs a consumer screen built
  before it has anything to wire into. (Spawned by DEC-025.)
- **OPEN-10:** Clinical review of `src/config/tripwireDefaults.js`'s v1 default library (six
  universal panic-value analytes), and condition-aware tier (b) thresholds for transplant/
  tacrolimus-specific analytes (Tacrolimus itself, CMV PCR, liver/kidney panel, LDL/HbA1c) per
  A-01's "optional condition-aware defaults activated by condition modules." Until reviewed, the
  urgent tier produces zero flags for any user. (Spawned by DEC-026.)
- **OPEN-11:** Build the optional PIN "quick-unlock" convenience layer P-02 spec point 6 allows
  (front an already-unlocked vault with a lighter re-entry for brief screen-privacy locks, distinct
  from the real auto-lock timeout which must clear the DEK and require the passphrase). Needs
  design for how it interacts with the existing single inactivity-timeout `lock()` path in
  `App.jsx`, which today always does a full DEK-clearing lock. (Spawned by DEC-027.)
- **OPEN-12 (largely resolved 2026-07-20 by DEC-037):** Drive-sync-side multi-device key handling
  was unverified beyond unit tests. Now: `restoreFromDrive()` ships (v1.28.0), the envelope rides
  along in the Drive backup, and a second real device (Greg's phone, via the companion's "Restore
  from Google Drive") was exercised live against a real Drive backup with real data — confirmed
  working. Still open: no automated/repeatable multi-device test exists beyond that one manual
  verification; a concurrent-edit/merge-conflict scenario across two live devices remains
  untested. (Spawned by DEC-027; resolved-in-part by DEC-037.)
- **OPEN-13:** ~~`src/components/Dashboard.jsx` is dead code~~ RESOLVED (UI-1 track cleanup): both
  `Dashboard.jsx` and the likewise-unimported `Sidebar.jsx` were confirmed dead (the live
  dashboard and sidebar are inline in `App.jsx`) and deleted. (Spawned by DEC-028.)
- **OPEN-14 (largely resolved 2026-07-14):** the live in-browser pass ran against a throwaway
  test vault Greg unlocked. Verified live: A-12 Dashboard Quick Vitals (date/time pickers, hard
  gate on systolic 1138 with correction suggestion and no bypass, suggestion-apply saving with a
  correctly recomputed flag, cross-field soft gate with one-tap Save Anyway, two same-day
  readings stored separately); A-04 (FK506+Tacrolimus grouped to one row/trend series, amber
  FLAGGED badge, Group Tests modal with manual grouping, confirm writing only mi_lab_name_map —
  source records untouched — and Ungroup restoring the original presentation, RIE synonym nag
  clearing on confirmation); A-13/UI-15 Tab11 layout (compact mode bar + Change, no model-id
  chip, collapsible Quick Prompts / Data-used panels, bottom composer) and Tab05's
  sessionContext launch field; UI-11 labels; UI-14 printer icon. The pass also caught and fixed
  four real bugs (DEC-032 data remanence; pre-existing LAB_CATEGORIES crash; A-12 stale flag
  after suggestion-apply; A-04 orphaned labKey crash). 2026-07-15 update: a second full pass ran
  against a restored copy of Greg's COMPLETE real record (45 mi_* keys — 875 labs, 46 records,
  2 insurance cards, pseudonym id, dismissed-findings state). Verified live against real data:
  the A-12 migration (16/16 real readings normalized post-unlock), the U1 shell/nav (UI-9 groups,
  UI-8 sizing, pinned Emergency access), and all nine U2 items (UI-16 chart band + point reveals,
  UI-18/25 Care Team, UI-19 source labels + working source-doc link, UI-20 modes + history,
  UI-21 page split with demo controls hidden, UI-22 severity scale "Moderate · 5/10", UI-24
  search + real dates, UI-23 preflight). Restoring the real backup surfaced and fixed two more
  restore bugs (string-value double-encoding; the allowlist dropping mi_records/mi_cards/
  dismissed state — now every mi_* key restores except vault/security state). Still not
  live-exercised: flows needing a real AI response (AnalysisOverlay end-to-end, context
  gathering) and the companion surfaces. (Spawned by DEC-028; extended by DEC-029.)
- **OPEN-15:** The companion's *generic* AI chat (AILite sessions not started from a symptom
  handoff) still runs on `companionAI.js`'s lightweight `buildRecordSystem()` prompt, which
  carries no Clinical Safety Core, tripwire envelope, or rule-5 emergency routing text. No
  INSINA_AI_PROMPTS surface covers generic companion chat, so A-13 did not invent one; the spec
  needs either a new surface definition or an explicit decision that Surface A's (or G's) rules
  extend to it. Until then this is the one remaining AI surface outside the prompts-as-code
  architecture. (Spawned by DEC-029.)
- **OPEN-16:** AUDIT_SEC_02 (read-only re-audit, 2026-07-20) found 1 High, 5 Med, 9 Low/Info —
  no Criticals; all six prior hardening fixes (V-01..V-06) held. Findings await Greg's triage
  before any change order (`FINDINGS_SEC_02.md`, uncommitted per the work order — disposable, not
  a repo artifact). Top three by risk: **(1)** `src/lib/printEmergency.js` builds the Emergency
  Card via `document.write` interpolating patient/OCR-derived fields — including this weekend's
  new `codeStatus`/`advanceDirective`/`implantedDevices` free-text fields — with **no HTML
  escaping** (unlike its sibling `printMedicationList.js`, which correctly escapes); reintroduces
  the exact XSS class S-02/PG-02 closed elsewhere. **(2)** No post-generation AI output filter
  (AI-09) — prohibited-directive scanning (e.g. dose-change language) relies entirely on the
  system-prompt instruction with no deterministic backstop; deterministic *urgency* is separately
  handled by the tripwire engine. **(3)** The onboarding staging queue's "meds/allergies/
  conditions need per-item confirmation, only labs may bulk-accept" rule is enforced only by a UI
  gate + `CONFIRMATION_MATRIX` config flag (`onboardingConfig.js`), not inside the commit function
  `confirmItemToRecord` itself — holds today, but one config edit or one future bulk-calling
  caller away from silently bypassing a clinical-safety invariant. Also flagged: the "never
  transmitted to any third party" disclosure language is inaccurate as written — the egress trace
  found the ICD-10 lookup puts the typed condition string in a URL to NLM, and Maps/MedlinePlus
  links leak a med/facility name on click (see OPEN-1/OPEN-2's disclosure-accuracy thread).
  **Remediation (2026-07-21, v1.36.0–v1.37.7, "fix all of them"):** all code-touchable findings
  fixed and committed — F-01 Emergency Card escaping, F-02 proxy `trust proxy`, F-03 AI output
  filter (AI-09), F-04 onboarding bulk-accept write-layer guard, F-05 de-brand generated docs,
  F-06 test-fixture real name, F-07 stale CSP origin, F-08 landing CSP + externalized scripts,
  F-09 dormant `/extract` fetch removed, F-10 `.env.production` made explicitly-tracked, F-13
  proxy no longer echoes the upstream error body, F-14 migration audit records the error type not
  the message. **Accepted-risk / documented, no code change:** **F-11** — the #50 Drive backup
  now carries the wrapped key-envelope, so an attacker holding the Drive backup can attempt an
  *offline* passphrase brute-force (previously they had only undecryptable ciphertext); accepted
  as the standard "encrypted vault in the cloud" tradeoff, gated by PBKDF2-SHA256 @600k + a
  256-bit random recovery key — the "never leaves in a usable form" story now depends on
  passphrase strength, not envelope absence (see DEC-037). **F-12** — `demo.insinahealth.com` is
  deliberately excluded from the proxy CORS allowlist so the public demo cannot spend the AI
  budget; security-positive. *CLOSED 2026-08-08 (v1.46.1, DEC-045): the "optional future polish"
  turned out not to be optional — the blocked request surfaced as `Failed to fetch`, which every
  surface reads as a Render cold start, so the demo told visitors "Server is waking up… click
  Retry," which could never come true. `isDemoMode()` now short-circuits in `aiClient.js` with a
  403 (not 503) before the fetch, and the demo ships a saved example analysis in My Notes. The
  CORS exclusion stands and is now one of two independent controls, not the only one.*
  **F-15** — the RIE audit log intentionally stores actual flagged values
  (not field-names-only) because the audit's purpose is to show exactly what changed; N-05's
  "values not stored" expectation is consciously not met, mitigated by `mi_rie_audit` being a
  managed key encrypted at rest (P-02), never logged, never sent to the proxy. **F-09 open
  decision (deferred to Greg):** when a real onboarding-extraction proxy route is designed, wire
  it through `aiClient` (single auth point), not a per-surface fetch. **F-05 open decision:** the
  disclosure-language accuracy thread (OPEN-1/OPEN-2) is unchanged by this pass.
- **OPEN-17 (spawned by DEC-042, 2026-07-21):** Two items from the conversation-sessions work.
  **(a) Daily question limit — RESOLVED 2026-07-21 (Greg): 15/day per user**, shipped v1.41.0
  (`src/lib/dailyQuestionLimit.js`, per-turn enforcement in Tab11, successful sends only,
  local-midnight reset, visible counter; see the DEC-042 finding paragraph for detail). **(b) Unencrypted AI chat storage:** Tab11's local family — `insina_ai_messages`
  (full chat threads with clinical content), `insina_ai_session`, `insina_ai_mode`,
  `insina_ai_log` — uses the `insina_` prefix, not `mi_`, so it sits OUTSIDE the P-02 vault:
  plaintext at rest and absent from Drive/folder backups (which walk managed `mi_*` keys only).
  Pre-existing, widened slightly by sessions persisting across restarts. Candidate fix: migrate
  the family to `mi_`-prefixed keys (encrypted + backed up) with an A-08-style rename migration.
  Session REPORTS are unaffected — they save into `mi_notes`, which is encrypted and backed up.

---

## DEC-047: Object stores adopt newer-edit-wins in the Drive merge (DEC-046 extended)

**Status:** Settled and shipped (v1.48.1, 2026-08-13)

**Problem (Greg, from use).** Editing or clearing a field on the Health Profile reverted "the
next time I open the app" — the same reported symptom as the old Appointments/Medications
resurrections, but a different mechanism. Those were ARRAY stores fixed by tombstones (deletes)
and DEC-046 stamps (edits). The profile's Personal Info and Insurance are OBJECT stores, and
`mergeIntoLocal`'s object rule was a shallow merge, `{ ...local, ...drive }`: the Drive copy won
every conflicting scalar field and re-supplied any field the patient had cleared. Every app-open
sync therefore un-did profile edits until the local upload happened to run first — a race the
patient always eventually loses.

**Decision.** Extend DEC-046's opt-in rule to object stores: when BOTH copies of an object store
carry a numeric `updatedAt`, the newer OBJECT replaces the older wholesale. Unstamped objects
keep the legacy shallow merge byte-for-byte — nothing else changes behavior. Stamping happens at
the store setters (`setProfilePersonal` / `setProfileInsurance`), covering every caller,
including future ones; onboarding's direct Tier-0 write stamps too so it never strips the stamp.
The profile's per-item array saves (care team, allergies, contacts, pharmacies, cards) now stamp
the SAVED item only, opting item edits into the existing DEC-046 array rule; their deletes were
already tombstoned.

**Why wholesale replacement, not field-level merge.** Field deletion is the case that matters: a
cleared field is ABSENT from the newer object, and any field-union scheme would resurrect it —
the exact reported bug. The trade-off (two devices editing DIFFERENT profile fields in the same
sync gap: newer save wins, the other device's edit is lost) is accepted deliberately — the same
trade DEC-046 made for array records, on a store edited rarely and almost always from one device.
Field-level timestamps were rejected as complexity without a driving case.

**Pinned by test** (`npm run test:profile-sync`): both-stamped newer-drive wins wholesale;
both-stamped newer-local survives the boot merge (the reported bug); a cleared field stays
cleared through a merge against a stale copy; unstamped objects keep the legacy shallow merge
unchanged; structural checks that the setters and all five per-item saves stamp.

## DEC-048: The demo replays pre-generated, real AI prep reports (DEC-045 refined)

**Status: Settled** (founder-directed, 2026-08-19)

A demo visitor clicking Generate on Consultation Prep now sees a brief
generating pause and then a full prep report — savable and printable — for any
of the seeded appointments. The reports are REAL Insina AI output (Standard
tier), generated once against the demo dataset through the production proxy
and baked into the bundle (`src/config/demoPrepReports.js`, keyed by the
seeder's stable appointment ids).

DEC-045's principle — the demo tells the truth about AI being off — is
refined, not reversed: live AI remains off on the demo origin (aiClient's
demo short-circuit is untouched), every sample ends with an "About this
sample" section stating it was pre-generated from the demo record, and
visitor-created appointments (which have no sample) keep the standard
AI-off explanation. The demo now *shows* what the AI produces instead of
only describing it.

Regeneration duty: any change to the demo dataset's conditions, medications,
or appointments regenerates the samples (see the header of
demoPrepReports.js). Pinned by `npm run test:demo-seeder`: full appointment
coverage, substantial content, honesty tail present, replay gated to demo
mode only.

## DEC-049: Accessibility baseline is a hard rule

**Status:** Settled (accepted by Greg as written from the usability DEC drafts, 2026-09-06)

**Source.** `docs/DEC_DRAFT_USABILITY_2026-09-06.md`, entry DEC-TBD-01, from the
2026-09-05/06 usability review session. Merged verbatim; the draft file keeps the original
text for the record.

**Decision.** All patient-facing surfaces meet WCAG 2.2 AA. This rule has the same weight as
the em dash rule and the disclosure accuracy rule: a surface that fails it does not ship.

**Specifics.**
- Text contrast 4.5:1 minimum against its actual background; 3:1 for large text (24px regular
  or 19px bold and above) and for UI component boundaries.
- Body text floor 14px on mobile, 13px on desktop. Labels and figures floor 12px. No text below
  12px anywhere.
- Every interactive element is at least 44 by 44 CSS pixels.
- Every interactive element has a visible focus state.
- Icons never carry meaning alone; every icon in navigation or actions has a text label or an
  accessible name.
- Color never carries meaning alone; a flag state has a shape or word as well as a color.

**Enforcement.** Automated check (axe or equivalent) in the build; a failing AA check blocks
the PR. Manual contrast audit on any new token.

**Rationale.** The target population skews older, rural, on phones, with hepatic
encephalopathy, tacrolimus tremor, and eye disease in the risk profile. The prior token set had
section labels at 1.5:1 and meta text at 2.1:1.

**Related:** DEC-050 (token amendment), UI-8 (`src/index.css` token ladder, existing floor
`--fs-min` 13px), DEC-TBD-03 and DEC-TBD-04 (theme policy and text size control, still drafts
in the same file), WO_ACCESSIBLE_TOKENS_01 (the mechanical pass this entry unblocks).

## DEC-050: Accessible token amendment to the locked design system

**Status:** Settled (accepted by Greg as written from the usability DEC drafts, 2026-09-06)

**Source.** `docs/DEC_DRAFT_USABILITY_2026-09-06.md`, entry DEC-TBD-02. Merged verbatim.

**Decision.** The design system remains locked (DM Serif Display, Sora, DM Mono, dark navy,
accent blue). The following text tokens are amended. Measured against `--bg-card` #0b1220.

| Token | Old | Ratio | New | Ratio |
|---|---|---|---|---|
| text-faint | #1e3550 | 1.5 | #7a97b6 | 6.2 |
| text-ghost | #2d4d6a | 2.1 | #8aa6c2 | 7.4 |
| text-dim | #3d5a7a | 2.6 | #8fabc7 | 7.9 |
| accent-blue (text use) | #4f8ef7 | 5.8 | #6ea3ff | 7.4 |
| danger (text use) | #ef4444 | 5.0 | #f87171 | 6.8 |
| success (text use) | #10b981 | 7.4 | #2dd4a0 | 9.8 |
| border | #0d1a28 / #111e30 | under 1.5 | #1c2a40 | 3.1 vs card |

text-primary, text-secondary, text-muted, warning, and the background tokens are unchanged.
The old accent #4F8EF7 remains the brand accent for logos, marks, and external materials; the
amended value is for text and interactive states inside the app.

**Rationale.** Keeps hue family and brand recognition; clears AA with margin so future tints do
not fall back under.

**Implementation note (added at merge, 2026-09-06; measured from the code, not part of the
accepted text).** The Old column names the design-system spec's tokens (INSINA_UI_FORMAT_SPEC:
`--dim` #3d5a7a, `--ghost` #2d4d6a, `--faint` #1e3550; `docs/ONBOARDING_SPEC.md` restates
them). The shipped code differs: `src/index.css` defines `--text-dim` as #8299ad and has no
faint or ghost token; #1e3550 and #2d4d6a do not occur anywhere in `src/`; #3d5a7a occurs twice
(PasswordInput.jsx). The dim greys the components actually use are inline literals #4a5c6a
(56 occurrences) and #6a8090 (58), which the table does not list. The accent, danger, success,
and border values in the table do match the code (#4f8ef7 in 30 files, #ef4444 in 25, #10b981
in 27, #0d1a28 and #111e30 in 23 each). The token work order must therefore map the code's real
literals to the amended values and record that mapping; the light theme (`.theme-light`) is
outside this entry and waits on DEC-TBD-03.

**Related:** DEC-049, UI-8, DEC-TBD-03 (draft), WO_ACCESSIBLE_TOKENS_01.

## DEC-051: Dashboard structure

**Status:** Settled (accepted by Greg as written from the usability DEC drafts, 2026-09-07)

**Source.** `docs/DEC_DRAFT_USABILITY_2026-09-06.md`, entry DEC-TBD-05. Merged verbatim; cross-references to other drafts are renumbered to their merged IDs.

**Decision.** The dashboard follows a feed structure rather than a status snapshot. Top to bottom:
1. Greeting, with an attention count on the left and "Last updated" on the right.
2. Emergency strip (conditional, see DEC-054).
3. Five quick action tiles: Log vitals, Medications (refill count badge), Appointments (count badge, next 14 days), Symptoms, Reports.
4. One column, "Your updates" (DEC-052), capped at 720px wide.
5. Current vitals: blood pressure, weight, temperature only, with a link to all vitals and trends.
6. Right rail: Who to call (DEC-055), Insina AI panel with preset questions.

Removed from the dashboard: the nine-card vitals row, the full care team, lab flags with no attached action, the Emergency card tile (reachable via the top-bar Emergency button, the sidebar, and Reports).

**Rationale.** MyChart's home page pattern: things that happened or need a response, each with one button. Reduces the page from roughly 40 competing elements to under 20.

**Related:** DEC-052 to DEC-057, DEC-049, WO_DASHBOARD_FEED_01 (`docs/WO_DASHBOARD_FEED_01.md`).

## DEC-052: Feed eligibility and ordering

**Status:** Settled (accepted by Greg as written from the usability DEC drafts, 2026-09-07)

**Source.** `docs/DEC_DRAFT_USABILITY_2026-09-06.md`, entry DEC-TBD-06. Merged verbatim; cross-references to other drafts are renumbered to their merged IDs.

**Decision.** "Your updates" contains only:
- Tripwire flags (advisory tier; emergency tier also triggers DEC-054).
- Imports waiting for review in the archive tier.
- Results with at least one out-of-range value.
- Appointments and refills with a date within the display window.

It does not contain passive events (backups, in-range results, vitals logged); those go to the bell (DEC-053).

Ordering is fixed: flags, then pending reviews, then out-of-range results, then dated items by date. Five items show, then "View all." Needs-attention items are visually distinct (amber) and the header badge counts only those.

**Rationale.** A flag must never sit visually equal to "backed up to Google Drive." One rule, applied everywhere, is easier to test with patients than three columns.

**Implementation note (added at merge, 2026-09-07; measured from the code).** Two deterministic layers exist. `src/lib/tripwire.js` evaluates labs against the threshold library and emits flags with `level` "urgent" or "abnormal" and a stable id embedding analyte, date, and value; its urgent tier is gated off until the default library is clinically reviewed (DEC-026). `src/lib/advisoryEngine.js` evaluates entered or extracted values against the advisory table and emits `tier` EMERGENCY or TODAY, gated by `TRIPWIRE_ADVISORY_ENABLED = false` (DEC-039, DEC-043). "Advisory tier" here maps to TODAY and "emergency tier" to EMERGENCY; in production neither emits today, so the feed's flag section is exercised by fixtures until the clinical review lands.

**Related:** DEC-051, DEC-053, DEC-054, DEC-026, DEC-039, DEC-043.

## DEC-053: Acknowledge versus dismiss

**Status:** Settled (accepted by Greg as written from the usability DEC drafts, 2026-09-07)

**Source.** `docs/DEC_DRAFT_USABILITY_2026-09-06.md`, entry DEC-TBD-07. Merged verbatim; cross-references to other drafts are renumbered to their merged IDs.

**Decision.**
- Tripwire flags cannot be dismissed. They offer one action and an Acknowledge button. Acknowledging records the timestamp in the patient's record and removes the card from the feed. The underlying condition is re-evaluated by the tripwire engine on its own schedule and may re-flag.
- Pending reviews and out-of-range results can be dismissed from the feed; the underlying item remains in its tab unchanged. Dismissing is not confirming.
- Dated items can be dismissed from the feed; the appointment or refill itself is unaffected.
- Passive events live behind a bell icon with a count and never appear in the feed.

**Rationale.** Deterministic layer owns urgency. Dismissal is a display preference; acknowledgment is a record event.

**Related:** DEC-052, DEC-002 (the deterministic layer owns urgency), DEC-012 (flag, do not fix).

## DEC-054: Emergency tier escalation on the dashboard

**Status:** Settled (accepted by Greg as written from the usability DEC drafts, 2026-09-07)

**Source.** `docs/DEC_DRAFT_USABILITY_2026-09-06.md`, entry DEC-TBD-08. Merged verbatim; cross-references to other drafts are renumbered to their merged IDs.

**Decision.** When the tripwire engine emits an emergency-tier flag, a red strip renders above the quick actions on every dashboard load, leading unconditionally with 911 and nearest ED, with the flag text below. The strip cannot be dismissed; it clears only when the engine clears the condition or the patient acknowledges from within the flag itself. This is the only element that appears outside the feed column.

**Open item.** Exact strip copy is authored by the tripwire spec, not the dashboard. Mockup does not include an example on purpose.

**Related:** DEC-052, DEC-039 (advisory copy, provisional pending clinical review), DEC-024 (CSC v1.1 envelope).

## DEC-055: Who to call roster

**Status:** Settled (accepted by Greg as written from the usability DEC drafts, 2026-09-07)

**Source.** `docs/DEC_DRAFT_USABILITY_2026-09-06.md`, entry DEC-TBD-09. Merged verbatim; cross-references to other drafts are renumbered to their merged IDs.

**Decision.** The dashboard shows a "Who to call" card with three to four entries, each a role, a name, and a tap-to-call number. Default roster for a transplant recipient: transplant coordinator, after-hours transplant line, primary care. The patient edits the roster from Care team. The full directory is not on the dashboard. Tripwire advisory actions may reference a roster entry by role.

**Rationale.** A 19-provider directory is reference material; a three-line card is a tool.

**Implementation note (added at merge, 2026-09-07; measured from the code).** The care team record (`mi_care_team`, Tab08) has no role tags. It carries a free-text `role`, a `pcp` boolean, a `phone`, and an optional `phone24` (24-hour line). The roster therefore derives from those fields: coordinator by role text, after-hours from any member's `phone24`, primary care from `pcp`. Editable role tags are a follow-up.

**Related:** DEC-051, UI-9.

## DEC-056: Navigation structure

**Status:** Settled (accepted by Greg as written from the usability DEC drafts, 2026-09-07)

**Source.** `docs/DEC_DRAFT_USABILITY_2026-09-06.md`, entry DEC-TBD-10. Merged verbatim; cross-references to other drafts are renumbered to their merged IDs.

**Decision.** Sidebar has four groups. Today (Dashboard, Appointments) and My health (Labs and trends, Medications, Vitals, Symptoms, Health profile, Care team) are always expanded. Records (Conditions, Procedures, Diagnostics, Documents, Notes) and Tools (Import records, Reports, Insina AI) are collapsible; Records defaults closed, Tools defaults open; state persists. Emergency information is pinned at the bottom of the sidebar. The sidebar collapses to a 96px icon rail with the Insina Health wordmark visible; on narrow viewports it is replaced by a bottom tab bar. Profile, Settings, Backup, and Log out live in the avatar menu.

Top bar, left to right: menu toggle, Emergency, search (icon), date and time, text size (icon), Import records, bell, Insina AI, avatar. No sync indicator in the top bar.

**Implementation note (added at merge, 2026-09-07; measured from the code).** The live app has two record modules the draft's Records group names as one: Medical Records (Tab03, id `records`) and Source Documents (Tab09, id `documents`). UI-9 keeps every module reachable, so both stay in the Records group. The AI Analysis row keeps the Insina AI mark (DEC-P47) whatever its label. Text size is a placeholder until DEC-TBD-04 merges.

**Related:** DEC-051, DEC-049, DEC-P47, UI-9, UI-11.

## DEC-057: Reports is the print center

**Status:** Settled (accepted by Greg as written from the usability DEC drafts, 2026-09-07)

**Source.** `docs/DEC_DRAFT_USABILITY_2026-09-06.md`, entry DEC-TBD-11. Merged verbatim; cross-references to other drafts are renumbered to their merged IDs.

**Decision.** All printable outputs (ED Prep Packet, Consultation Prep, Medication Report, Patient Profile) are reached through one Reports destination, present as a quick action tile and under Tools. This resolves the ED Prep Packet no-print-path issue from the clinical review packet.

**Implementation note (added at merge, 2026-09-07; measured from the code).** The printable ED artifact that exists is the Emergency Card (`src/lib/printEmergency.js`); the "ED Prep Packet" report id appears only in the RIE preflight checklist with no print path. Reports links to what exists and names it accurately.

**Related:** DEC-051, DEC-023 (emergency access as an exportable packet).

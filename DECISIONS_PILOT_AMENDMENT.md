# Decision Log Amendment - Pilot Readiness

Append these to DECISIONS.md with the next sequential DEC-NNN IDs in your
existing log. IDs below are placeholders (DEC-P1 etc.) - renumber to match.
Reference PILOT_GATE.md item IDs (PG-01 etc.) in the corresponding commits.

---

**DEC-P1 - Amends DEC-008: "password protection" means passphrase-derived
encryption, not a login screen**

Context: the original security-staging decision (DEC-007/DEC-008) gated
"encryption" before additional users' data enters the system, without
specifying mechanism. In a non-custodial architecture, a password that only
gates UI access (the current PIN model) protects nothing, since there is no
server-side record for it to guard and the underlying data is plaintext in
localStorage regardless.

Decision: "password protected," as a pilot-readiness milestone, means the
password is used to derive an encryption key (PBKDF2 or Argon2 via
WebCrypto) that encrypts the record at rest (localStorage, AES-GCM) and
before every Drive upload. A recovery-key export is required at setup so a
forgotten passphrase does not destroy the record. The existing 4-digit PIN
may remain as a quick-unlock convenience in front of decryption, but is not
itself the security boundary and must not be described as one in
user-facing copy.

Status: required before any pilot user's data enters the system.
Tracked as PG-10.

---

**DEC-P2 - Two-step authorization deferred until a server-side login
surface exists**

Context: two-step authorization was raised as a near-term plan alongside
password protection.

Decision: 2FA protects a remote account/login surface. This architecture
has none - storage is local/Drive, not server-authenticated accounts.
Building 2FA now would protect nothing that exists. Defer until server-side
accounts are introduced, and treat that introduction itself as a decision
point: it is the first time this app would hold custodial data (login
credentials), which changes the non-custodial posture DEC-level and
deserves its own DEC, not a quiet addition alongside an unrelated feature.

Status: deferred, not blocking pilot.

---

**DEC-P3 - Clinical prompt content must be patient-generic or
patient-injected, never founder-specific static text**

Context: pilot review found the AI system prompts and reference-data blocks
contain the founder's specific clinical facts as hardcoded static text
(e.g. serostatus, a specific prophylaxis regimen, condition-specific dietary
framing), rather than deriving them from injected patient data.

Decision: static prompt text carries zero patient-specific clinical facts.
Content is either (a) condition-generic and gated on the patient's own
injected problem list, or (b) generated per patient and versioned like any
other clinical content. This is a hard rule for all AI-facing surfaces
(Tab05, Tab11, Tab14, and any future tab), not a one-time cleanup.

Status: required before any pilot user's data enters the system.
Tracked as PG-06.

---

**DEC-P4 - Extends the RIE flag-don't-fix principle to the AI prompt-build
layer**

Context: the surgical-history prompt-injection step silently rewrites
"kidney transplant"/"LDKT" to "Liver Transplant (LDLT) [corrected]" before
the model ever sees it. This is the same class of risk the Record Integrity
Engine's flag-don't-fix principle already exists to prevent, but it happens
outside RIE, in the prompt-construction code, and is invisible to the
patient.

Decision: any correction to patient-entered clinical terminology, wherever
in the codebase it happens, routes through the Review Queue for explicit
patient confirmation. No silent rewrites of clinical fact, full stop -
this was already the rule for RIE itself; this decision closes the gap
where a similar rewrite existed outside RIE's scope.

Status: required before any pilot user's data enters the system.
Tracked as PG-07.

---

**DEC-P5 - Deterministic urgency thresholds must be evaluated in code, not
left to the model**

Context: `urgencyThresholds.js` defines critical lab bounds
(`urgentLow`/`urgentHigh`) with a file-header comment stating it is "used
by Standard Mode AI to flag values that need immediate attention," but no
code path evaluates the array. The LLM is currently the only thing
classifying lab-value urgency (Routine/Soon/Today/Emergency), which
conflicts with the deterministic-tripwire-layer decision already on record
for SaMD positioning.

Decision: incoming labs are evaluated against `URGENCY_THRESHOLDS`
deterministically at import and sync time; the result is a flag the AI can
explain and echo, never a classification the AI originates. This applies
per patient, since thresholds may carry personalized doctor-set ranges
(see the existing custom-range handling).

Status: required before pilot, and independently required for the SaMD
positioning already on record regardless of pilot status.
Tracked as PG-09.

---

**DEC-P6 - Repo hygiene: no live credentials, no local-machine metadata, in
the public repository**

Context: a live GitHub personal access token was found committed inside a
.docx file in the repo root (undetected by GitHub's secret scanning, since
docx is a zip container). Local Claude Code settings, including local file
paths, were also committed.

Decision: `*.docx`, `.claude/`, and any file containing credentials are
gitignored. Any credential ever committed is treated as compromised and
rotated immediately, not just deleted from the working tree - deletion
alone leaves it recoverable in git history and requires a history purge.

Status: immediate, independent of pilot timing.
Tracked as PG-01.

---

**DEC-P7 - The AI proxy requires authentication and enforced rate limiting
before any pilot user relies on it**

Context: the proxy currently has rate limiting disabled
(`skip: () => true`) and relies on CORS as its only access control, which
does not stop non-browser requests. The proxy URL and model allowlist are
visible in the public repo's bundled client code.

Decision: rate limiting is enabled with a real cap; a hard Anthropic
spend cap is set as a backstop; and per-pilot-user bearer tokens are issued
out-of-band as a right-sized stopgap for a small invited group. Stronger
device-attestation-based auth (App Attest / Play Integrity) is deferred to
the native migration, where it becomes feasible, and is not required to
clear this pilot gate.

Status: required before any pilot user's data enters the system.
Tracked as PG-04.

---

**DEC-P8 - BYO Anthropic key: keep, hardened, at release**

Context: the app half-implements a bring-your-own-key path (plaintext key
in localStorage, one surface bypassing the proxy). The choice was keep as
a supported tier or delete.

Decision: keep. It completes the non-custodial architecture (data and
compute both free of lock-in), serves the heaviest users at their own
cost, and keeps the app functional independent of the proxy. Dormant
through the pilot: A-02 removes the direct calls now; S-08 hardening
(encrypted at rest, session-only option, warning copy) lands at the
release gate. Sub-decision parked for S-08: proxy-forwarded (retains
model allowlist and caps; key transits the stateless proxy, never stored)
versus direct-from-browser (key never touches Insina infrastructure).
Current lean: proxy-forwarded.

Status: settled for timing and direction; routing sub-decision open.
Tracked as A-10 / S-08.

---

**DEC-P9 - Lab data windows for AI: 12-month digest default, 24-month on
Advanced**

Context: Tab 11 shipped the full lab history per call (cost, attention
degradation); Tab 05 shipped only the latest value per test (trend-blind).
The Lab Trends display offers 3, 6, and 12 months.

Decision: both AI surfaces default to a 12-month per-analyte digest (last
6 values, window min and max, computed trend line with first, last,
direction, and draw count, delta, ranges, tripwire status), with a 60-day
full-resolution window alongside. Advanced mode gets the same digest at
24 months, included app-side when the question is longitudinal or the
patient toggles it: the app decides inclusion, never the model
(non-agentic by design). The trend line keeps slow declines visible for
analytes drawn more often than the listed values; full per-month anchors
remain optional future work. The AI window is a fixed default,
independent of the on-screen Trends toggle.

Status: settled. Tracked as A-03 (amended).

---

**DEC-P10 - AI cost policy: input-size levers first, model routing gated**

Context: founder approved cost reductions with standing permission.

Decision: the primary cost levers are input size and caching, applied
now: the 12-month digest replaces full-history payloads, builders order
payloads cache-first (stable sections lead, volatile trail), MODEL_MAP
carries per-surface max_tokens, and document excerpts are included only
when referenced or newly added. Model downgrades are a secondary lever
governed by consequence of error, not task complexity: surfaces that
read or interpret clinical values stay on strong models; note summaries
and report annotation are the Haiku candidates. No reassignment ships
until the threshold fixtures and prompt rollout exist to verify behavior
holds (tracked as A-11, deferred).

Status: cost set applied to specs; A-11 gated.

---

**DEC-P11 - Input plausibility guard: two bands, distinct from the
tripwire**

Context: manual entry and OCR extraction can produce obvious errors (a
systolic of 1138, a lost decimal). Error-catching and urgency-flagging
must not blur: a typo needs a correction prompt, a real extreme value
needs an urgent flag.

Decision: a versioned plausibility layer runs before tripwire evaluation
at the same hooks. Hard band (physiologically impossible, set beyond any
recorded human value) blocks manual save with correction suggestions the
patient picks from; nothing auto-corrects. Soft band (implausible but
possible) confirms and saves with one tap and never blocks, because rare
extreme values are exactly what the tripwire exists to catch. Extraction
values out of band go to the RIE Review Queue with the raw extracted
text; unit mismatches are their own flag, no auto-conversion in v1.

Status: settled. Tracked as A-12.

---

**DEC-P12 - Analysis context gathering: bounded at five, one round,
emergencies exempt**

Context: good analysis sometimes needs context the record cannot contain.
Unbounded questioning degrades the product and adds cost.

Decision: conversational analysis surfaces may ask up to 5 targeted
questions in a single batched round, only when answers would materially
change the analysis; partial answers or a request to proceed end the
gathering; recorded facts are never re-asked; emergency-pattern symptoms
get the emergency response before any questionnaire. One-shot analyses
get an optional launch field injected as {sessionContext}, app-decided,
non-agentic. Lab Q&A stays capped at one question.

Status: settled. Tracked as A-13 and prompt spec v2.3.

---

**DEC-P13 - UI change plan reconciled against the engineering specs**

Context: a separate UI assessment (~30 items) overlapped the engineering
specs at nine points, including two direct contradictions.

Decision: the UI plan is kept as INSINA_UI_CHANGES.md with UI-N IDs and
the shared phase scheme. Reconciliation rulings: UI-6 (tripwire failure)
and UI-5 (pseudonymized payloads) are duplicates deferred to A-01 and
P-01/P-03, keeping only their display constraints and approved wording;
UI-13 (replace PIN) is rewritten to defer to P-02, and its
authentication/recovery-reset language is removed as incompatible with the
non-custodial encryption model; UI-3 (lab grouping) is absorbed into A-04,
a minimal version of which is pulled into Phase 1; UI-15 (AI Analysis
layout) merges with A-13 and adds the four-section response structure to
the prompt spec (v2.4). All other UI items carried through, reformatted
and phase-aligned.

Status: settled. Tracked as INSINA_UI_CHANGES.md.

---

**DEC-P14 - Save AI analysis to Notes, with an AI-generated label**

Context: the UI review approved "Save to My Notes" on the AI Analysis
screen; a prior amendment had deferred saving AI output into the record
over a labeling concern.

Decision: approved. Analyses save into Notes as dated entries carrying an
explicit AI-generated label distinguishing them from clinician or
patient-authored text, and remain downloadable as markdown. The labeling
requirement resolves the earlier concern; this is no longer deferred.

Status: settled. Tracked as A-13 / UI-15.

---

**DEC-P15 - Emergency access under full-record encryption: exportable
packet, not in-app reduced-auth view**

Context: UI-13 called for a "limited Emergency Information view," which has
no clean answer once the record is encrypted behind a passphrase (P-02).

Decision (safe default, option A): emergency information is provided by the
exportable/printable Surface H ED packet the patient keeps outside the app
(paper, phone wallet, lock-screen medical ID). The live encrypted app
exposes no no-passphrase view, so the encryption boundary is not breached.
Option B (a patient-designated, lighter-protected in-app Emergency Card
for a chosen subset) is a possible future addition and would require its
own DEC as a deliberate, documented weakening of the boundary. Built to A.

Status: A settled; B open pending founder decision. Tracked as UI-13 /
P-02.

---

*These amendments were produced from a security/architecture review of the
live repository (v1.21.0) and the AI prompt reference document, in the
context of moving from single-user founder use to a small invited pilot
group. See PILOT_GATE.md for the full checklist these decisions reference.*
---

# Decision Log Amendment — Precaution Corpus (DEC-P16 … DEC-P42)

*Appended 2026-07-22. Continues the DEC-P sequence, which previously ended at DEC-P15.
Produced from the liver handbook corpus work. Final DEC-NNN assignment happens at merge
into DECISIONS.md. See MASTER_INDEX.md for the open-item list and correction log.*

---

## DEC-P16 — Transplant substance flag table (feature)
**Status:** Accepted
**Decision:** Insina maintains a deterministic table of substances (food, beverage,
supplement, herbal, OTC, Rx) that transplant center patient handbooks tell patients to
avoid, limit, or ask about.
**Rationale:** Narrow, high-acuity rule set a generic PHR won't build for an 850k
population. Surfaces what centers already tell their own patients rather than originating
clinical claims.
**Constraint:** Table is deterministic. AI never originates a flag and never clears one.
Same architecture as the tripwire engine. Extends "flag, don't fix" to substances.

## DEC-P17 — Output is always question-form
**Status:** Accepted (GB)
**Decision:** Insina never phrases a substance flag as an assertion, a prohibition, or a
sourced claim. Every output is a question the patient asks their team. "Should I avoid
grapefruit?"
**Rationale (GB):** Named sources arm the patient to assert borrowed authority at their own
clinician, inverting the relationship and making Insina the authority. Question-form keeps
clinician judgment first. This is what "AI proposes, patient disposes" means operationally.
**Supersedes:** earlier proposals for named sources, source counts, ratios, or a generic
provenance line in the patient UI. All rejected.
**Consequence:** provenance is INTERNAL ONLY. Source registry, DEC, design history file.
Not patient-facing.
**Closes:** true-contradiction handling. A question makes no claim, so there is nothing to
contradict and no adjudication logic to build.

## DEC-P18 — Flags are population-level, never patient-conditioned
**Status:** Accepted
**Decision:** Flags fire on population membership (transplant recipient, organ, phase).
Never conditioned on the patient's own medication list.
**Rationale:** "This interacts with your tacrolimus" is an individualized interaction alert
and drifts toward the CDS boundary that drug-level trend interpretation is deliberately held
behind. Population-level lookup is reference information.

## DEC-P19 — Corpus definition and two-pool separation
**Status:** Accepted
**Selection corpus:** transplant center patient handbooks only. These and only these produce
the N-of-M consensus count.
**Verification tier:** TxPharm COP reference collection, DailyMed labels, LiverTox, MSK
About Herbs, Flockhart CYP450 table, NIH ODS, FDA/CDC food safety booklet, AASLD/AST
guideline. Provides mechanism, aliases, evidence grade, tier validation.
**Rule:** pools never merge into one count. "What transplant centers tell their own
patients" is the regulatory framing and must stay clean.
**Narrow exception to consider:** anything named in a first-line immunosuppressant's FDA
label may enter at Caution regardless of manual count. Not yet accepted.

## DEC-P20 — A source is a CENTER, not a file
**Status:** Accepted
**Decision:** `source_count` = distinct CENTERS naming a substance. Multi-file handbooks
count as one source. Dedupe by hash before mapping files to centers.
**Trigger:** Michigan is 12 chapter files. Counted per file it single-handedly clears any
threshold. `Michigan - ResourcesLiver.pdf` and `UM - ResourcesLiver.pdf` are byte-identical.
**Without this rule the methodology is decorative.**

## DEC-P21 — Union rule
**Status:** Accepted (GB)
**Decision:**
- Every substance in the user's center guide enters at that center's stated strength.
- Every substance in the consensus table enters at its consensus tier.
- The user sees the UNION. Nothing is ever suppressed.
- **Omission is not permission.** A center's silence never removes a consensus flag.
- Consensus never removes a user's-center flag, even at source_count 1.
**Display:** user's center first. As Insina's own paraphrase, never the center's verbatim
text. Per DEC-P17 this surfaces as a question, not an attribution.

## DEC-P22 — Runtime documents are display-only in safety features
**Status:** Accepted
**Decision:** No document uploaded or fetched at runtime participates in flag logic. Tier
assignment happens only in the curated table. Patient uploads land in Documents and, at
most, an admin curation queue.
**Rationale:** extraction recall failures are invisible to human review. They must happen in
a curation pass where they are catchable, never mid-session.

## DEC-P23 — Pre- and post-transplant are separate tables
**Status:** Accepted
**Decision:** Two tables. Separate corpora, separate M, separate consensus counts. No
shared rows. No merge. The lookup resolves table by PHASE before it resolves substance.
**Evidence, not theory:** Michigan permits acetaminophen ≤2 g/day post-transplant as the
recommended analgesic; the ceiling differs in decompensated cirrhosis. Grapefruit's flag is
driven by calcineurin inhibitors a pre-transplant patient isn't taking. Same substance,
opposite guidance.
**Failure mode this prevents:** one bad join, one defaulted field, or one stale phase shows
the inverted flag. Worse than shipping no feature.

## DEC-P24 — Phase is a required field with no safe default
**Status:** Accepted in principle (GB: "it needs to")
**Decision:** Tier 0 captures an explicit pre/post gate. Phase is never inferred. Transition
is an explicit user action with confirmation.
**Consequence:** pre-transplant users are a SEGMENT EXPANSION. The pilot cohort is
post-transplant. Pre-transplant may be a post-pilot segment even though its corpus is built
now.
**Open:** transition UX, and whether pre-transplant is in the pilot at all.

## DEC-P25 — Bucket assignment
**Status:** Accepted (GB)
| Bucket | Contents | Feeds |
|---|---|---|
| A | Liver recipient post-transplant center handbooks | Post-tx consensus table |
| B | Liver pre-transplant center guides | Pre-tx content + separate table |
| C | Living donor guides | Donor Q&A. Never flag material. |
| D | Society/advocacy | Education link-out, eval fixtures |
| X | Kidney-pancreas, non-liver | Excluded |
"Out of the consensus count" is not "out of the app." C and D ship; they just never vote.

## DEC-P26 — Adequacy gate replaces recency cutoff
**Status:** Proposed. **GB decision required.**
**Decision:** Corpus eligibility turns on whether a document contains actual substance
guidance, not on its date. Recency is a tiebreaker WITHIN the adequate set, not a gate.
**Evidence that killed the recency cutoff:**
- OSU pre-transplant brochure, rev. Mar 2026, newest file in the set: zero mentions of
 tacrolimus, grapefruit, or any drug.
- Penn State, 70 pages, Sep 2023: zero mentions of grapefruit.
- Stanford 2004, the document a cutoff was designed to exclude: among the richest.
Both new-but-empty documents clear a 2018 cutoff and add nothing but denominator, which is
the same suppression mechanism the cutoff was meant to prevent.
**Corollary:** only UF states a revision date inside the document. Content markers
(Envarsus, Mavyret, REMS, pomelo) are better currency evidence than any date field.
**Open:** the gate's operational definition.

## DEC-P27 — Tiebreaker: Michigan
**Status:** Accepted, pre-registered criteria
**Scope:** explanation and mechanism WORDING at extraction time only. Never overrides a flag.
**Criteria:** (1) dedicated medications chapter, (2) dedicated diet/nutrition chapter,
(3) mechanisms stated rather than bare lists, (4) current content.
**Determination:** Michigan. Only verified center meeting all four, and the only document in
the corpus carrying the current regimen (Envarsus XR, Mavyret/Epclusa, mycophenolate REMS,
pomelo).

## DEC-P28 — Source registry and update cadence
**Status:** Accepted
**Registry:** one row per source. Center, document, version/date, verified, **terms**
(stated reproduction/permission language), URL, hash, bucket, which table entries cite it.
**Table versioning:** like the CSC (v1.0, v1.1) with a changelog. Any flag shown to any
patient traces to a table version and its source versions.
**Cadence:** quarterly admin review against the registry; annual full re-check. DailyMed
label-change feeds may be automated early at near-zero cost. Everything else manual.
**Update workflow:** new version → re-extract → diff against current table → changed rows
go through the same disposition review as new rows → increment table version. **Never
hot-patch a live safety table.**

## DEC-P29 — Corpus read path
**Status:** Accepted (GB saves to computer)
**Decision:** Reads pin to ONE tree by folder ID. GB maintains the local PC folder, so reads
pin to the Drive for Desktop **backup mirror**. Writes go to My Drive > Insina.
**RETRACTED:** earlier instruction to delete or archive the second tree. It is a computer
backup; deleting from it can remove local files. Never delete a backup mirror.

## DEC-P30 — Copyright posture
**Status:** Accepted; questions routed to existing attorney review
**Principle:** copyright protects expression, not facts. Extract facts, publish an original
table (our normalization, our one-liners, our tier arithmetic, our organ tags).
**Method constraints (do not relax under time pressure — they are the whole position):**
paraphrase under 15 words, citations not excerpts, never reproduce manual text.
**RETRACTED:** (a) curated center-guide library hosting complete copyrighted works;
(b) "show the center's language first" read as verbatim text.
**Note:** Stanford's manual carries an explicit no-reproduction-without-permission notice.
Assume others do until verified. Public posting is not a license to redistribute.
**Survives:** link out rather than host; patient's own upload stays in the patient's own
storage (non-custodial architecture is load-bearing here); drop the admin queue step that
promoted an upload into a distributable library copy.
**Gates:** hosting, display wording, distribution. **Does NOT gate extraction.**
**Attorney questions:** (1) does fact extraction into an original database create exposure,
and does attribution mitigate or aggravate; (2) can we display a paraphrase attributed to a
named center without a license; (3) status of a patient-uploaded copy under non-custodial
storage; (4) do publisher TDM/AI-training reservations bind us if we never ingest the text.

## DEC-P31 — Model routing for corpus extraction
**Status:** Accepted
**Decision:** Extraction and tier judgment run on the most capable model (Fable). Not
settled implementation work.
**Rationale:** human review catches wrong rows but cannot catch MISSING ones. Recall failure
is invisible to review. High consequence-of-error. One-time corpus build over \~6-10
documents; cost savings are noise against one missed contraindication.
**Sonnet 5:** evaluation list for runtime phrasing (low consequence, fixed fields) after
fixtures exist, and for Code execution of settled specs.
**Migration note if adopted in the proxy:** new tokenizer produces \~30% more tokens for the
same text, and non-default sampling parameters are rejected. Check proxy config before
swapping model strings.
**Method (from MGB/JAMA, Apr 2026):** evaluate stepwise per stage, not averaged accuracy.
Averaging masks the weak stage. Applies to the Haiku/Sonnet routing evals.

## DEC-P32 — Extraction cadence
**Status:** Accepted
**Decision:** One center per session. Extract to a structured file, write it back to Drive,
move on. Merge pass operates on extracted tables, never on source PDFs.
**Rationale:** batching manuals to save sessions is the same error as routing to a cheaper
model. Context pressure produces recall failures, and recall failures are invisible.

---

## Open, requiring GB decision before extraction

| Ref | Item |
|---|---|
| DEC-P26 | Adequacy gate operational definition |
| — | Stanford 2004: rich content vs. superseded guidance |
| — | THRESHOLD_AVOID / THRESHOLD_CAUTION against final M(A). **Set before extraction.** |
| — | M(B): confirm option (b), citation-only pre-transplant display. M(B)=3 at best. |
| DEC-P24 | Phase transition UX; pre-transplant in pilot or not |
| — | Written permission requests to centers (not blocking; changes posture if granted) |

## Parked

- Caregiver as second user persona. Insina has no caregiver concept. Record even a
 "not in pilot" decision.
- Consultation Prep boundary. Patient-carried, clinician-read. Assertive form, NOT
 question-form. Do not let DEC-P17 leak into it, or its form leak back.
- Behavioral don'ts (raw food handling, gardening, cat litter). V2 educational checklist,
 not a lookup. V1 is ingestibles only.
- CSC rule 10 remains parked and out of scope.

---

## DEC-P33 — LiverTox: scope restricted to one mechanism category

**Status:** Accepted
**Source:** LiverTox, NIH/NIDDK, NCBI Bookshelf. Public domain (US government work).
1,707 drug entries, 157 herbal/dietary supplement entries. Structured master list
available as XLSX.

### Decision
The LiverTox **Likelihood Score** (A–E) populates **graft and organ toxicity rows only**.
This is category 2 of the four-category mechanism taxonomy.

It is **never** used for:
- Tier assignment across the table
- Interaction risk (category 1)
- Infection risk (category 3)
- Immune stimulation (category 4)
- OTC safety for transplant patients

Applies to **both** the pre- and post-transplant tables.

### Rationale
LiverTox measures probability of drug-induced liver injury. It does not measure
interaction with immunosuppressants, and it has no knowledge that it is describing
transplant recipients. Using the score as a general tier produces confident inversions:

| Substance | LiverTox | Actual post-transplant guidance |
|---|---|---|
| Acetaminophen | **A** (well-established hepatotoxin) | **Recommended** analgesic; Michigan permits ≤2 g/day |
| Pseudoephedrine | **E** (unlikely injury) | **Avoid** — named explicitly by AST |
| Phenylephrine | **E** | **Avoid** — named explicitly by AST |
| St. John's Wort | **E** | **Avoid** — CYP3A4 induction crashes tacrolimus |
| Green tea extract | **A** | Avoid — and **only** LiverTox catches this |
| Echinacea | **D** | Caution — immune stimulation; LiverTox cannot see this |

Wired to tier assignment, the table would tell a transplant patient that Tylenol is
dangerous and Sudafed is safe, with NIH provenance behind it.

### Why LiverTox stays in the post-transplant table
**The graft is a liver.** Hepatotoxins injure a transplanted liver as they injure a native
one. No center handbook names a single botanical, so this category has no other source.
LiverTox supplies rows nothing else would: green tea extract, turmeric, kava, black cohosh,
Polygonum multiflorum, Tinospora (all A); ashwagandha, chaparral, garcinia, ephedra,
kratom (B); high-dose iron, vitamin A, copper (A[HD]); branded weight-loss products.

**Transplant-specific amplification:** herbal DILI in a graft recipient presents as
elevated liver enzymes, which triggers a rejection workup. The harm is diagnostic confusion
on top of direct injury, in a patient whose LFT abnormalities are already being read as
possible rejection.

### Pre-transplant alignment
For pre-transplant the hepatotoxicity axis is largely the correct axis, and LiverTox may
serve as the **primary** source for that axis rather than a verification layer. This is a
candidate resolution to the M(B) blocker (see DEC-P26 open items) and would remove the
need for handbook consensus on the hepatotoxicity axis specifically.

Three caveats that survive into pre-transplant:
1. **Scores measure probability, not consequence.** Derived from cases in patients with
 normal hepatic reserve. A score of E is not clearance for a decompensated cirrhotic.
2. **Acetaminophen still over-flags.** Remains the preferred analgesic in cirrhosis at a
 reduced ceiling. The number comes from AASLD guidance and pre-transplant handbooks,
 not from LiverTox.
3. **No visibility into decompensation.** Sodium/ascites, encephalopathy, variceal bleeding,
 hepatorenal risk. LiverTox knows none of it. Second axis required.

### Additional permitted uses
- Herbal identity, botanical names, and aliases (feeds the alias table)
- Evidence-grade confirmation that a documented case literature exists
- Interaction facts **from entry narrative prose only**, never from the score. St. John's
 Wort's entry mentions interactions 19 times and induction 22 times while scoring E.

### Data quality notes
- Brand-name column gives *a* brand, not the primary one (cyclosporine listed as Sangcya,
 rifampin as IsonaRif). Usable for alias seeding, not authoritative.
- Classification is by therapeutic class, not by interaction mechanism. It will not sort
 the four mechanism categories.

---

## DEC-P34 — Source freshness monitoring

**Status:** Accepted (GB)
**Supersedes:** the cadence provisions of DEC-P28, which assumed a single manual
quarterly review across all sources. Registry schema and update workflow from DEC-P28
are unchanged.

### Decision
Three monitoring tiers, because sources fail in different ways.

#### Tier 1 — Programmatic, quarterly
| Source | Endpoint | Notes |
|---|---|---|
| LiverTox changelog | `/books/n/livertox/updates/` | Dated entries, \~monthly batches |
| LiverTox master list | XLSX linked from `/books/n/livertox/masterlistintro/` | **Resolve the link each run.** Filename encodes date (`masterlist02-26.xlsx`) and changes on release; a hardcoded URL will break silently. |
| FDA labels | DailyMed label-change feeds | First-line immunosuppressants only |

**Known lag:** the XLSX trails the site. Header read "Last Update: January 30, 2026" while
the changelog ran through July 7, 2026. **Diff the XLSX for structured changes, but read the
changelog for what is actually new.** The spreadsheet alone silently misses months.

#### Tier 2 — Manual, quarterly (GB)
Center handbooks. **Check the center's patient-education page, not the stored PDF URL.**

Observed failure mode is silent URL death, not content revision: UCSF's handbook URL 404s,
Methodist Dallas is dead, Hopkins sits behind Cloudflare and cannot be fetched
programmatically. A stored URL returning nothing tells you nothing about whether the
handbook changed.

Registry records `last_verified` date and `url_status` per source. A dead URL is a registry
flag; it does not alter the table.

#### Tier 3 — Opportunistic
Patient uploads. When a patient uploads their center's guide, compare against the registry
version. If newer, it enters the admin curation queue.

This makes users the freshness signal for their own center, which is the only reliable
mechanism for centers that do not publish. It does not change the table directly; curation
still runs per DEC-P22 (runtime documents are display-only in safety features).

### Rules on change handling
1. **A score downgrade never auto-removes a row.** It flags for human disposition. "AI never
 clears a flag" applies to source changes, not only to runtime. LiverTox moving a
 substance from A to C is a review trigger, not a deletion.
2. **New source entries land in the holding queue, not production.**
3. **Changed rows go through the same disposition review as new rows.**
4. **Table version increments only after human disposition.**
5. **Never hot-patch a live safety table.** (Restates DEC-P28.)

### Date semantics
The registry records **publication or revision date, never date received.** Ochsner's
handbook is © 2017 and 172 pages; GB received it in January 2025. Those are different
facts and only the first belongs in the registry. This applies to every guide a patient
uploads.

---

## DEC-P35 — Mandatory inclusion floor

**Status:** Accepted (GB: "Grapefruit is a must include")
**Supersedes:** the open FDA-label-override question in DEC-P19 and the deferred
question in the correction log below.

### Decision
Certain substances enter the table **regardless of consensus count**. Consensus arithmetic
can add rows. It can never remove a mandatory row, and a mandatory row does not need to
clear any threshold.

### Rule 1 — FDA label floor
Any substance named in a first-line immunosuppressant's FDA label (tacrolimus, cyclosporine,
mycophenolate, sirolimus, everolimus) enters the post-transplant table at minimum tier
Caution, irrespective of how many handbooks name it.

### Rule 2 — Mechanism relatives
If a substance is in the table and a second substance shares its documented mechanism, the
second enters at the same tier or one tier lower, even below threshold.

**Worked example.** Grapefruit is in by consensus and by Rule 1 (named in the Prograf label).
Pomelo and Seville/bitter orange share the furanocoumarin CYP3A4 mechanism. Pomelo appears
in only one of five counted centers and Seville orange in none, so consensus alone would
drop both. Rule 2 admits them. This is the intended behavior: the mechanism is identical and
patients do not distinguish the fruits.

### Rationale
Handbook depth varies enormously and consensus counting systematically punishes substances
that only thorough handbooks bother to name. St. John's Wort appears in zero of the five
counted centers despite being the most universally accepted supplement interaction in
transplant pharmacology and being named in the Prograf label. Without a floor, the table
omits the best-established items while including well-covered but less consequential ones.

The floor is defensible because it is **pre-registered and criterion-based**, not curated by
judgment. "Named in the label of a drug the patient is taking" is a rule anyone can audit.
"Greg thinks this one matters" is not.

### Confirmed mandatory members
| Substance | Basis |
|---|---|
| Grapefruit and grapefruit juice | Rule 1 (Prograf label) + consensus |
| Pomelo | Rule 2 (furanocoumarin/CYP3A4) |
| Seville / bitter orange | Rule 2 (furanocoumarin/CYP3A4) |
| St. John's Wort | Rule 1 (Prograf label) |

The list is not closed. Rules 1 and 2 govern; membership follows from them.

### Constraints
1. **Post-transplant table only.** The pre-transplant table has a different mechanism axis
 (DEC-P33); grapefruit's flag is driven by calcineurin inhibitors a pre-transplant
 patient is not taking. Mandatory membership does not cross phases.
2. **Output form is unchanged.** Mandatory rows surface as questions like every other row
 (DEC-P17). "Must include" governs presence in the table, not assertiveness in the UI.
3. **Mandatory rows survive re-extraction.** A quarterly check that finds fewer handbooks
 naming grapefruit does not demote or remove it. Verified explicitly in the quarterly run
 sheet.
4. **Rule 2 requires a documented shared mechanism**, not a superficial resemblance. Citrus
 generally is not a furanocoumarin relative; sweet oranges and lemons do not qualify.

---

## Amendment to DEC-P28
Registry gains two columns: `url_status` (live / dead / blocked) and `last_verified`.
The `terms` column (stated reproduction/permission language) is unchanged.
Cadence provisions are superseded by DEC-P34.

---

## Correction log

Recorded so the reasoning behind current source rankings is auditable.

**AST TxPharm COP Reference Collection — earlier characterization was wrong.**
Previously described as "professional-grade transplant pharmacy reference material," "the
anchor of the verification layer," and "arguably ahead of MSK." It is an **annotated
bibliography of research literature**. The Liver chapter is 75 pages and 24,000 words with
204 mentions of tacrolimus and **zero** mentions of grapefruit, zero CYP3A4, and two of
"herbal." Useful for tracking the literature. Not a source for a substance table.
**Removed from the verification tier.**

**Starzl Network medications resource — pediatric.** 22 pages, December 2020, 21 references
to "your child." Rich on grapefruit (15) and pomelo (6), no named botanicals. Retain as
verification tier with the pediatric caveat recorded.

**AST Safe OTC Medications handout — retained, pediatric-framed.** Two pages. Names specific
decongestant ingredients (pseudoephedrine, phenylephrine, oxymetazoline), NSAIDs, aspirin,
acetaminophen, diphenhydramine. Herbals handled as a class. Structured as a **safe list**
rather than an avoid list, which is a distinct and possibly more useful data shape.

**Grapefruit consensus alarm — retracted.** An earlier finding that grapefruit appeared in
only 1 of 5 handbooks was an artifact of sampling whichever PDFs were publicly downloadable.
Of those five, only one was an adequate post-transplant handbook. With Ochsner and UW added,
grapefruit appears in 3 of 5 (and in Michigan, which is not in the counted set). The
FDA-label override question raised on that basis is now **closed by DEC-P35**, which
adopts a mandatory inclusion floor rather than a count-based override.

---

## DEC-P36 — Rule 3: class-implied inclusion

**Status:** Accepted (GB: "If it's just generic reference, I think we should include those
from Michigan")

### Decision
A named item enters the table at single-source count when both hold:
1. The item falls inside a class that other sources flag at class level, and
2. No source contradicts it.

**Class-level silence is corroboration, not dissent.**

### Rationale, with evidence
Michigan names St. John's Wort as an example inside its own class statement. Ochsner,
Oregon, and others carry the same class statement without naming examples. They are not
disagreeing about St. John's Wort; their class statement covers it. The difference is
granularity, not position.

**The decisive evidence is that Michigan is the source of both artifacts.** Michigan's
patient handbook says do not use herbal or dietary supplements without consulting the team.
Michigan researchers published "Estimated Exposure to 6 Potentially Hepatotoxic Botanicals
in US Adults" (Likhitsup et al., *JAMA Network Open*, Aug 2024,
DOI 10.1001/jamanetworkopen.2024.25822) naming turmeric, green tea, ashwagandha, black
cohosh, Garcinia cambogia, and red yeast rice.

The same institution holds both the class statement and the specific list. The class
statement is therefore a choice about what belongs in a patient handbook, not evidence of
ignorance. Rule 3 formalizes that reading.

### Effect
Generalizes past St. John's Wort. Any named supplement found in any adequate handbook enters
by the same route, because every adequate handbook carries the herbal class statement.

---

## DEC-P37 — Rows are named by form, not by substance

**Status:** Proposed. **Constraint is factual; formal acceptance required.**

### Decision
Every row is named by its **form of preparation**. Any row whose name is also a common food
or beverage requires an explicit form qualifier before it ships.

- "Green tea extract or green tea supplements" — never "green tea"
- "Turmeric or curcumin supplements" — never "turmeric"
- "Garlic supplements" — never "garlic"

`form` becomes a required extraction field.

### Trigger
LiverTox's entry is titled **Green Tea** and scores **A**. The entry states plainly that
drinking green tea has **not** been associated with liver injury or aminotransferase
elevations, and that cross-sectional studies associate regular consumption with *lower* ALT
and AST. The A score belongs to green tea **extract**, concentrated catechins, appearing
largely in weight-loss products (Hydroxycut, Dexatrim, SlimQuick, Green Tea Fat Burner;
Exolise was withdrawn in Spain and France in 2003).

A small number of injury cases involve green tea "infusions," but the cited examples are
concentrated tonic preparations taken on a weekly or biweekly schedule, not ordinary tea.

**Matching on the LiverTox entry name would tell a transplant recipient to stop drinking
tea, contradicted by the source being cited.**

### Not isolated
| Entry name | Hazardous form | Harmless form |
|---|---|---|
| Green Tea | concentrated extract, weight-loss products | brewed tea |
| Turmeric | concentrated curcumin supplements | spice in food |
| Garlic | supplement doses | cooking |
| Licorice | concentrated extract | most candy |

### Why it matters beyond accuracy
Trust asymmetry. A missed row is invisible. A ridiculous row is memorable and discredits
every other flag in the app.

---

## DEC-P38 — Supplement rows are a recognizer, not a risk table

**Status:** **ACCEPTED (GB, 2026-07-22).**

### Question that prompted it
GB: "Should we just say 'Before taking any supplements, consult your transplant team' and
leave it at that."

That option is defensible: it is what 5 of 6 handbooks actually say, it is the strongest
consensus in the dataset, it costs nothing to maintain, and it cannot be wrong about any
specific substance.

### The gap it leaves
The class statement assumes a conversation that is not happening. Likhitsup's finding is
that clinicians do not necessarily ask about supplement use and most users start on their
own. The patient reads "consult your team before any supplement" and does not, because they
do not classify turmeric as a supplement. It is a spice, it is for their joints, it is
natural. **The recognition step fails before the consultation step.**

### Proposal
Keep the class statement as the safety content. Demote the item list from a risk table to a
**recognizer**. Output is not a stronger warning, it is the same disposition triggered by a
name the patient would not have self-classified:

> **Turmeric supplements** — this counts as a supplement. Should I stop taking it?

The claim is "turmeric is a supplement," not "turmeric is hepatotoxic." Much weaker claim,
and the one actually supportable.

### Consequences (now in force)
1. **Mislabeling stops mattering.** Fontana's \~50% label-mismatch finding breaks a risk
 claim about turmeric. It does not touch a recognition claim, which holds regardless of
 bottle contents.
2. **LiverTox scores leave the patient-facing layer entirely.** Internal prioritization
 only: which names to include, which to surface first. The DEC-P33 inversion trap
 becomes largely unreachable because nothing patient-facing reads a score.
3. **The supplement table simplifies to a name list.** No tiers, no consensus counting, no
 mechanism one-liners for supplements. LiverTox's 157 HDS entries become an alias list.
 Large reduction against what was specced.

### Honest cost
Still a name list to maintain, still quarterly LiverTox monitoring, still curation. If the
goal is genuinely zero maintenance, the class-statement-only option is the answer and the
accepted cost is that turmeric users will not self-identify.

### Line to hold either way
**Do not let the item list become a risk-grading table.** That is where both the regulatory
exposure and the maintenance burden live, and where the sources disagree most.

---

## DEC-P39 — Clinician disposition layer

**Status:** Accepted in principle (GB: "I really like that")
**Design not settled.**

### Decision
When a deterministic flag fires and the patient takes it to their team, the team's response
is captured against that row: who said it, when, and what they said in the patient's own
words. Future flags on that row respect the stored disposition.

### It is one primitive, not several features
Flag fires on population default → patient asks team → team gives patient-specific guidance
→ guidance stored → future flags respect it.

Labs and substances are two instances. So is "your center's guide doesn't mention this."
**Build as a layer over the tripwire engine, not per-feature.**

### Worked example (GB, real)
Tacrolimus flagged low at 3.2 against a lab reference of 5–20. Dr. Zapata's target for GB is
**3–5**. Without the stored range the app reads every result against the lab's generic band.
GB's most recent tac was 5.8, which reads differently against 3–5 than against 5–20.

### This is the moat, stated plainly
Not the storage architecture. Not the flags. The accumulated set of clinician dispositions
that no EHR holds in structured form and that makes every subsequent flag more accurate. A
competitor copies the substance table in a weekend. They cannot copy two years of a team's
answers. This is the patient-curated reconciled record layer the existing framing already
names as the actual differentiation.

### Four constraints, all required before build
1. **Bounded override.** A stored range shifts the reference band; it never disables the
 tripwire. A target of 3–5 makes 3.2 unremarkable. It must not make 0.8 unremarkable.
 Emergency thresholds stay with the deterministic engine; a disposition narrows the normal
 band *inside* them. Otherwise a stored answer becomes a way to silence the thing that
 exists not to be silenced. Cross-reference: both ends of a critical range can be
 life-threatening.
2. **Dispositions expire.** Michigan's own chapter states target levels and doses change
 over time. A target captured at 18 months post-transplant may be wrong at four years.
 Every disposition carries a date and a re-confirm prompt, and the app shows its age
 rather than presenting it as current fact.
3. **Provenance and source type.** Patient-reported (heard in conversation) is not the same
 as document-sourced (after-visit summary, clinical note). Both usable, not equally
 reliable. A misremembered conversation silently suppressing flags is exactly what
 "flag, don't fix" exists to prevent.
4. **Whose disposition.** A transplant hepatologist setting a tacrolimus target is
 authoritative; a PCP would not be, on that. Record who said it and make it visible.
 **The app does not adjudicate.**

---

## DEC-P40 — Capture hierarchy

**Status:** Accepted in principle. Ordering proposed.

### Routes, strongest provenance first
1. **Clinical note or after-visit summary.** Document-sourced. Available under Cures Act
 information-blocking rules without delay. Already in the import pipeline; this is
 pointing an existing capability at flagged questions.
2. **Ask the clinician to document it.** "Could you put my target range in the after-visit
 summary?" Costs seconds, creates a durable record in both systems, no consent question,
 no audio, no transcription. **Insina prompts the patient to ask for the answer to be
 documented.** Arguably better than recording.
3. **Patient recording with consent** (DEC-P41). Catches what was said but not
 documented.
4. **Post-visit typed or dictated capture.** Weakest provenance, no dependencies.

### No route is universally available
GB's care spans Ochsner, SCRMC, Hattiesburg Clinic, and Pine Belt Dermatology — four
systems, different tooling, different individual habits. Dr. Zapata does not use an ambient
scribe. **The disposition layer cannot depend on any single route.**

**Therefore route 4 is the floor, not the fallback, and it has to be good.**

Two things make it good enough:
- **Capture immediately.** Prompt on the way out, not that evening. Memory decay is the main
 weakness and timing is most of the fix.
- **Confirm at the next visit.** "You noted her target for you is 3–5. Still current?"
 Upgrades patient-reported to confirmed over time and handles expiry naturally.

Note: GB's 3–5 range survived to this conversation on memory alone with no tooling.
Post-visit capture is not a downgrade from recording; it is what is already happening, given
somewhere to live.

### Correction recorded
An earlier claim that ambient scribes make route 1 broadly automatic was wrong. Ambient
scribes are a documentation *method*, not documentation. Clinicians write notes regardless,
and a transplant hepatologist would routinely document a target trough. Route 1 is not
automatic but is not dead.

---

## DEC-P41 — Recording consent

**Status:** Accepted (GB directed)

### Decision
**Consent is asked contemporaneously, every time. Permission is never stored as a standing
grant.**

History affects phrasing only:
| Prior state | Prompt |
|---|---|
| Never asked | "Would it be alright if I record, so I get the instructions right?" |
| Previously yes | "Is it still ok if I record our visit?" |
| Previously no | Fresh ask, no presumption of prior permission |

**Invariant: the app never records without a contemporaneous yes.**

### Rationale (GB)
Two-party statutes require awareness at the time of recording. A stored yes from March is
not consent in July; it is a record that consent once existed. Policies shift underneath:
the hospital adopts a media policy, the practice joins a system, the clinician has one bad
experience. Storing permission would have Insina asserting something it cannot know.

### Supporting requirements
- **Script the ask.** "Can I record this?" reads as litigious. "Can I record so I get the
 instructions right?" reads as a patient trying to comply. Supplying the phrasing is a
 feature.
- **Fallback ask if declined:** "Could you summarize what we decided so I can record just
 that part?" Smaller ask, more often granted, less incidental content, and the clinician
 speaks deliberately.
- **Put the consent exchange at the head of the recording.** Self-documenting; the artifact
 that matters if the question ever arises.
- **Graceful third path** when both asks are declined: route 4 of DEC-P40.

### Recording is a memory backstop, not a primary source (GB)
It is a fallback when patient and clinician memory fail or disagree. It does not replace the
clinical note or patient memory.

### OPEN — GB decision required
**Store-and-replay vs transcribe-and-propose.**
- *Store-and-replay* matches GB's stated framing and carries almost no risk. The audio is
 the artifact; the patient listens.
- *Transcribe-and-propose* is more convenient and reintroduces the misheard-range problem.
 A proposed "5 to 10" that the patient clicks through is wrong in exactly the invisible way.
- **If transcribe-and-propose is chosen, the guardrail is that any AI-proposed disposition
 links to its timestamp in the audio, so confirmation means listening rather than
 accepting.**

### Deferred to legal (existing scope)
- MS/LA recording consent, already on the legal list. **Cohort dimension is new:** a pilot
 spreads across states with different rules, and health systems have their own policies
 regardless of state law.
- Proxy exposure. A full audio transcript of a clinical encounter is a different order of
 sensitivity than a lab value and contains material the patient never intended to store.
 Must be settled before any audio or transcript leaves the device.

---

## DEC-P42 — Retire the single-center tiebreaker (DEC-P27)

**Status:** PROPOSED. **GB decision required.**

### Proposal
Retire the Michigan tiebreaker designation. Write mechanism one-liners from the **union** of
stated mechanisms across sources. Where mechanisms conflict, record both. Where a mechanism
needs grounding beyond the handbooks, use the verification tier (FDA label for interaction,
LiverTox for hepatotoxicity), not another handbook.

### Three arguments
1. **Michigan won a two-horse race.** At the time of designation the verified pool was
 Michigan, Stanford (2004), UT Southwestern (a marketing page), and file metadata for
 everything else. It was a default, not a determination.
2. **Criterion 4 does not hold.** Michigan's currency was *inferred* from content markers
 (Envarsus, Mavyret, REMS, pomelo). Its revision date remains unlocated and sits in the
 registry as "not stated." UW states 11/2025 on its record page. On the criterion that
 mattered most, the newer source has evidence and the incumbent has inference.
3. **It solves a problem already solved elsewhere.** Mechanism one-liners are Insina's own
 words by copyright rule, so "whose wording wins" was never the question. The merge spec
 already records `mechanism_candidates` as distinct and explicitly does not merge them.
 A tiebreaker would override that — the same shape as the "default to one center"
 precedence rule already corrected earlier in this work.

### Michigan's actual contribution, verified from the full chapter
Not supplements. It names **exactly one**: St. John's Wort, with mechanism, naming all four
affected drugs. Everything else is the same class statement the other centers use.

Its real differentiators:
- **Pomelo** named alongside grapefruit, repeated per drug. Only UW also has it.
- **Explicit hedging on an uncertain trio.** Papaya, pomegranate, star fruit described as
 having very limited information available, with studies suggesting possible fluctuation.
 Not an avoid statement. `strength_as_written` must capture this as distinct, and it is a
 model for how Insina should phrase uncertain rows.
- **Acetaminophen with a number and a permission.** 2,000 mg per 24 hours, explicitly may be
 taken without contacting the team. No other source gives both.
- **NSAIDs with mechanism.** Interaction plus kidney failure, with brand examples. Most
 sources say only "avoid."

Those are food and mechanism strengths. They survive fine as **data contributions** without
Michigan holding authority over everyone else's wording.

---

## Verification tier addition

| Source | Detail |
|---|---|
| **Likhitsup et al., JAMA Network Open, Aug 2024** | "Estimated Exposure to 6 Potentially Hepatotoxic Botanicals in US Adults." DOI 10.1001/jamanetworkopen.2024.25822. NHANES 2017–2020. |

**Cross-referenced against LiverTox:**

| Botanical | LiverTox | 30-day prevalence | Leading reason given |
|---|---|---|---|
| Turmeric | A | 3.46% | joint health / arthritis (26.8% of users) |
| Green tea | A | 1.01% | energy (27.2%) |
| Black cohosh | A | 0.38% | menopausal symptoms |
| Ashwagandha | B | 0.38% | energy |
| Garcinia cambogia | B | 0.27% | weight loss (majority) |
| Red yeast rice | C | 0.19% | cholesterol |

4.7% of adults surveyed took at least one over 30 days; \~15 million adults regularly.
Five of six are LiverTox A or B.

**Turmeric is the highest-yield row in the table.** Most consumed by a wide margin, LiverTox
A, leading reason is joint pain. GB manages gout on allopurinol and colchicine.

**Constraint carried from the same work:** Fontana's analytical chemistry found roughly a
50% mismatch between labeled and actual ingredients. Item-level flagging has a ceiling
because of this, which independently supports keeping the class statement primary and item
rows as an enhancement layer.

**Tone to match.** The authors state they are not creating alarm, only raising awareness
that these products are untested and unproven; the study measured exposure without
establishing causation. Question-form output lands in that register. An avoid-list would
overstate the evidence.

**Caveats for the registry.** Population is US adults generally, not transplant recipients;
prevalence transfers while risk is amplified. The separate 70% increase in
supplement-related liver transplants (2010–2020 vs 1994–2009) is cited secondhand in the
press release and **must be verified at source before use anywhere.**

---

## Not encoded: "reputable brand is fine"

GB's hepatologist advised she is comfortable with herbal tea from a reputable company, and
that the questions lie with unknown or overseas sources. Well-supported: LiverTox has a
dedicated Chinese and Asian herbal medicine subsection with several top-scale entries
(Polygonum multiflorum and Shou Wu Pian at A; Ba Jiao Lian and Sho Saiko To at B), and
adulteration is a real driver of herbal liver injury.

**But it is two axes and the app must not collapse them:**
- **Product integrity** — is it what the label says? Brand reputation genuinely reduces this.
- **Intrinsic pharmacology** — even a correctly labeled product acts. A reputable-brand
 St. John's Wort still induces CYP3A4, arguably more reliably than a mislabeled one.

For brewed herbal tea her answer holds on both axes. For concentrated extracts the second
axis does not care about brand. **Insina must not encode brand reputation as a general
safety rule**, because the app cannot tell which axis a given product sits on.

---

## Open items carried forward

| Ref | Item | Owner |
|---|---|---|
| DEC-P41 | Store-and-replay vs transcribe-and-propose | GB |
| DEC-P42 | Retire the tiebreaker | GB |
| DEC-P37 | Formal acceptance of form-qualifier rule | GB |
| DEC-P26 | Adequacy gate operational definition | GB |
| — | Stanford 2004 eligibility | GB |
| — | Thresholds against final M(A). Set before extraction. | GB |
| DEC-P24 | Phase field: Tier 0 gate, transition UX (GB deferred) | GB |
| — | Verify whether GB's Ochsner notes contain the 3–5 range | GB |

---

## DEC-P43 — Confirmation unit by data type for archive-to-reconciled promotion
**Status:** Accepted (merged 2026-08-17; drafted 2026-08-16)
**Relation:** clarifies the two-tier ingestion contract (History Builder decision
set, pending merge — cross-reference to the originating entry completes when that
appendix lands). Implementation: WO_LAB_BATCH_CONFIRM_01 →
`feature/lab-batch-confirmation`.

**Context:** The two-tier ingestion contract requires explicit patient
confirmation of individual items before promotion from archive tier to
reconciled record. Read literally against laboratory data, this means one
confirmation action per analyte. At current record volume (approximately 3,000
lab entries) this is unusable, and structured ingest (C-CDA, FHIR R4) will
increase volume further. The safety invariant the contract protects is: no
unreviewed data enters the reconciled record. It is not: one confirmation
action per datum.

**Decision:**
1. The confirmation unit is defined per data type.
2. Medications and allergies: per-item confirmation, unchanged, never batchable. This remains binding.
3. Conditions, procedures, immunizations, encounters, and all other clinical assertions: per-item confirmation, unchanged. Per-item is the default for any data type not named in point 4.
4. Laboratory results and vitals: the confirmation unit is the source document or panel (batch). Batch confirmation requires a row-level review interface presenting the extracted table side by side with the source document.
5. Within batch review, the patient may exclude any row and may correct any row value, unit, or collection date before confirming. Corrections are patient actions. Extraction never auto-corrects. Flag, don't fix is preserved.
6. Three row conditions require individual acknowledgment before the batch confirm control enables: (a) out of range against the extracted reference range, (b) low extraction confidence, (c) monitored analyte per the transplant monitoring list (initially tacrolimus only; extensions governed through CSC, population-level, never conditioned on an individual patient's record).
7. Low-confidence rows default to excluded. Inclusion is an explicit patient action.
8. Excluded rows remain in the archive tier and may be promoted later through the same review flow. Exclusion is not deletion.
9. Every promoted row carries provenance: source document ID, page reference, extraction timestamp, confirmation event ID.
10. Invariant restated: nothing enters the reconciled record without explicit patient confirmation. Reports read only the reconciled record. Unchanged.

**Rationale:** Concentrates per-item friction where item-level error is directly
dangerous (medications, allergies) and replaces it elsewhere with a review
mechanism that preserves the invariant at real-world volumes. Prepares the
confirmation UX for structured ingest before that work is scheduled.

---

# Decision Log Amendment — Response Composition & AI Session Lifecycle (DEC-C1 … DEC-C15)

*Appended 2026-08-17 from DEC_DRAFT_RESPONSE_AND_SESSION.md rev 2 (drafted
2026-08-16). The C-series is its own namespace: response-composition and
session-lifecycle policy, distinct from the DEC-P corpus/pilot series.
Companion design doc: AI_SESSION_SPEC.md v0.3. These entries gate precaution
corpus extraction and INSINA_AI_PROMPTS.md v2.5. They do not gate, and are not
gated by, the History Builder activation preconditions. Implementation of the
deterministic shell: `feature/ai-session-shell`. [CONFIRM] markers inside
entries are open founder items, tracked in the spec's Sec 11.*

---

# Part A. Response composition policy

## DEC-C1: Claim typing. Numbers bind, mechanisms float

**Decision:** Every claim in patient-facing AI output is one of two types, and the type determines what may produce it.

A **bound claim** is any numeric clinical parameter: dose, daily ceiling, threshold, target range, frequency, duration, or count. Bound claims may originate only from (a) a cited corpus or handbook row, or (b) a fact in the patient's reconciled record. They render with their source visible. The AI may not compute, infer, convert, aggregate, or restate a bound claim outside its cited value. Unit conversion and arithmetic restatement (for example, expressing a ceiling as a tablet count) are prohibited: this is the C4P 3 g stated as six 650 mg tablets error, which is 3,900 mg.

A **mechanism claim** carries no number. It describes categories, mechanisms, interactions in kind, where a risk hides, and what the patient should check. Mechanism claims may be generated from AI general knowledge under the existing question-form and non-directive rules, and require no row.

**Considered and deferred:** a deterministic dose helper, system arithmetic computed from a cited row plus the reconciled tablet strength, is legitimately safe because it is not model output. Deferred until the validator has field history; the prohibition above applies to model restatement and should not fossilize into a ban on deterministic system arithmetic.

**Rationale:** Observed failure mode, repeatedly, is that AI general knowledge is directionally correct on category and mechanism and specifically wrong on numbers. Typing the claim lets the model do what it does reliably and blocks what it does not. This is also what makes AI worth having: a corpus of tens of rows projected by the model across an unbounded product and phrasing space, rather than an enumerated static FAQ.

## DEC-C2: Source hierarchy for bound claims, and gap disclosure

**Decision:** Bound claims resolve in this order.

1. **Tier 1.** The patient's own center or program document, when present in their record. Renders with document and page citation.
2. **Tier 2.** Vetted general corpus row. Renders as a labeled default with source and version, and states that the patient's own program may differ.
3. **Tier 3.** Neither available: the AI names the gap and does not supply a number. Example form: "Your center sets your daily ceiling; ask your coordinator what yours is."

**Tier 1 activation mechanism:** a patient handbook becomes citable through the platform's own contract applied to documents. AI extraction proposes candidate rows from the uploaded handbook; the patient confirms each row one by one against the rendered source page; confirmed rows carry document and page citation and enter the patient's Tier 1 set. Unconfirmed candidates are inert. No handbook content becomes a bound-claim source without patient confirmation.

Tier 2 rows are created offline: AI proposes candidate rows from reputable public sources (for example Mayo Clinic, UNOS, LiverTox, AASLD), a human reviewer verifies and cites, and the reviewed row enters the corpus with source, retrieval date, and version. **Live web retrieval is never a source for a bound claim in the response path.** Public sources may inform mechanism claims, which carry no numbers and therefore no binding risk.

**Rationale:** General-population figures are wrong for this population; the 4,000 mg acetaminophen ceiling on a general health page is the standing example. Web pages change without notice and cannot be reproduced at audit. A stored, reviewed, versioned row is a controlled document; a live lookup is an unreviewed claim with a URL attached. Gap disclosure rather than confident silence is existing policy.

**Unchanged:** drug-level trend interpretation content remains gated behind transplant-credentialed review regardless of source reputability. Sourcing does not substitute for that review.

## DEC-C3: Deterministic numeric validator

**Decision:** A deterministic post-pass scans every patient-facing AI response for numerals attached to clinical units (mg, g, mcg, mL, degrees F or C, mmHg, tablets, capsules, hours, days, ng/mL, and the maintained unit list). Each detected number must match a bound claim supplied in context, current versions only, either a cited row or a reconciled-record fact. An unmatched number blocks the response; the failure is logged and the patient sees a non-alarming retry or gap message. The validator contains no disease vocabulary: it knows a number appeared and looks for its source.

**Rationale:** Model proposes, rules dispose, the same philosophy as the tripwire engine. Numbers are mechanically detectable, which is precisely why this policy is verifiable where a general "no bad advice" rule never could be.

## DEC-C4: Tripwire independence and threshold row format

**Decision:** The deterministic tripwire engine continues to own all urgency and appends red-flag content independently of whether the corpus answered the question. Every tripwire row carries an explicit comparator, numeric threshold, unit, and measurement condition, plus its citation. Symptom-named rows without a threshold are drafts, not rows, and may not be activated. Thresholds are program-specific by nature and always render with their source.

**Rationale:** "Fever is a call" is unimplementable and clinically wrong; "temperature at or above 100.4 F, oral, single reading, call the coordinator" is deterministic and testable. Threshold variance across centers is real (100.4 versus 100.5, single versus repeated reading, call-now versus call-in-the-morning tiers) and the corpus must represent it faithfully rather than flatten it.

## DEC-C5: Escalation restraint

**Decision:** Questions answerable from a Tier 1 or Tier 2 row are answered with citation. Routing to a coordinator or physician is reserved for questions the corpus cannot answer and for tripwire-triggered urgency. Contacts render as a footer on corpus-answered responses, not as the headline.

**Rationale:** Routing a question the center's own handbook answers on page one burns the coordinator channel on non-escalation traffic and teaches the patient that the platform cannot answer anything, which trains them to stop calling when a call is warranted. Escalation only works if it stays rare. This does not weaken the tripwire engine, which escalates independently.

## DEC-C6: Patient posture

**Decision:** Response composition assumes the person asking before acting is the careful one. Output arms the checking instinct: name the category, name where the risk hides, tell them what to read on the label. Never scold, never imply the question was reckless.

## DEC-C7: Disease-agnostic engine, condition-scoped content

**Decision:** The composition engine, prompts, and validator contain no condition-specific vocabulary. All condition specificity lives in corpus rows, which carry a condition-scope field; the engine selects rows by the patient's reconciled conditions and applies multiple scopes together where a patient carries several. Corpus row IDs are condition-namespaced. Source hierarchy language stays generic ("your center or program document"), not transplant-specific.

**Rationale:** The policy above is general: bound numbers, floating mechanisms, deterministic urgency. Extending to anticoagulation, heart failure, dialysis, or oncology should require writing rows, not rebuilding architecture. The constraint is cheap now and expensive to retrofit after transplant assumptions harden into code. Per-condition tripwire thresholds and red flags still require the same clinician review as the transplant set; that gate does not generalize away.

## DEC-C14: Response frame and body shapes

**Decision:** Every response is an invariant safety frame plus a query-shaped body. The frame, identical for every response, carries claim typing, numeric validation, citations, the tripwire block, contacts placement, question-form rules, and session stamping; the model cannot alter, reorder, or suppress it. The body is presentation, selected by the model per query from a maintained shape set. v1 shapes: guidance (the full block stack, for symptom and what-can-I-take queries), lookup (direct answer with record citation, for questions about the patient's own data), and fallback. Explanation and visit prep are deferred; [CONFIRM] whether visit prep becomes a chat shape or routes to the Consultation Prep generator.

**Rationale:** A single fixed format built from one query class forces hollow scaffolding onto every other class. Splitting frame from body keeps every safety property invariant while presentation fits the query. A wrong shape selection costs presentation, never safety, which is why shape selection needs no validator of its own: AI proposes, applied to formatting.

---

# Part B. AI session lifecycle

## DEC-C8: Sessions replace the running AI Analysis feed

**Decision:** AI Analysis becomes a session index rather than a continuous feed. Opening or starting a session takes over the screen as a focused surface. The conversation continues within the session until the patient ends it. End actions: Save to Notes, Save and Print, Close.

*(Supersedes the running-feed surface of DEC-042. DEC-042's context-isolation rule — the API sees this session's turns only — continues, extended by DEC-C11's delimited prior-segment inclusion.)*

## DEC-C9: Saved sessions store the verbatim transcript, and print requires save

**Decision:** Saving stores the full verbatim transcript. No AI-generated summary is produced at save time or print time. Readability comes from a deterministic, system-composed header and the shape structure, not from summarization. Print is reachable only through Save and Print: every printed artifact has a stored counterpart. [CONFIRM] the print-requires-save rule; flagged for explicit founder confirmation.

**Rationale:** A summary is a second generation pass over content the numeric validator already cleared, and it can restate a bound number outside its citation and outside the check. The artifact's value is reproducibility: what the patient saw is what prints, and a printout handed to a physician must be reproducible from the stored record.

## DEC-C10: Close without saving warns, then discards

**Decision:** Closing without saving presents a warning and, on confirmation, discards the session content. Only the fact that a session occurred is logged; no content is retained.

## DEC-C11: Saved sessions reopen in-thread, append-only, with delimited prior context

**Decision:** A saved session reopens and continues in the same thread. Continuation appends a new segment with its own timestamp; existing segments are immutable and are never rewritten, re-rendered, or regenerated. On continuation, prior segments enter model context delimited by their stamps and marked as prior-state content; the numeric validator resolves bound claims only against current corpus rows and the current reconciled record, so a superseded value restated from an earlier segment blocks.

**Rationale:** Without prior segments in context, in-thread continuation is cosmetic. With them included naively, stale reasoning contaminates generation. Delimited inclusion plus current-only validation gives continuity without carrying forward superseded numbers.

## DEC-C12: Segment-level record-state and corpus-version stamping

**Decision:** Every session segment carries a stamp recording the record-state hash (DEC-C15) and corpus version in effect when it was generated. Reopening a session after either has changed renders a visible divider in the thread noting the continuation date and that the record has changed since the prior segment. Printed output carries the same dividers and stamps.

**Rationale:** Answers computed months ago were computed against a record that no longer exists. Without segment stamping, a printed transcript silently mixes stale and current reasoning under a single date, which is the C4P confident-presentation failure in a different form.

## DEC-C15: Record-state hash

**Decision:** The record-state hash is a deterministic serialization of the reconciled record only, in canonical field order, hashed. Archive-tier content, session content, and UI state are excluded. Any reconciled-record mutation changes the hash. This hash is the record-state component of every segment stamp.

**Rationale:** The reconciled record is the only tier the AI reads, so it is the only state whose change invalidates prior reasoning. A formal definition prevents the staleness feature from resting on an improvised versioning scheme.

## DEC-C13: Session print is the reference handoff format

**Decision:** Session print output is the reference implementation of the handoff document format: shield logo, patient identity block, generation timestamp, provenance and disclaimer furniture. The caregiver handoff feature, when built, reuses this format. The dependency runs from caregiver to session, not the reverse.

**Rationale:** The prior draft depended on a format that does not exist yet, since the caregiver feature is designed but unbuilt. Flipping the direction removes a backward dependency and gives the caregiver feature a shipped format to inherit.

---

**C-series open items:** [CONFIRM] print-requires-save (C9). [CONFIRM] visit prep routing (C14). [CONFIRM] session content encryption gate inheritance (assumed yes; the shell implements sessions in the vaulted store). [CONFIRM] retention behavior for saved sessions on record deletion. [CONFIRM] all patient-facing copy strings, including the warn-on-close text and the record-changed divider (provisional drafts live in src/lib/aiSessions.js SESSION_COPY).

---

# Decision Log Amendment: AI Launcher System and Provenance Mark (DEC-P47 to DEC-P51)

Merged 2026-09-02 from DEC_DRAFTS_AI_LAUNCHER.md (session 2026-08-30, amended 2026-09-02). IDs confirmed against the log: main ends at DEC-P43; DEC-P44 to DEC-P46 are held by the History Builder branch (feature/history-builder-01 cites them in code), so this set takes P47 to P51. Governs WO_AI_LAUNCHER_01.md. Founder decisions taken at merge are recorded inline under P50 and P51.

## DEC-P47: Provenance mark rule
Status: Settled

The Insina AI mark (four-point sparkle with heartbeat spike) appears on all model-generated content and only on model-generated content. Deterministic outputs never carry it: tripwire alerts, advisory text, the 911 and nearest-ED line, lab range flags, refill and appointment reminders, and anything the patient typed or confirmed. The mark is a provenance signal, not decoration. Its absence is as meaningful as its presence.

Rationale: makes "AI proposes, patient disposes" visible in the interface and gives the CDS memo a clean visual enforcement story.

Artwork note (2026-09-03): the full-cut mark was refined after founder review of the richer lockup artwork (harder-pinched arms, left-to-right deep-blue-to-cyan gradient, offset inner star, brighter core, taller heartbeat), vector-traced by hand and shipped in v1.58.1. The rule is unchanged; the simple 14px silhouette is unchanged.

## DEC-P48: Single destination for model output
Status: Settled

Model output renders in exactly one surface: the AI Analysis tab. All other screens may host launchers that deep-link into AI Analysis with scope pre-set, but never render model output themselves. The dashboard AI summary card is deferred and not approved; if revisited it must be a cached, marked, timestamped artifact of a prior run, never an auto-run.

Rationale: one surface for acceptance tests, scanner fixtures, CSC compliance checks, and the provenance mark to govern.

Merge note: two pre-existing surfaces render model output outside AI Analysis today (Appointments' Consultation Prep and the per-medication quick actions that auto-send through mi_ai_pending). They predate this decision, are outside WO_AI_LAUNCHER_01's scope, and are listed in that work order's session report for disposition.

## DEC-P49: Launcher placement and count discipline
Status: Settled

At most one launcher per screen, plus the AI Analysis nav row. Approved placements:

| Screen | Position | Label (verbatim) |
|---|---|---|
| Sidebar nav | AI Analysis row, mark at 14, pill removed | AI Analysis |
| Dashboard | Existing quick-launch panel only | existing v1.16 strings unchanged |
| Labs & Trends | One per panel header | Ask about this panel |
| Medications | One at list level | Review my medication list |
| Appointments | One per upcoming appointment | Prepare for this visit |
| Symptoms | After entry saves and tripwire pass returns clean | Prepare questions about this |
| Dashboard AI panel | Full-cut icon button above the hint and suggestions, wordmark `Insina AI` beneath it | icon button, aria-label Open AI Analysis |
| Topbar | Persistent full-cut icon button left of the avatar, every screen except Import Records and confirmation flows | icon only, aria-label Open AI Analysis |

Count discipline: at most one contextual launcher per screen. Persistent entries sit outside the count: the nav row, the topbar icon button, and the dashboard panel icon button. Entry buttons carry full-record scope and are the sanctioned icon-only exception; contextual launchers always carry a text label. The sub-brand string `Insina AI` renders verbatim and appears in-app only on the dashboard panel lockup; navigation vocabulary remains AI Analysis everywhere. The name enters the marketing and disclosure language review list as shipping patient-facing copy.

Prohibited zones: archive tier, Import flow, any confirmation screen, and any screen where a tripwire has fired for the displayed content. These exclusions apply to the topbar entry button as well. No floating global button. Per-row launchers on labs are prohibited: per-value urgency belongs to the tripwire engine.

## DEC-P50: Scope preview and consent to run
Status: Settled (amended at merge, 2026-09-02)

Tapping a launcher never triggers a model call. It navigates to AI Analysis with a scope object shown as removable chips ("Reads:" line) above the existing run control. The model call happens only on the patient's explicit run action. Scope travels through in-memory navigation state only: never in the URL, never persisted independently of the record. Removing all specific chips reverts scope to a single non-removable Full record chip. Scope may only narrow which reconciled-record slices are included; prompt templates and system prompts are untouched.

Amendment (founder decision, 2026-09-02): the three dashboard question launchers ("Analyze my current health status", "Review my medications for interactions", "Prep for Hepatology appt") are the explicit run action. Their labeled tap opens AI Analysis with full-record scope and sends the question immediately. Every other launcher, the Custom query launcher, and both entry buttons never run on tap. The question travels in the same in-memory scope object, replacing the previous mi_ai_pending localStorage hand-off for these buttons, which could resurrect through a Drive merge and re-run.

## DEC-P51: AI-off flag behavior
Status: Settled

All launchers, both full-cut entry buttons, and the quick-launch panel sit behind the single global AI-enabled flag. When off, launchers are hidden, not greyed. The AI Analysis nav row remains visible with the mark; the AI Analysis tab alone carries the off-state explanation.

Merge note (founder decision, 2026-09-02): no such flag existed in the code before this work order. It is created as `AI_FEATURES_ENABLED` in src/config/aiFeatures.js, defaulting to true, the same shape as the tripwire advisory's ship-dark constant. It gates the launchers, entry buttons, and quick-launch panel. The AI Analysis tab itself is unchanged: its only off-state copy today is the public demo's explanation, and the work order forbids new copy, so a pilot-off explanation is deferred to a later decision.

## DEC-P52: History Builder sequencing and structure

**Status:** Settled (Greg, 2026-09-10, on merge of WO_HISTORY_BUILDER_01 with his three dispositions; drafted as DEC-P44 in HISTORY_BUILDER_SPEC.md Appendix A)

**Source.** `C:\Documents\Medical\Insina\Decisions\HISTORY_BUILDER_SPEC.md`, Appendix A. Merged verbatim; the provisional P44 to P46 ids were taken by the AI session shell and launcher decisions, so these are P52 to P54.

**Decision: post-first-goal history capture proceeds by clinical stakes in six stages (safety spine, current state, recent care, transplant story, important past history, older records), surfaced as five areas (Current Health, Recent Care, Transplant History, Important Past History, Older Records optional). A single next-step prompt is ranked deterministically by report gaps. No completeness percentage anywhere. Emergency Packet readiness is announced at safety-spine completion. Stages are clinical roles, not calendar windows. Medications before conditions; labs before notes; import over typing.**

**Rationale: guaranteed value in under ten minutes; recency ordering misweights stakes; per-report readiness motivates where meters create homework.**

**Implementation note (at merge, 2026-09-10).** The builder is the `history` screen under Tools (`src/components/HistoryBuilderTab.jsx`, engine `src/lib/historyBuilder.js`). Disposition 2 (Greg, 2026-09-10): the builder's single next-step prompt renders as the first card in the dashboard's existing "Next steps" list (`src/components/onboarding/TaskCards.jsx`) rather than as a second card system; its copy, ranking, and per-session dismissal rule are the builder's own.

## DEC-P53: Two-tier ingestion contract

**Status:** Settled (Greg, 2026-09-10, on merge of WO_HISTORY_BUILDER_01 with his three dispositions; drafted as DEC-P45 in HISTORY_BUILDER_SPEC.md Appendix A)

**Source.** `C:\Documents\Medical\Insina\Decisions\HISTORY_BUILDER_SPEC.md`, Appendix A. Merged verbatim; the provisional P44 to P46 ids were taken by the AI session shell and launcher decisions, so these are P52 to P54.

**Decision: documents ingest to an archive tier (stored, searchable, inert) by default. Structured data enters the reconciled record only through patient-confirmed staged items, whether sourced from extraction, deterministic lookup, or manual entry. Reports draw exclusively from the reconciled tier, enforced at the data layer. No auto-correction, no silent merge. AI extraction is gated; the pilot ships the staged manual path.**

**Rationale: the reconciled layer is the defensibility claim; per-item confirmation preserves AI proposes, patient disposes; archive-without-obligation removes data-entry homework.**

**Implementation note (at merge, 2026-09-10).** Disposition 3 (Greg): one staging store. Builder proposals live in the onboarding staging queue (`mi_onboarding_staged`) as items with an `hb` marker and are accepted through `onboardingConfirm.confirmItemToRecord`, the same per-item write path the document review uses; `src/lib/stagedItems.js` is a view over that queue. Disposition 1 (Greg chose the reports rule; applied conservatively): the four print generators read the reconciled-only accessor (`src/lib/reportData.js`); Consultation Prep's AI context (`Tab14 buildDocContext`) still reads matched document text because nothing in WO 01 can mark a document `linked`, so applying the rule there would remove every document excerpt from prep. That change is the logged follow-up, to land with the first linking path.

## DEC-P54: First-goal selector retained

**Status:** Settled (Greg, 2026-09-10, on merge of WO_HISTORY_BUILDER_01 with his three dispositions; drafted as DEC-P46 in HISTORY_BUILDER_SPEC.md Appendix A)

**Source.** `C:\Documents\Medical\Insina\Decisions\HISTORY_BUILDER_SPEC.md`, Appendix A. Merged verbatim; the provisional P44 to P46 ids were taken by the AI session shell and launcher decisions, so these are P52 to P54.

**Decision: the safety spine is invariant and completes first on every path; Emergency Packet readiness is announced on all paths. Goal selection is implemented as a deterministic boost profile over standard prompt ranking plus goal-aware context suffixes on S1 prompts. Single exception: the appointment-prep goal captures the target appointment before the spine. Skip yields base order with no suffixes. Absent or unmapped goal values resolve to skipped.**

**Rationale: every report's readiness depends on the spine, so the spine is the first mile of every goal, not a toll. The selector captures motivation at the cost of one tap. The base order exists regardless for skippers, so removing the selector deletes no logic and loses the patient's first act of agency.**

**Implementation note (at merge, 2026-09-10).** Goal comes from the onboarding wizard's stored selection via `mapWizardGoal`; the appointment anchor is C-28. `medConditionMap.json` (14 entries) and the three ranking constants in `historyBuilderConfig.js` stay REVIEW_REQUIRED for the clinical review packet.


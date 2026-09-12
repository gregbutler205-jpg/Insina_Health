# Changelog

All notable changes to Insina Health are recorded here. This project follows
[Semantic Versioning](https://semver.org/): **MAJOR.MINOR.PATCH**

- **MAJOR** — large redesigns or breaking changes to how data is stored
- **MINOR** — new features (e.g. a new tab or section), backward-compatible
- **PATCH** — bug fixes and small tweaks

At the end of a working session, bump the version in `package.json`, add an
entry here, then tag the release in git (`git tag v1.5.0 && git push --tags`).

---

## v1.66.0 (2026-09-11)

### Added
- **Glucose on the dashboard, and vitals tiles that open their history.**
  Current vitals now shows four tiles: blood pressure, weight, temperature,
  and glucose (Greg, 2026-09-11; DEC-051 amended). Glucose flags red above
  125 or below 70 mg/dL, the Vitals screen's out-of-range rule. Every tile is
  a button: it opens the Vitals screen with that vital's history selected.
  `npm run test:dashboard-feed` pins the tiles and the hand-off.

## v1.65.2 (2026-09-11)

### Fixed
- **Open on the History Builder's Next step card did nothing.** On the
  builder screen the card's Open button was wired to an empty handler. It now
  opens the screen where that step is done: Medications, Care team (allergies
  and care team), Health profile, Conditions, Labs, Documents, Medical
  records, or Appointments, by prompt. The Dashboard copy of the card still
  opens the builder, as DEC-P52 set. `npm run test:history-builder` pins the
  map.

## v1.65.1 (2026-09-11)

### Changed
- **Appointment cards in Your updates open the appointment.** The card's
  button was the "Prepare for this visit" AI launcher; it is now "View
  appointment" and lands on that appointment (Greg, 2026-09-11). Prepare for
  this visit is still offered on the appointment itself.

## v1.65.0 (2026-09-11)

### Added
- **Choose how much of your record a question reads (DEC-067).** The "Reads:"
  line in AI Analysis now offers Core record and Full record. Core record is
  the default: profile, conditions, medications, allergies, labs and vitals,
  but not your reference documents or the findings extracted from them. Full
  record adds the documents, which is what most of the cost, the model's
  thinking time and the "record too large" errors came from. Medications,
  allergies and conditions ride on every setting so the safety checks keep
  working. The choice persists. Launcher chips (a lab panel, the medication
  list, a symptom) still narrow harder and replace the chooser while present.
  When you are on Core record, have documents on file, and your draft
  question mentions a note, report, scan or procedure, a one-line hint offers
  to switch. `npm run test:ai-launchers` pins the slices per setting.

## v1.64.1 (2026-09-11)

### Fixed
- **AI Analysis answered with an empty bubble.** On the Claude 5 models the
  thinking the model does before writing counts against the reply budget. A
  hard question on a full record in Advanced Mode (Opus 5) spent the whole
  2048-token budget thinking, streamed no text, and the chat posted a blank
  reply and said nothing (the question still counted). Two changes: the chat
  budgets doubled (Standard 2048, Advanced 4096, the proxy's cap) so thinking
  has room; and a stream that ends with no text is now an error in the
  transcript that says why ("used its whole answer budget thinking" or "ended
  the reply before writing anything"). A reply that was cut off mid-answer
  carries a visible note. Error frames mid-stream (overloaded, api_error)
  surface instead of being swallowed. `npm run test:ai-response` pins the
  parser against streams captured from the live proxy.

## v1.64.0 (2026-09-11)

### Changed
- **Old AI chat threads now live inside the vault (OPEN-17b).** Chats from
  before the session shell (v1.50) were stored under a key the vault never
  covered, so they sat in plain text, were left out of Drive and folder
  backups, and survived Erase & Start Fresh. Migration v5 moves them to
  `mi_ai_chat_legacy` and the mode/send audit log to `mi_ai_log` on the next
  unlock: both are encrypted at rest, backed up, and erased with everything
  else. Search still finds the old threads. The mode choice and the daily
  question counter stay where they were (no clinical content; the first-run
  mode modal reads the choice before the vault matters). A target that already
  exists absorbs the moved data rather than replacing it, and a move whose
  target does not land leaves the source untouched and retries next boot.
  `npm run test:chat-key-migration` pins it.

## v1.63.1 (2026-09-10)

### Fixed
- **Imports and AI analyses failed on the Claude 5 models.** Sonnet 5 and
  Opus 5 return a "thinking" block before the text block, so every place that
  read the first content block as text failed with "Cannot read properties of
  undefined (reading 'trim')": document and lab PDF imports, lab analysis and
  questions, note summaries, document summaries, consultation prep. One
  extractor (`responseText` in `src/lib/aiClient.js`) now takes every text
  block; the proxy's OCR route does the same (Render redeploy needed).
  `npm run test:ai-response` pins it.
- **Lab trend line ran past the chart.** Readings without a numeric value were
  skipped but their positions were not, so the line and its dots were placed
  beyond the right edge and the date labels overlapped. Plotted points are
  spaced by their own count, and date labels thin to at most eight.

## v1.63.0 (2026-09-10)

WO_HISTORY_BUILDER_01 merged (DEC-P52, DEC-P53, DEC-P54), built 2026-08-12 on
`feature/history-builder-01` and reconciled onto the current shell with Greg's
three dispositions of 2026-09-10.

### Added
- **History Builder** (Tools group, `history`): one next-step prompt at a time
  across five areas (Current Health, Recent Care, Transplant History,
  Important Past History, Older Records), list attestations (medications,
  allergies, conditions confirmed by the patient), per-report readiness, a
  deterministic med-to-condition lookup that proposes at most one condition per
  session for the patient to confirm or decline, and a two-tier document
  contract: uploads are archive-tier by default and report generators read a
  reconciled-only accessor (`src/lib/reportData.js`). Migration v4 seeds
  `mi_attestations` and `mi_history_builder` and stamps existing documents
  archive-tier. `npm run test:history-builder` (in prebuild).
- **Provenance lines** on the Medication List, Patient Profile, Consultation
  Prep, and Emergency Card printouts ("Medication list confirmed by patient on
  ...") when the patient has confirmed that list.

### Changed (dispositions)
- The builder's next-step prompt renders as the first card in the dashboard's
  "Next steps" list instead of as a second card system.
- The builder's staged items live in the onboarding staging queue and are
  accepted through the same confirmed-item write path; there is no second
  staging store.
- Consultation Prep's AI context keeps reading matched document text (nothing
  can mark a document "linked" yet); the printed reports read the reconciled
  accessor only. Applying the reports rule to the AI context is logged as the
  open follow-up.

## v1.62.2 (2026-09-10)

### Changed
- **Readable dim text everywhere (DEC-050 amendment).** The three greys the
  code used for secondary text and icons (`#4a5c6a`, `#4a6070`, `#6a8090`)
  become the dim-text token value `#8299ad` in every text and icon use (101
  places across 25 files); fills and borders are unchanged. This closes the
  color-contrast failures the accessibility pass left open.

## v1.62.1 (2026-09-10)

### Changed
- **Claude 5 models.** Standard mode and extraction use `claude-sonnet-5`,
  Advanced mode uses `claude-opus-5` (the companion's lite tier stays on
  `claude-haiku-4-5`). The Render proxy was redeployed by Greg on 2026-09-10 with
  an allow list that accepts both generations, which is what the v1.52.1
  rollback was waiting for. Settings copy names the new models.

## v1.62.0 (2026-09-07)

WO_DASHBOARD_POLISH_02, Greg's six items after the v1.61.0 deploy (DEC-058 to
DEC-062). Unmerged on `feat/dashboard-polish-02` pending review.

### Changed
- **Icon rail.** The collapsed sidebar shows the shield mark and lists only
  the Today and My health screens; Records and Tools are one icon each and
  open a flyout beside the rail. Emergency Information stays pinned.
- **One top bar everywhere.** Medications, Labs, Vitals, Symptoms, and Insina
  AI render the shared top bar (collapse toggle, Home on every screen except
  the dashboard, Emergency, search, date, Import records, bell, Insina AI,
  avatar). Their own actions sit in a slim bar under it.
- **Reports** prints the Patient Profile in one step with every stored card,
  lists the Lab Report, and every print from Reports runs the record preflight
  first (the Emergency Card runs the ED Prep checklist).
- **Shield mark.** The rail and the onboarding welcome screen use the new
  shield art.
- **Print consistency.** One Print button on every screen, one report shell
  for every printout (the Emergency Card, the consent record, and the AI
  session document keep their layouts), and the preflight check before every
  print. Vitals, Documents, Notes, Conditions, Procedures, Diagnostics, and
  the lab entries on Import print a report instead of the screen itself. The
  lab report and per-answer AI printout now escape every value.
- **Reference** (Care team) sections each open with a "may not include
  every ..." line.

### Added
- `src/lib/printShell.js`, `src/lib/printProfile.js`, `src/lib/printReports.js`,
  `src/components/PrintButton.jsx`, `src/components/TopBar.jsx`;
  `npm run test:print-shell` (in prebuild).

## v1.61.0 (2026-09-07)

WO_DASHBOARD_FEED_01, the dashboard restructure under DEC-051 to DEC-057.
Unmerged on `feat/dashboard-feed-01` pending review.

### Changed
- **The dashboard is a feed.** Greeting with an attention count and "Last
  updated", a conditional emergency strip (engine text, no dismiss), five
  quick actions (Log vitals, Medications, Appointments, Symptoms, Reports)
  with badges that hide at zero, one "Your updates" column (flags, then
  pending review, then out-of-range results, then appointments and refills by
  date; five shown, then View all), three vitals, and a right rail with Who
  to call and the Insina AI panel. Flags are acknowledged, never dismissed;
  every other card can be dismissed until the item changes.
- **Top bar and sidebar.** Menu toggle, Emergency, search icon, date, Import
  records, bell (passive events), Insina AI mark, avatar menu (Profile,
  Settings, Backup, Log out). Sidebar in four groups (Today, My health,
  Records, Tools), a 96px icon rail, sentence-case labels, Reports row.
- **Reports** is the print center: Emergency Card, Consultation Prep,
  Medication Report, Patient Profile.
- **Em dash cleanup** across product copy (567 rewrites); prompts, tripwire
  text, comments, and spec-pinned strings untouched.

### Added
- Record keys `mi_dashboard_dismissals` and `mi_flag_acknowledgments`
  (vault-managed, synced). `npm run test:dashboard-feed`. Dashboard fixtures
  for `npm run test:a11y` (`--fixture feed-empty|feed-flag`).

## v1.60.0 (2026-09-06)

WO_ACCESSIBLE_TOKENS_01, the mechanical accessibility pass under DEC-049
(accessibility baseline) and DEC-050 (accessible token amendment). Unmerged
on `feat/accessible-tokens-01` pending chat-level code review.

### Changed
- **Accessible color tokens.** Text and icon uses of the danger red, success
  green, and accent blue move to the DEC-050 values (#f87171, #2dd4a0,
  #6ea3ff); borders and dividers move from #0d1a28 / #111e30 to #1c2a40; the
  dim text in the password field moves to #8fabc7. Definitions in
  `index.css` and the companion, search, and profile palette objects change
  with them, and a new `--accent-blue` carries the text and interactive
  accent while `--accent` stays the brand fill. Filled buttons, avatar
  gradients, indicator bars, data-record swatches, and every print surface
  keep their previous colors on purpose; the session report lists each.
- **12px floor.** Every font size below 12px in app code (1,017
  declarations across 52 files) is raised to 12px. Print templates are
  untouched.
- **44px hit areas.** Buttons, role=button elements, selects, text areas,
  text inputs, and links present at least a 44px box; icon buttons keep
  their icon size and grow their hit area. An `.a11y-compact` opt-out exists
  for a control that cannot reach 44px without a layout change.
- **Visible focus everywhere.** One global `:focus-visible` ring (page
  colored gap plus accent-blue) replaces the onboarding-only outline.
- **Sidebar icons.** The unicode navigation glyphs become lucide-react icons
  beside their labels; the AI Analysis row keeps the Insina AI mark
  (DEC-P47).

### Added
- `npm run test:a11y`: axe-core WCAG 2.x A/AA check plus before/after
  screenshots of the five main routes at 1280px and 390px, run in a local
  Chrome against the fictional demo record (`scripts/a11yAxe.mjs`,
  `a11y-report/` output, git-ignored). Opt-in until the deploy pipeline
  decision is made.
- Dependencies: lucide-react 1.41.0 (runtime), axe-core 4.13.0 and
  puppeteer-core 25 (dev).

## v1.59.0 (2026-09-03)

### Added
- **Procedures now suggests itself from your records**, the same way
  Conditions does. A built-in scan reads Diagnostics, My Notes, Medical
  Records, and the full text of imported documents for procedures that are
  described there but missing from your Procedures list (a CESI in a pain
  management note, a colonoscopy in a discharge summary, "status post liver
  transplant" anywhere) and surfaces them under "Suggested from your
  records" with the document's date and the sentence they appeared in.
  Confirm opens the normal Add Procedure form pre-filled with the name and
  that date; Dismiss tombstones it. Runs once a day when you open the tab or
  on the "⟳ Scan Records" button, with the same landing notice as Calendar
  Sync. Deterministic and offline. Guards: anything merely scheduled,
  recommended, discussed, or a candidate for is not history and is not
  suggested; family members' procedures are not suggested; procedures
  already on the list (from Procedures or from Procedure-typed Medical
  Records) are never re-suggested.
- **Import Records offers a "Procedure Note" type.** It files as a Procedure
  record, which the Procedures tab already lists directly. Before, only
  Pathology mapped there, so a procedure note imported as a Clinical Note
  never reached Procedures.

### Changed
- The Conditions and Procedures scans share one mention-matching engine
  (src/lib/recordMentions.js); the Conditions behaviour and its 40 tests
  are unchanged.

### Tests
- New `test:procedure-suggest` suite (39): the CESI case, planned-versus-
  done guards, abbreviation safety, exclusions, tombstones, lifecycle, and
  Tab16 / import / sync-stamp wiring. 24 suites.

---

## v1.58.3 (2026-09-03)

### Changed
- **Companion bottom bar: six uniform tabs.** Today, Meds, AI, Record, Log,
  Care. The AI spark (the Insina AI mark) joins the bar and opens AI chat;
  Record is the same size as every other tab and keeps only its red tint
  instead of the oversized raised button; inactive tabs are brighter, with a
  blue top rule on the active one. The Today screen's AI chat shortcut uses
  the mark too.
- **Companion Today: the visit card is a link.** Tapping the imminent-visit
  card body opens the appointment page (Care tab) for directions and visit
  prep; its Start button still launches capture directly. The Next visit
  tile already did this.

### Tests
- Bar order, mark usage, Record sizing, and the Today tap-throughs pinned in
  `test:ai-launchers` (67).

---

## v1.58.2 (2026-09-03)

### Fixed
- **Directions go to the appointment's actual location.** On the phone
  companion (and the web Appointments tab) the Directions button built a
  Google Maps search, which listed places to pick from instead of routing,
  and the companion hid the button unless the appointment carried an
  address. Both now open Google Maps directions from your current location
  to the appointment: its own address first, otherwise the matching care
  team member's address (by provider, then by facility), otherwise the
  facility name.

### Tests
- Destination resolution and both surfaces' wiring pinned in
  `test:appt-tombstones` (40).

---

## v1.58.1 (2026-09-03)

### Changed
- **Richer Insina AI mark on the full-cut surfaces** (founder review of the
  new lockup artwork, vector-traced by hand). The topbar and dashboard entry
  buttons and the AI Analysis header now draw the star with harder-pinched
  arms, a deep-blue-to-cyan gradient running left to right, a second
  lighter star set low-right for depth, a brighter core, and a taller,
  sharper heartbeat. Below 40 px the compact single-spike rule still
  applies. The 14 px single-color silhouette on the nav row and launchers
  is unchanged.

---

## v1.58.0 (2026-09-02)

### Added
- **The Insina AI mark and the launcher system** (WO_AI_LAUNCHER_01,
  DEC-P47 to DEC-P51). The four-point sparkle with a heartbeat spike now
  marks model-generated content and its launchers, and only those: the AI
  Analysis nav row (pill removed), a full-cut entry button in the topbar on
  every screen except Import Records, and the dashboard AI panel's new
  lockup (entry button above the `Insina AI` wordmark). Contextual
  launchers deep-link into AI Analysis with scope pre-set: "Ask about this
  panel" on each Labs & Trends category header, "Review my medication list"
  on Medications (replacing the old AI Interaction Check button), and
  "Prepare for this visit" on each upcoming appointment. AI Analysis shows
  the scope as removable "Reads:" chips above the composer; removing them
  all reverts to a single Full record chip. Scope narrows only the data
  slices the run reads (labs by panel, vitals, documents); conditions,
  medications, allergies, care team, and the safety envelope always ride.
- **Consent to run.** Tapping a launcher or entry button never calls the
  model: it sets scope and navigates. The three dashboard question buttons
  are the deliberate exception (founder decision, DEC-P50 as amended): their
  labeled tap is the run. The old localStorage hand-off for those buttons is
  gone with it.
- **AI features flag.** `AI_FEATURES_ENABLED` (src/config/aiFeatures.js,
  default on) hides every launcher, both entry buttons, and the quick-launch
  panel when off; the nav row keeps its mark.

### Not built
- Symptoms launcher: symptom saves run no tripwire evaluation, so there is
  no clean state to gate on (work-order Tier 1 halt, awaiting a decision).

### Tests
- New `test:ai-launchers` suite (58): components rendered for real via
  esbuild + react-dom/server (traces by size, unique ids, aria contract,
  flag-off hiding), plus provenance allowlist, prohibited zones, no-URL and
  no-network checks, placement audit, and an em dash scan. 23 suites / 970
  cases.

---

## v1.57.2 — 2026-09-02

### Fixed
- **Vitals synced from the phone now show on the dashboard.** A Drive
  merge appends the other device's readings at the end of the stored
  array, and the dashboard's "latest" pickers trusted storage order — so
  phone-entered vitals appeared on the Vitals tab (which sorts by date)
  but not on the dashboard's Current Vitals panel or hero card. Every
  dashboard read of the readings store now sorts newest-first (the
  companion already did).
- The Current Vitals panel's per-reading date now reads mm/dd/yyyy (a
  spot the v1.56.2 format sweep missed).

### Tests
- Structural + behavioural pins in `test:dashboard-sync` (18) — the
  suite that owns "dashboard, Vitals, and companion always agree."
  22 suites / 912 cases.

---

## v1.57.1 — 2026-09-02

### Fixed
- **The phone companion stays signed in to Google.** The redirect sign-in
  relaunches the app locked, and the vault's managed-key rule silently
  dropped the sign-in profile write — so every relaunch showed "Connect
  Drive / Sign in" and the phone never synced on its own again (found live
  on Greg's phone: "Synced 11:56 PM" beside a Sign in button). The unlock
  handler now re-persists the profile while the redirect's token is still
  alive.
- **Per-device bookkeeping stamps no longer ride the Drive file.** The
  "last synced / last calendar sync / last folder backup / last condition
  scan" stamps are each device's own clock; synced copies suppressed the
  other device's daily auto-runs and — stranded in the Drive file — kept
  failing to decrypt and tripping a scary "different vault key" warning
  even though every real store merged fine. Excluded on upload and merge,
  so stale copies already in Drive are ignored from now on.
- Onboarding suite: a hardcoded fixture date rotted into "today" on
  2026-09-01 and failed the upcoming-appointment check; now computed
  dynamically.

### Tests
- Both fixes pinned in `test:vault-restore` (24). 22 suites / 907 cases.

---

## v1.57.0 — 2026-08-31

### Added
- **Conditions now suggests itself from your records — Calendar-Sync style.**
  A built-in scan reads what's already written in your record — Diagnostics
  impressions, My Notes, Medical Records, Procedures, and the full text of
  imported documents (which is how Labs & Trends contributes: the words on
  the lab paperwork, never inference from values — founder decision) — and
  surfaces condition names that aren't on your Conditions list. Suggestions
  wait in a "Suggested from your records" section with provenance (which
  record, when, and the sentence it appeared in); nothing joins your
  Conditions list until you Confirm (which opens the normal Add Condition
  form to review first) or Dismiss (tombstoned — never suggested again).
  Scans run once a day when you open the tab, or on the "⟳ Scan Records"
  button; new finds pop the same style of notice as Calendar Sync.
  The scan is deterministic and offline — no AI involved — and guards
  against false alarms: "no evidence of", "denies", "rule out", and
  family-history mentions are never suggested, facility and provider names
  are never scanned, and a condition already on your list (any status) is
  never re-suggested.

### Fixed
- Daily auto-scan and calendar auto-sync timers now arm their once-only
  flag when they fire rather than when scheduled (dev-only React
  StrictMode issue; production behavior unchanged).

### Tests
- New `test:condition-suggest` suite (40): matching, negation and
  family-history guards, word boundaries, source coverage, exclusions,
  tombstones, lifecycle, and Tab15 wiring pins. 22 suites / 903 cases.

---

## v1.56.2 — 2026-08-30

### Changed
- **One format for every phone and date field.** Phone fields read
  (xxx)xxx-xxxx and date fields mm/dd/yyyy, app-wide: Health Profile,
  Care Team, Appointments (including the attach picker and quick-add),
  Medications refills, Labs & Trends, Vitals tables, Conditions,
  Procedures, Diagnostics, Records, Notes, Source Documents, Import
  History, Settings backups, the dashboard stat cards, the mobile
  companion, and the printed documents (Patient Profile, Emergency Card,
  Medication List, Labs report, AI Session). Two shared helpers in
  displaySafe.js replace the per-tab formatters; phone inputs format as
  you type. Display-only — stored data is untouched (dates stay ISO on
  disk), numbers that aren't clean US phones (extensions, 7-digit) render
  as stored, and unparseable date text renders as typed. Styled long-form
  dates on cards and print headers (e.g. "Sat, September 5, 2026") keep
  their designed look, per Greg's scope call.

### Tests
- New `test:field-formats` suite (32): progressive typing, legacy-format
  conversion, 11-digit/extension edge cases, UTC day-shift guards, and
  no-local-duplicates pins. 21 suites / 863 cases.

---

## v1.56.1 — 2026-08-30

### Added
- **Calendar sync tells you where the appointments went.** Synced events
  wait in the Suggested tab for review — they never go straight onto the
  schedule — but the inline banner saying so was easy to miss. Any sync
  (manual or the once-a-day auto-sync) that imports appointments now pops
  a notice: how many arrived, that they're in Suggested, and that each one
  needs Confirm or Dismiss.

### Fixed
- **The Review shield no longer flags labs without a unit.** Many results
  legitimately have none (ratios, counts, qualitative results), so the
  "no unit recorded" warning nagged on every imported panel. Other lab
  checks (future dates, duplicates, missing reference ranges, implausible
  values) are unchanged.

### Tests
- Sync-notice wiring pinned in `test:appt-tombstones` (30); the unit rule
  pinned behaviorally in `test:lab-batch` (89). 20 suites / 836 cases.

---

## v1.56.0 — 2026-08-30

### Added
- **Add a provider to your Care Team without leaving the appointment.** A
  "+ Add to Care Team" link beside the Provider field opens a small form
  (name, role, specialty, facility, phone) over the appointment. Saving
  writes the member to the Care Team, fills the provider into the
  appointment (plus specialty, facility, and phone where blank), and
  returns to the form exactly as it was — nothing typed is lost. Address,
  email, and the rest can be added later on the Care Team tab.
- **Attach picker pages through every record.** Below the suggested
  matches, "All records" now lists everything newest-first, ten at a time,
  with a "Load 10 more" button (and a running "showing X of Y" count).
  Save Attachments and Cancel stay reachable at every page size.

### Changed
- **Completed and All appointment lists read newest-first** — the most
  recent visit sits on top. Upcoming and Suggested keep soonest-first, so
  what's next stays on top there.
- **The AI session report drops the "Contact your care team" roster.** It
  re-listed the entire care team on every printed session. The
  consolidated "Questions for your care team" block stays.

### Tests
- Appointment list direction, attach-picker paging, and the quick-add
  provider flow pinned in `test:appt-tombstones` (27); the roster removal
  pinned in `test:ai-session-shell` (65). 20 suites / 831 cases.

---

## v1.55.0 — 2026-08-29

### Added
- **One-click duplicate cleanup on Labs & Trends.** Re-uploading the same
  lab document stacks identical rows; a new "Remove N exact duplicates"
  button removes them, keeping one copy of each result — preferring the copy
  with import provenance. Exact means same analyte (alias-aware, so "PSA"
  and "Prostate Specific Antigen" count as one), same collection date, same
  value, same unit; anything less identical is never touched and stays in
  the patient-confirmed Group Tests flow. Removed rows are tombstoned so no
  device's sync resurrects them, and the restore healer now recognizes an
  equivalent row as already present — cleanup and healing can't fight.

### Tests
- Cleanup semantics (alias-equivalence, provenance-preferred keeper,
  tombstoning, distinct results untouched) and the healer guard pinned:
  `test:lab-batch` 87. 20 suites / 818 cases.

### Fixed
- **Searching "PSA" finds your PSA results.** Extraction names the same test
  differently per report ("PSA" on one, "Prostate Specific Antigen" on
  another), which split one analyte's history and hid it from search. The
  canonical alias table gains the total-PSA forms (free PSA stays separate —
  it's a different test), and Search now matches through canonical ids, so
  abbreviations find formal names (and FK506 finds Tacrolimus). Trends
  group the split history automatically through the same table.

### Notes
- Import receipts confirmed no data was being lost in the latest imports:
  rows file under their COLLECTION dates (a 2023 lab report lands in 2023,
  not at the top of the list), which made deep-history imports look missing.

### Tests
- PSA aliasing (formal name, total variants, free-PSA exclusion) and the
  canonical search haystack pinned: `test:record-query` 60.
  20 suites / 811 cases.

### Fixed
- **Imported lab results stop being erased — and yours come back.** Adding
  a manual lab entry on Labs & Trends (or saving/editing/deleting one in
  Import Records) rewrote the entire lab store from what that screen had
  loaded when it opened — silently erasing every row a PDF import had added
  since. That's why confirmed imports appeared in Import History but not in
  Labs or search. Every lab write now rebuilds from a fresh read of the
  store (the same fix the profile got in v1.53.4), Labs & Trends refreshes
  when data lands while it's open, and a self-healer restores any promoted
  row that a past erasure removed: your confirmed documents are the
  authoritative record, so the rows return automatically — with their
  original confirmation provenance — the next time you open Labs & Trends
  or Import Records. Excluded and pending rows are never auto-restored;
  only what you confirmed.

### Tests
- Healer behavior (restores exactly the promoted rows, keeps provenance and
  flags, idempotent, never touches excluded/pending) and fresh-read writes
  on both tabs pinned: `test:lab-batch` 80. 20 suites / 805 cases.

### Added
- **Preview Report on AI sessions.** A new button between Save & Print and
  Close shows the full session report in-app — the entire conversation with
  every part, stamp, and divider, built by the exact same code the print
  uses, so what you preview is what prints. A Save & Print button inside
  the preview runs the standard flow (saves to Notes first, then prints),
  keeping the every-printout-has-a-stored-counterpart rule intact.

### Removed
- **The per-response "Open as report" link** on individual AI answers — it
  covered only one answer at a time and is replaced by the whole-session
  preview.

### Tests
- End-actions order, shared print/preview builder, and the retired opener
  pinned: `test:ai-session-shell` 61. 20 suites / 796 cases.

---

## v1.53.6 — 2026-08-28

### Fixed
- **Multi-document lab batches review each document's own rows.** Confirming
  a document in a batch advanced to the next one, but the review screen kept
  the FIRST document's rows — every later document in the batch was reviewed,
  and its archive overwritten, with document one's results. The review now
  fully resets per document. Verified end-to-end with a real three-PDF batch:
  nine unique rows, one per analyte, each document reviewed as itself.
- **Import History shows your imports again.** The history screen read a
  storage key nothing ever wrote, so it had rendered empty since it shipped —
  hiding outcomes like "All rows excluded" exactly when they explained where
  an import went. It now reads the live log.

### Tests
- Both regressions pinned structurally: `test:lab-batch` 71.
  20 suites / 791 cases.

### Changed
- **Profile-printout notice moved into the header, left-justified.** The
  transplant and allergies lines now sit under your demographics in the
  header's left column, sharing the row with the "Personal Health Record"
  brand block — no longer a standalone band between header and sections.
  Still 10pt red type, short-form wording.

### Tests
- Placement pin updated: `test:profile-sync` 49. 20 suites / 788 cases.

### Fixed
- **Profile edits stop resurrecting old values of other fields.** Saving any
  Health Profile section rebuilt the whole stored object from the screen's
  state as loaded when the tab opened — so if a background Drive sync had
  landed newer values meanwhile (a changed address, say), the save silently
  wrote the old values back with a fresh edit stamp, which then WON the
  newer-edit-wins merge on every device. This is how an updated address kept
  reverting. Saves now merge the typed edits over a fresh read of the stored
  record, and the screen picks up background syncs the moment they land.
  Verified live: with a newer address landed mid-session, a phone-only save
  keeps the new address; under the old code it restored the stale one.

### Tests
- The fresh-read save base and sync-refresh listener pinned:
  `test:profile-sync` 49. 20 suites / 788 cases.

### Changed
- **Profile-printout notice, third pass per founder review:** 10pt (down
  from 14pt), both lines right-justified, and the transplant line shortened
  to "LIVER TRANSPLANT RECIPIENT" — the immunosuppression suffix is trimmed
  on the profile only. The Emergency Card keeps the full "…ON
  IMMUNOSUPPRESSION" text: an ED needs that half. One shared derivation
  still drives both documents.

### Tests
- Pins updated: `test:profile-sync` 45 (short-form + right-justified 10pt),
  `test:print-csp` 49 still guards the Emergency Card's full text.
  20 suites / 784 cases.

### Changed
- **Profile-printout notice restyled per founder review.** The transplant
  line is now 14pt red type with no box, centered between the header and the
  Demographics section, and an allergies line joins it (names only — "No
  allergies recorded" stated explicitly when the list is empty, since absent
  data is not the same as no known allergies). The em dash is gone from the
  banner wording on BOTH documents: "LIVER TRANSPLANT RECIPIENT ON
  IMMUNOSUPPRESSION" — the Emergency Card keeps its boxed style otherwise.

### Tests
- Pins updated to the new wording and layout: `test:emergency-card` 12,
  `test:profile-sync` 44, `test:print-csp` 49. 20 suites / 783 cases.

### Added
- **The Patient Profile printout identifies transplant status at the top.**
  The same record-derived banner the Emergency Card carries — "LIVER
  TRANSPLANT RECIPIENT — ON IMMUNOSUPPRESSION" — now opens the printed
  profile, in red type with a red border (print-safe on every printer). One
  shared derivation drives both documents: transplant status from active
  conditions, immunosuppression from the active medication list. Records
  with neither print no banner — the report never invents a status.

### Tests
- Banner derivation cases (organ extraction, recipient-only,
  immunosuppressed-only, no-banner) and profile-print structure pinned:
  `test:emergency-card` 12, `test:profile-sync` 43. 20 suites / 782 cases.

### Added
- **The demo now shows real AI prep reports** (DEC-048). Clicking Generate
  on Consultation Prep for any of the demo's seeded appointments plays a
  brief generating pause and then a full report — printable, saved to the
  visit like the real thing. The reports are genuine Insina AI output,
  pre-generated once from the demo record; each ends with an "About this
  sample" note saying so. Live AI stays off on the demo origin, and
  appointments a visitor adds themselves keep the standard AI-off
  explanation.

### Tests
- Demo replay coverage pinned (every seeded appointment covered, honesty
  tail present, demo-mode gate): `test:demo-seeder` 51. 20 suites /
  772 cases.

### Fixed
- **AI questions work again — model upgrade rolled back pending a proxy
  deploy.** v1.52.0 pointed the app at the Claude 5 models, but the Render
  proxy does not auto-deploy from this repository, so its live allowlist
  still rejected them and every AI question errored. The app is back on the
  4.6 models (which the live proxy accepts) and the consent version returns
  to 1.0 — no user had re-consented in the interim. The proxy's updated
  allowlist (which accepts BOTH generations) remains in the repo; after a
  manual Render deploy, the Claude 5 switch re-ships as a strings-only
  change. Operational lesson recorded: proxy changes deploy manually, and
  model bumps ship proxy-first, client-second.

---

## v1.52.0 — 2026-08-19

### Changed
- **AI models upgraded to the Claude 5 generation.** Standard mode now runs
  Claude Sonnet 5, Advanced mode Claude Opus 5, and document extraction
  Sonnet 5 (the companion's light tier stays on Haiku 4.5, still its newest).
  Because the model behind Advanced mode materially changed, the consent
  version is bumped: Advanced users are switched to Standard and asked to
  re-consent on their next visit — the designed stale-consent path, never a
  silent swap. The proxy keeps the previous generation on its allowlist so a
  cached older app bundle keeps working through the upgrade window.

### Added
- **AI Analysis is now a session workspace** (DEC-C1…C15). The running feed
  is replaced by a session index — your saved conversations listed newest
  first, with a "record changed" badge when your record has moved since a
  session's last part. Opening or starting a session takes over the screen:
  a focused thread with a deterministic header (your question, your name,
  record-state stamp, reference-set version), a composer, and one action
  group — Save to Notes, Save & Print, Close. Saving writes the verbatim
  transcript to My Notes (append-only, never summarized); printing always
  saves first, so every printout has a stored counterpart; closing an
  unsaved session warns before discarding and keeps only the fact that a
  session happened. Reopening a saved session continues the same thread in
  a new, freshly-stamped part, with a divider wherever your record changed
  between parts — old answers stay exactly as they were. Old feed
  conversations remain in Notes and searchable; the feed itself is retired.
- **Groundwork for cited answers** (not yet active): a deterministic
  numeric validator engine and its maintained unit list ship in this
  release, tested but deliberately unwired — they activate with the
  reference corpus in a future release.

### Tests
- 56-case session-shell suite (lifecycle, stamping, staleness, discard
  logging, vault round-trip, validator fixtures) wired into the build gate:
  `test:ai-session-shell`. 20 suites / 766 cases.

### Fixed
- **Reports and printouts keep their bullet points.** Opening a response as
  a report (and printing it) ran the whole message through the safety filter
  at once, and the filter's sentence scan re-joined text with plain spaces —
  eating the line break after any sentence that ended in a period. Bullet
  lists flattened into run-on paragraphs and `-----` dividers printed as
  literal dashes, while the chat screen (which filters line by line) looked
  fine. The filter now reassembles text with exactly the whitespace it
  arrived with; what it flags and redacts is unchanged.

### Tests
- Filter and session-report suites pass unmodified (49 cases) — detection
  behavior is byte-identical; only layout survives now.

### Added
- **Lab results now stop for your review before joining your record**
  (DEC-P43). Importing a lab PDF — single file or batch — opens a review
  screen: the extracted rows beside the source document, one row per
  analyte. You can exclude any row, correct a misread value, unit, or date
  (the original stays stored alongside your correction), and out-of-range,
  low-confidence, and tacrolimus rows each require an explicit
  acknowledgment before the batch confirm button enables. Excluded rows are
  kept — not deleted — and can be added later through the same review.
  Every confirmed row carries provenance back to its source document and
  confirmation event. Batch imports no longer auto-save rows; nothing joins
  your record until you confirm it. Medications and allergies keep their
  per-item confirmation, unchanged.

### Tests
- 68-case lab-batch suite (flags, gating, corrections, re-promotion,
  persistence invariants) wired into the build gate: `test:lab-batch`.
  19 suites / 710 cases.

### Fixed
- **Search no longer blanks the app on the first keystroke.** Search results
  that quote a matching excerpt (source documents and AI history) called a
  text-snippet helper whose definition the v1.45.0 search rewrite deleted
  while keeping the call — a crash that unmounted the whole app the moment a
  typed letter matched any document or AI message. The helper is restored in
  the record-query library (imported, not redefined locally) so the existing
  test suite now pins it.

### Tests
- Snippet excerpt cases (match windowing, no-match truncation, empty/null
  safety, the single-letter crash trigger) plus a structural check that
  SearchPopup imports every record-query helper it calls:
  `test:record-query` 54. 18 suites / 642 cases.

### Fixed
- **AI Analysis no longer re-runs an old document analysis every time it
  opens.** The "analyze this document" and "ask AI" quick actions hand their
  prompt to the AI screen through a one-shot storage signal that the screen
  consumes and deletes. A copy of that signal captured into the Drive backup
  was restored by every sync (simple keys have no tombstones, so
  local-deleted + Drive-present always restored), and the stale prompt
  re-fired — and was re-answered, one paid AI call per visit. Both launch
  signals (`mi_ai_pending`, `mi_auto_analyze_doc`) are now excluded from
  Drive backup and merge on both sides, so copies already sitting in a Drive
  file are ignored, and any copy already restored locally is purged at
  unlock — launch signals never survive a boot.

### Tests
- Resurrection loop pinned: merge ignores stale signals in the Drive file,
  upload and download-backup payloads exclude them, boot purge runs even
  with no pending migrations: `test:profile-sync` 39. 18 suites / 630 cases.

### Fixed
- **The Emergency Card's banner prints in red on every printer.** Printers
  and PDF export drop background colors by default ("Background graphics"
  off), which turned the solid-red banner into faint gray on paper. In print,
  both top strips now render as red type with a red border — no background
  dependence — while the screen keeps the solid badge.

### Changed
- **Age is calculated from Date of Birth.** The profile's stored age went
  stale every birthday. On screen, in the printed profile, and on the
  emergency card, age now computes from DOB (shown read-only with
  "calculated from DOB" — edit the DOB to change it). Records without a
  parseable DOB keep the editable field. The AI identity payload always
  computed age this way (P-01); the display surfaces now match it.
- **The profile page header says "Health Profile,"** matching its sidebar
  label. The printable artifact keeps its "Patient Profile" name — that's
  what the document family is called across onboarding and report
  provenance.

### Tests
- Age cases (birthday boundaries, invalid/future DOB → fallback) and
  print-safe-banner checks added: `test:profile-sync` 34,
  `test:print-csp` 49. 18 suites / 625 cases.

---

## v1.49.2 — 2026-08-14

### Changed
- **The Emergency Card leads with what an ED needs, not blood type.** Greg's
  question — "is blood type the most important thing about my medical
  history?" — answered honestly: no. A patient-reported blood type is never
  transfused against (EDs type and crossmatch every time), so the enlarged
  red badge is gone. The unmissable slot now belongs to a banner derived from
  the record itself — "⚠ LIVER TRANSPLANT RECIPIENT — ON IMMUNOSUPPRESSION"
  (transplant read from active conditions, immunosuppression from active
  medications by drug class or category; no banner is fabricated for records
  where neither applies) — with an allergies strip directly beneath it, and
  blood type demoted to the ID line under the name.

  Section order is now clinical-first: code status and directives, then
  medications (immunosuppressants printed first — the drugs an ED must not
  stop or interact with casually), conditions, allergy details with
  reactions, care team, emergency contacts, and only then demographics,
  labs, and cards. An empty allergy list prints "No allergies recorded" —
  deliberately not "no known allergies," since absence of data is not NKDA.
  Flagged for the upcoming clinical-advisor review alongside the rest of the
  card.

### Tests
- Hierarchy cases added to `npm run test:print-csp` (46 checks): banner
  derivation, no-banner-fabrication, allergies strip and honest empty
  wording, blood-type demotion, immunosuppressants-first ordering.
  18 suites / 613 cases.

---

## v1.49.1 — 2026-08-14

### Fixed
- **The Emergency Card's Print button works again, and every report window
  prints itself reliably.** Root cause: report popups inherit the app's
  security policy (S-03), which forbids inline scripts — so the emergency
  card's Print button (an inline onclick) and the auto-print inside every
  print window (an inline script) were silently blocked in production. It
  never showed in development because the dev server strips that policy.

  All ten report windows now print via a shared opener-side wiring
  (`wirePrintWindow`): the app itself fires the print dialog and wires the
  button — no inline scripts anywhere in generated pages, which also
  *strengthens* the XSS posture (the emergency card's escaping test now pins
  ZERO script tags instead of exactly-one). Auto-print waits for the logo to
  load so saved PDFs aren't missing it, and every report gets a visible
  "Print / Save as PDF" button — cancel the dialog and you can reopen it,
  and Chrome's Save-as-PDF suggests the report's title as the filename.
  Covers: Emergency Card, Medication List, Refill Report, Lab Report, AI
  Analysis (report, summary, and transcript), Consultation Prep, Advanced
  Mode Consent. The Patient Profile print already used the safe pattern and
  is unchanged.

### Tests
- `npm run test:print-csp` — 38 checks: the emergency card's generated HTML
  is inline-script- and handler-free, all nine converted sites dropped their
  inline triggers and wire through the opener, Tab02's existing safe pattern
  pinned, and the helper's button-injection / image-wait / no-markup-writing
  contracts. 18 suites / 605 cases.

---

## v1.49.0 — 2026-08-13

### Added
- **Weight auto-fills from Vitals.** The Health Profile's weight is no longer
  a second, manually maintained copy: whenever any weight has been logged on
  the Vitals tab (or from the phone), the profile shows the newest one —
  labeled "auto from Vitals" with its date — on screen, in edit mode (as a
  read-only value pointing you to the Vitals tab), and on the printed
  profile. The emergency packet now prints that same CURRENT weight with an
  as-of date, instead of whatever was typed into the profile long ago. The
  helper picks the newest reading that actually carries a weight — a newer
  BP-only entry doesn't blank it. Records with no logged weights keep the
  editable profile field exactly as before.

### Tests
- Weight auto-fill cases added to `npm run test:profile-sync` (25 checks):
  newest-with-weight selection past BP-only and junk entries, null fallback,
  and structural checks on the profile and emergency packet.
  17 suites / 567 cases.

---

## v1.48.1 — 2026-08-13

### Fixed
- **Health Profile edits and cleared fields no longer revert on the next app
  open (DEC-047).** Personal Info and Insurance are stored as objects, and the
  Drive merge's object rule was a shallow merge where the Drive copy won every
  conflicting field — and re-supplied any field you had cleared. Editing your
  phone number or blanking a field held only until the next sync put the old
  value back: the same symptom as the old Appointments/Medications
  resurrections, by a different mechanism (those were array stores, fixed by
  tombstones and DEC-046 stamps; the profile's objects had neither).

  Now, when both copies of an object store carry an edit stamp, the newer
  object wins wholesale — which is exactly what makes a *deletion* stick: the
  newer object simply doesn't have the field. Profile saves stamp at the store
  setter (covering every caller, onboarding included), and the profile's
  per-item saves — care team, allergies, emergency contacts, pharmacies,
  insurance cards — now stamp the saved item, so item *edits* ride the
  existing newer-edit-wins rule too (their deletes were already tombstoned).
  Unstamped stores keep the old merge behavior byte-for-byte, pinned by test.

### Tests
- `npm run test:profile-sync` — 18 checks through a REAL vault and the REAL
  merge: the reported bug both directions (edit survives boot merge; cleared
  field stays cleared), wholesale replacement, unstamped legacy behavior
  pinned, insurance store, array-rule regression guard, and structural checks
  that every profile save path stamps. 17 suites / 560 cases.

---

## v1.48.0 — 2026-08-13

### Added
- **Original reports now live in your own Drive, one link away.** The record
  keeps what a report *means*; the report itself belongs in your own storage.
  A one-click **Set up report folders** (Settings & Backup, Google Drive
  section) creates "Insina Health Reports" in your Drive with subfolders per
  area — Imaging & Diagnostics, Lab Reports, Clinical Notes, Operative &
  Procedures, Hospital & Discharge, Referrals, Other.

  From then on, importing a PDF **passes the original straight through to the
  right subfolder** and pins an "Open report / Open original report ↗" link on
  the entry it created — Import Records (single, batch, and lab imports) and
  Source Documents uploads alike. Nothing new is stored inside Insina: the
  record carries only the link. Every save path treats the archive as
  best-effort — if Drive is disconnected or the upload fails, the record
  saves exactly as before, without the link.

  Hand-entered diagnostic studies get both halves in the study form: paste any
  https link (a report already in Drive, or a patient-portal link), or upload
  the file right there and the app files it and fills the link in. Links show
  on Diagnostics cards, the Health Profile's diagnostics list, and Medical
  Records entries (which also take a pasted link via "add report link").
  Only https links are accepted anywhere a link can be entered.

  Scope honesty: the app keeps its deliberately narrow Drive permission
  (drive.file) — it can create these folders and see files *it* uploaded, but
  cannot list files you drop into the folders yourself. That's what the paste
  path is for. Demo mode never touches a visitor's real Drive: setup and
  uploads are hard no-ops there and the Settings row is hidden.

- **Diagnostics carry-forward on the Patient Profile.** The profile's
  on-screen Diagnostics list now shows the ordering doctor alongside the
  reading provider and facility (the printed profile already had all three).

### Fixed
- **Edits to documents and diagnostic studies now survive a two-device sync.**
  Source Document edits and Diagnostics saves stamp `updatedAt`, opting those
  stores into the newer-edit-wins merge rule (DEC-046) — so a report link
  attached on the laptop reaches the phone instead of being silently
  discarded by the local-first union.

### Tests
- `npm run test:drive-reports` — 82 checks: area mapping for every record
  type and document category, https-only link sanitization, archive filename
  building, folder-state parsing, the demo-mode and no-token no-op contracts,
  and structural wiring (all four import paths archive, upload pass-throughs
  present, updatedAt stamps present, every rendered link sanitized +
  `rel="noopener noreferrer"`, prompt builders never see link fields).
  16 suites / 542 cases.

---

## v1.47.0 — 2026-08-11

### Added
- **AI analyses can now follow you into your appointments (DEC-046).** An analysis
  often ends with points to raise with specific specialists — and Consultation
  Prep couldn't see any of it: the prep prompt read conditions, meds and
  keyword-matched documents, but never My Notes, where every analysis is saved.
  Now, when a report is saved, a picker offers **"Include in appointment prep
  for:"** with the care-team members the report mentions already checked —
  deterministic text matching ("Dr. Chen" by name, "hepatologist" by specialty;
  generic words like "transplant" never suggest anyone). Nothing is marked until
  you apply. Any AI note in My Notes can be marked or retargeted later, and
  marked notes carry a green **PREP** chip.

  When you prep for a matching appointment, the marked reports are listed
  *before* generating — each with a checkbox to leave it out of this run, capped
  at the 3 newest with any overflow counted visibly — and ride into the prompt as
  delimited document blocks with an instruction to carry the findings and
  questions forward rather than re-derive them. With nothing marked, the prep
  prompt is byte-identical to before.

  **A mark means "for my next visit with that doctor":** completing the
  appointment clears its marks automatically (marks for other doctors on the
  same report survive); unmark manually anytime in My Notes. Saved conversations
  are still never auto-sent (DEC-042 stands) — the only thing that flows onward
  is what you explicitly marked.

### Fixed
- **Edits to a note now survive a two-device sync.** The Drive merge unions
  records by id with local-first-wins, which silently discarded field *edits*
  from the other device — a prep mark made on the laptop would never reach the
  phone's copy, and the phone's next upload put the unmarked copy back on Drive.
  When both copies of a record carry an `updatedAt` edit stamp, the newer edit
  now wins. Only stamped records opt in (nothing stamped one before this
  release), so no other store's merge behavior changes — pinned by test.

### Tests
- `npm run test:prep-marks` — 37 cases: the suggestion matcher, appointment
  matching (name, specialty fallback, never-wildcard), cap/ordering/overflow,
  the S-07 prompt block including the empty ⇒ byte-identical guarantee,
  clear-on-completion (other doctors' marks survive; idempotent), and the
  merge rule exercised through a REAL vault and the REAL `mergeIntoLocal` in
  both directions plus the unstamped-records-unchanged case.
  15 suites / 460 cases.

---

## v1.46.5 — 2026-08-11

### Fixed
- **The Dashboard now stays in step with the Vitals tab and the phone.** A reading
  logged on the companion and merged in by a Drive sync appeared under Vitals but
  the Dashboard kept showing the previous figure until you navigated away and came
  back. Cause: the Vitals tab re-reads on every `mi-data-synced` event; the
  Dashboard only re-read when you navigated *to* it, and never listened for that
  event at all. It does now, registered unconditionally so returning to the
  Dashboard can't show something that went stale while another tab was open.

  The same gap applied to any vitals save made elsewhere in the app (`saveReading`
  dispatches the event) and to RIE fixes.

  Two related staleness bugs fell out of the same fix. `refreshFromDrive` re-read
  only readings and medications, so **appointments and alerts were stale after a
  sync**; and `activeConditions` was never re-read after mount, so **a condition
  added mid-session never reached the Dashboard summary until a full page
  reload**. All of it now goes through one `refreshDashboardData()`, so a future
  Dashboard field cannot quietly miss the refresh path.

### Changed
- **Blood Pressure on the Dashboard is dark orange, not red.** Red is reserved for
  genuinely urgent readings. A *flagged* value still renders red — that path is
  separate and untouched — so an out-of-range BP is as loud as it ever was; it is
  only the resting colour that stops shouting.

### Added
- `npm run test:dashboard-sync` — 13 checks pinning the wiring behind "these three
  areas should always be the same": both surfaces listen for `mi-data-synced`, the
  Dashboard's listener isn't gated behind a nav check, `refreshDashboardData`
  re-reads every store the Dashboard renders, and red remains reserved for flagged
  values. Structural rather than behavioural — the Dashboard is React + DOM and
  this harness is Node-only — so the live behaviour was verified in-browser with a
  reproduction that failed before the fix and passes after. 14 suites / 423 cases.

---

## v1.46.4 — 2026-08-10

### Changed
- **The companion hides its sync furniture in the demo.** With the phone UI newly
  demoable (v1.46.3), two bits of Drive-sync status were left on screen with
  nothing behind them: the "Connect Drive to sync with the web app" bar — which
  invited a visitor to sign a Google account into a Drive that will never hold
  this fictional record — and the "Not synced yet" line under the greeting. Both
  are now suppressed when `isDemoMode()` is true, so the demo opens on the record
  itself rather than on a call to action that leads nowhere.

  Scoped strictly to demo mode and verified live in **both** directions: with the
  demo seeded, all three elements are absent; with a real vault created on the
  same origin, the sync bar, the Sign in button and the "Not synced yet" line all
  return. Nothing changes for a real user — `isDemoMode()` requires the absence of
  a vault, and a real companion user necessarily has one to get past the lock
  screen at all.

---

## v1.46.3 — 2026-08-09

Demo-only, like the two before it. For a real user with a vault nothing changes:
every code path added here is gated on `isDemoMode()`, which is false the moment
a vault exists.

### Fixed
- **The phone app is now demoable.** It failed two independent ways. The demo
  build never included the companion at all — `build-demo.mjs` built only the web
  app, so `demo.insinahealth.com/companion/` was a 404. And the companion itself
  never honoured demo mode: `CompanionApp` gated on `isUnlocked()` alone, so a
  visitor was met with **"Protect your record — create a password"** even with the
  demo record already seeded on that origin. `isDemoMode()`'s own docstring had
  described the intended allowance since P-02 ("skip the encryption interception
  **and the lock screen**"); the web app implemented its half in `App.jsx` and the
  companion never did.

  The companion now opens straight into the demo record, matching the web app's
  `isUnlocked() || isDemoMode()` pattern exactly. A second gate needed the same
  treatment: the Google sign-in wall, which a demo visitor would have hit
  immediately after clearing the first one, with no account to connect and
  nothing to sync.

- **Reaching it cold no longer dead-ends.** Nothing in the app links to the
  companion — you get there by typing the URL — so a visitor can land on
  `/companion/` having never run the seeder at `/`, with empty storage and no demo
  marker. The demo build injects a guard that bounces such a visitor to
  `/?next=companion`; the seeder honours that and hands back to the phone UI
  instead of the web app. An unrecognised `?next` value falls back to the app, so
  it can never become an open redirect, and the guard checks `mi_vault` first so a
  real record is left strictly alone.

### Safety
The vault gate is unchanged for anyone with a vault — verified live: with a vault
present the companion shows "Unlock your record" and no record content renders.
The seed guard is injected by `build-demo.mjs` into the demo output only; the
production companion never receives it (asserted against `dist/` after building).

### Added
- 6 more cases in `test:demo-seeder` (45 total) covering the `?next=companion`
  hand-off, the fallback for an unknown `?next`, and that the hand-off still
  refuses when a vault is present. `build:demo` now fails if the companion output
  or the injection point is missing. 13 suites / 410 cases.

---

## v1.46.2 — 2026-08-09

Demo-only release, like v1.46.1. No change to the app for a real user.

### Fixed
- **The demo no longer degrades the more it is used.** The seeder rewrites every
  key in its `DEMO` object on each visit, so demo *content* was always current —
  but **using** the demo creates keys that are not in `DEMO`, and those were never
  cleared. Deleting an appointment writes a tombstone to `mi_record_tombstones` /
  `mi_appt_tombstones` (v1.44.0 deletion memory, working exactly as designed); the
  next visit rewrote `mi_appointments` fresh, but the surviving tombstone filtered
  that record straight back out — permanently, on that device. `mi_lab_name_map`
  (Group Tests), `mi_dismissed_alerts`, the RIE audit and the `insina_ai_*` chat
  family drifted the same way. The visitor most exposed was whoever demos it
  repeatedly on one laptop.

  The seeder now carries a `DEMO_DATASET_VERSION`. A returning visitor whose
  stored version differs gets a **full demo reset** — every `mi_*` and `insina_*`
  key removed, then the dataset written fresh — instead of a plain overwrite.
  Same version, no reset: an ordinary revisit stays cheap. The version is
  deliberately **not** tied to `package.json`, so an unrelated release cannot
  force a reset in the middle of a demo.

  `?reset=1` forces a reset on demand — an escape hatch for demo day.

### Safety
The reset is the only bulk delete in the codebase, in the one file that has wiped
a live record before (2026-07-19). It runs strictly inside the branch the existing
guard has already cleared, re-checks for a vault immediately before deleting and
refuses rather than deletes if one appears, is scoped to the app's own key
prefixes (nothing else on the origin is touched), and still never calls
`clear()`. `?reset=1` grants no new power — a device holding a real record is
refused exactly as before.

### Added
- `npm run test:demo-seeder` — 39 cases that execute the **real** `<script>` block
  out of `public/demo/index.html` in a `vm` sandbox with a localStorage polyfill,
  rather than re-implementing or grepping it. Covers both refusal paths (vault
  present; unmarked real data), the plain-overwrite path, the stale-version reset,
  a pre-versioning device, `?reset=1` including that it cannot wipe a real record,
  and that the refusal branch is genuinely reached rather than crashed into.
  Wired into `test:all` (13 suites / 404 cases). The build now also fails if the
  version constant is missing, since a seeder that cannot detect staleness would
  ship a demo that silently degrades.

---

## v1.46.1 — 2026-08-08

Public-demo release. Nothing in this version changes behavior for a real user with
a vault — every change is gated on `isDemoMode()` or lives in demo seed data.

### Fixed
- **The demo no longer claims the server is waking up when AI is off on purpose.**
  `demo.insinahealth.com` is deliberately kept off the proxy's CORS allowlist so a
  public page cannot spend the AI budget (AUDIT_SEC_02 F-12). But the browser
  reports a blocked cross-origin request as `TypeError: Failed to fetch`, which
  every surface's error handling reads as a Render cold start — so the demo showed
  **"Server is waking up… click Retry when ready"** and a Retry button that could
  never succeed. `isDemoMode()` now short-circuits inside `aiClient.js`, the single
  module every AI call already routes through, returning **403** with
  `{error, demo: true}`. 403 and not 503 on purpose: 503 is the cold-start code
  those surfaces map to the wrong message. The request never leaves the browser, so
  budget protection no longer rests on the CORS allowlist alone. AI Analysis renders
  a short explanation of what is off and why, and points at the saved example below.

### Added
- **A saved example analysis, pinned in the demo's My Notes.** Written in the
  DEC-041/042 report format against the demo patient's own numbers, so a visitor can
  see exactly what the AI produces — sections, care-team questions, "Why you're
  asking," the deferral posture — without a single API call.
- **Demo seed data for four empty stores.** `mi_pharmacies`, `mi_diagnostics`,
  `mi_emergency_contacts` and `mi_notes` were all empty while medications, labs,
  conditions and appointments were full, which quietly broke the two newest features
  as demo material: v1.46.0's Pharmacy card had nothing to show, and v1.45.0's
  deterministic search returned nothing for "when was my last cervical MRI" because
  imaging lives in `mi_diagnostics`. Pharmacy names match the pharmacy strings
  already on the demo medication records, so the two views agree.

### Note for future demo work
The demo dataset lives in **two** places — `src/demoData.js` (the in-app demo
toggle) and an inlined `DEMO` object in `public/demo/index.html` (the standalone
seeder `demo.insinahealth.com` actually runs). Editing one does not affect the
other. Both were updated here; see DEC-045.

---

## v1.46.0 — 2026-08-05

### Added
- **Pharmacy contact information on the Patient Profile.** Until now "pharmacy"
  existed only as a free-text label on each medication ("CVS #5777") — it named
  where a fill came from but carried no phone, address, or hours, so there was
  nowhere to keep the number you actually call about a refill. New Pharmacy card
  on the Patient Profile tab (beside Emergency Contacts) with add / edit /
  delete: name, type (Retail, Mail-order, Specialty, Hospital, Compounding),
  phone, fax, address, hours, notes, and a **Primary** flag. Multiple pharmacies
  are supported deliberately — transplant patients commonly use a local retail
  pharmacy plus a mail-order or specialty pharmacy for immunosuppressants.
  Stored under the managed `mi_pharmacies` key, so it is encrypted at rest,
  carried in Drive/folder backups, and covered by the v1.44.0 deletion
  tombstones. Pharmacies also print in the Patient Profile report.
- **Search finds and answers from it.** "what's my pharmacy phone number" now
  returns a direct answer card — the primary pharmacy first — alongside the
  usual results. This needed a new **category-hint** mechanism in
  `recordQuery.js`: nothing *inside* a pharmacy entry contains the word
  "pharmacy", so a pure term match found nothing; a section word now selects
  the store to answer from instead of being matched against record text.
  Contact intent is checked ahead of the value branch (which would otherwise
  claim "…phone number" via "number"); clinical value lookups are unchanged.
  9 new cases (`test:record-query`, 42 total; 11 suites / 357 overall).

### Fixed
- The onboarding "Add your pharmacy" task (T7) routed to the Medications tab,
  where pharmacy contact details could not be entered. It now routes to the
  Patient Profile, where the field actually lives.

---

## v1.45.0 — 2026-08-05

### Changed
- **Search now answers from your record instead of handing questions to AI.**
  Search is a search of what is already in Insina — "which doctor did my EGD",
  "when was my last cervical MRI", "what's my dosage of tacrolimus" are lookups
  whose answers are already stored. Two defects made that impossible: (1) any
  question-shaped query was routed straight to AI Analysis and the local record
  was **never searched** (`setResults([])`), and (2) matching required the
  ENTIRE query as one contiguous substring, so "cervical MRI" could not match a
  study named "MRI Cervical Spine" and "which doctor did my EGD" — whose lead
  word wasn't even in the question-word list — searched for that literal string
  and returned nothing. New `src/lib/recordQuery.js` strips question
  scaffolding to content terms, matches with AND semantics across every field,
  detects the question shape lexically (who / when / dose / value, plus
  last-vs-first), and reads the answer off the matched record. Search shows a
  direct answer card with its source record (click to open) above the usual
  grouped results — no tokens, no network, works offline.
- **AI is now an explicit choice, never automatic.** It appears as "Ask AI
  instead" in the footer, and as the suggested next step only when nothing in
  the record matches.
- **Retrieval only, never invention:** if the record has no provider for that
  procedure, no dose for that drug, or no matching entry, there is no answer
  card — results alone. A discontinued medication is always answered with its
  status ("marked inactive"), never as if current. New
  `scripts/testRecordQuery.mjs` (`npm run test:record-query`, 33 cases) pins
  all three of the questions above end-to-end plus the never-fabricate rules;
  the prebuild gate now runs 11 suites / 348 cases. Verified live in the
  browser: all three questions answered from seeded records with AI untouched.

---

## v1.44.1 — 2026-08-03

### Fixed
- **Production deploy unblocked: portable test imports.**
  `scripts/testOnboarding.mjs` imported its modules through hardcoded absolute
  paths (`file:///C:/Documents/.../src/lib/...`) that resolve only on the
  author's Windows machine. Harmless while CI's build ran the threshold suite
  alone — but v1.43.2 put the full suite in `prebuild`, so the first CI build
  after it failed at the Build step on Linux and the GitHub Pages deploy never
  ran (v1.44.0 built and pushed but did not go live). All 10 imports now use
  `new URL("../src/...", import.meta.url)`, which resolves relative to the test
  file on any OS. Test-only change; verified all 10 suites (315 cases) pass and
  the build completes.

---

## v1.44.0 — 2026-08-03

### Fixed
- **Deletions now stick in EVERY section — the resurrection bug generalized
  (Care Team / Allergies / Conditions report).** The Dr. Roy fix (v1.43.1)
  covered appointments only; the underlying flaw is in the shared Drive merge,
  whose array union has no concept of deletion for ANY store — so deleted Care
  Team members, allergies, conditions, meds, labs, notes, documents, and the
  rest all resurrected from the Drive copy on the next sign-in. New generic
  tombstone system (`src/lib/recordTombstones.js`): **every user deletion in
  every section** writes a tombstone keyed by the record's merge identity (the
  exact same key the union deduplicates by — one source of truth, now shared
  with `_mergeArrays`), and the merge post-pass enforces tombstones for every
  store that has them. The tombstone list is encrypted, backed up, and merged
  across devices, so **deletions propagate**: the other device drops its own
  copy on its next sync. 18 deletion sites wired across 14 stores (Tab02
  care-team/allergies/contacts/cards, Tab03 records, Tab04 meds, Tab08
  care-team/milestones, Tab09 documents/ref-docs/findings, Tab10 notes, Tab11
  ref-docs, Tab12 labs, Tab15 conditions, Tab16 procedures, Tab17 diagnostics,
  companion cards/symptoms/med-exceptions). Stores that deliberately re-add
  under a stable id (AI-reference entries keyed by their document) get an
  `untombstoneRecord` on re-add so the tombstone never eats a deliberate
  re-creation; records re-created by hand get fresh ids and are never matched.
  New `scripts/testRecordTombstones.mjs` (`npm run test:record-tombstones`,
  11 cases) includes a REAL-vault end-to-end merge test that first reproduces
  the shipped bug, then proves the fix and cross-device propagation; the suite
  rides the prebuild gate (10 suites, 315 cases). Care Team delete verified
  live in the browser (record removed + tombstone written).

## v1.43.2 — 2026-08-03

### Infrastructure
- **Every build now enforces the full test suite.** `prebuild` ran only the
  threshold fixtures; the other eight suites ran by discipline. New `test:all`
  chains all nine (thresholds, onboarding, advisory, vault-restore,
  emergency-card escaping, AI output filter, question rules, AI session
  report, appointment tombstones — 304 cases) and `prebuild` runs it, so a
  build cannot complete with a failing suite. No app behavior change.
- **Intake: CL-037 + CL-038 logged from the voice-recording security review**
  — encrypt visit audio at rest (IDB blobs sit outside the P-02 vault; spec
  with CL-035), and transcription-provider as a gated needs-attorney decision
  (audio stays on-device until terms/retention/consent-law review, paired
  with CL-009).

## v1.43.1 — 2026-08-03

### Fixed
- **Deleted appointments no longer resurrect through the Drive merge (the
  Dr. Roy bug).** v1.42.2's tombstones blocked the calendar-import vector, but
  a SECOND resurrection vector remained: the Drive merge's array union has no
  concept of deletion, so a deleted appointment still living in the Drive file
  (kept alive by the other device's uploads) was quietly union-ed back on
  every sync — which is how an appointment that isn't even on the calendar
  kept returning. Three changes close it: (1) **every** deletion now writes a
  tombstone — manual records included — keyed by the record's exact id
  (collision-proof: a manually re-created appointment gets a fresh id and is
  never eaten by an old tombstone); (2) tombstones are enforced **at the merge
  layer** — a post-pass after every Drive merge drops resurrected copies, and
  because the tombstone list itself rides the backup, deletions **propagate**:
  the other device merges the tombstones in and drops its own copy on its next
  sync; (3) tombstone entries carry content-keyed ids so the merge union
  dedupes identical tombstones across devices without dropping distinct
  same-date ones. Delete-confirm copy now says deletions stick everywhere.
  4 new test cases (16 total) + live browser verification of the full
  delete → tombstone → merge-resurrection → heal cycle.

## v1.43.0 — 2026-08-03

### Fixed
- **Medications: the "AI Interaction Check" button now works — it previously
  had no click handler at all.** It routes to AI Analysis with the full
  medication-interaction prompt (same mechanism as the per-med AI quick
  actions) and auto-sends. Also fixed the header's hardcoded "14 active" count
  to the real active-medication count.
- **Companion→web sync: the web's 10-minute background loop no longer
  clobbers phone changes.** It ran a blind `uploadToDrive` — overwriting the
  shared Drive file with the desktop's local snapshot, wiping anything the
  phone had uploaded since the desktop's last pull (phone data resurfaced only
  after the phone's next merge, so sync looked randomly broken). The loop now
  runs the merge-first `fullSync` like every other sync path, and refreshes
  the UI afterward.

### Added
- **Sync diagnostics: vault-key fingerprints + loud decrypt failures.** The
  deepest cross-device failure was invisible: if two devices hold different
  vault keys (e.g., one re-created its vault instead of restoring), every
  Drive blob fails AES-GCM decryption during merge and `mergeIntoLocal`
  silently kept local data — sync "succeeded" forever while transferring
  nothing. Merge now counts unreadable items and writes a diagnostic
  (`insina_sync_diag`, key names and counts only — never values). Settings &
  Backup shows a **Vault key fingerprint** (SHA-256 of the key envelope, first
  8 hex) plus an amber warning with re-key guidance when the last sync had
  unreadable items; the companion's sync bar shows its own fingerprint and the
  same warning. Two devices sync records only when fingerprints match — a key
  divergence is now a visible, actionable fact instead of a silent no-op.
  Verified live (Tab04 flow, Tab13 diagnostics render) + Node checks on the
  fingerprint helper (null without vault, stable, envelope-sensitive).

## v1.42.2 — 2026-07-22

### Fixed
- **Deleted calendar-synced appointments no longer resurrect (the "deleted it
  three times" Aug 3 bug).** Deleting a synced appointment erased the app's
  only memory of it, so the next daily Google Calendar sync re-imported the
  same event as a fresh suggestion — forever. Deletions (and the suggested-row
  Dismiss, which shares the same path) now write a **tombstone**
  (`mi_appt_dismissed`: Google event id + date/title, capped at 300, encrypted
  at rest and carried in Drive/folder backups so deletions hold across
  devices). Three enforcement points: the sync differ skips tombstoned events
  (by event id, and by date+title so a re-issued recurring-event id can't
  sneak through); the Appointments loader heals already-resurrected synced
  copies at mount; and the delete-confirm dialog now says "It also won't come
  back from calendar sync." Deliberately narrow: manual appointments (no
  Google id) are never tombstone-filtered — re-creating one by hand on the
  same date/title is the user's explicit choice and always sticks; the next
  instance of a recurring event (different date) still imports. New
  `scripts/testApptTombstones.mjs` (`npm run test:appt-tombstones`, 12 cases)
  plus live browser verification of the delete → tombstone → heal cycle.

## v1.42.1 — 2026-07-22

### Fixed
- **Appointment duplicate check: "Use existing" no longer strands the user on
  ancient history with nothing booked (Greg's 8/17 Labs report).** Three
  compounding defects. (1) "Use existing" switched the list filter to "all,"
  which sorts oldest-first, and expanded the matched record **off-screen with
  no scroll** — the viewport landed on months-old appointments, reading as
  "it took me to a lab appointment in April." The revealed record now scrolls
  into mid-viewport (instant scroll — a smooth scroll gets canceled by the
  filter re-render's row animations, verified live). (2) When the duplicate
  was a **calendar-synced "suggested" record**, "Use existing" recorded
  nothing — a suggestion isn't a confirmed appointment and is invisible under
  the default Upcoming filter, so the net result was "no appointment for
  8/17." "Use existing" on a suggested match now **confirms it to Upcoming**
  (the user just asserted it's real). (3) The duplicate prompt showed a raw
  ISO date with no status context; it now shows the formatted date, explains
  when the match is an unconfirmed calendar suggestion, and states what "Use
  existing" will do. Also added a confirmation toast for the "Use existing"
  path. Verified end-to-end in the browser with the seeded bug scenario
  (April history + suggested 8/17 Labs + manual 8/17 entry).

## v1.42.0 — 2026-07-21

### Changed
- **Tripwire advisory: external-review disposition — nine engineering/wording
  items (DEC-043). Everything remains inert behind
  `TRIPWIRE_ADVISORY_ENABLED = false`; no threshold NUMBER changed.**
  **(1) Band fall-through gaps closed** (table → v1.1.0-draft): low-side TODAY
  bands get exclusive uppers (K 3.0, Na 130, glucose 70, Hgb 8.0, platelets 50;
  SpO2 [88,92); HR [40,50)) — previously a hemoglobin of 7.95 fired *nothing*.
  Strictly sensitivity-increasing; boundary battery + exact-critical-value pins
  added (exact bound = TODAY stays the pinned convention, matrix Q-G1).
  **(2) Audit log** gains `readingId` + `verification`, wired from all four
  call sites. **(3) Verify-first for staged imports:** an OCR'd value now asks
  "verify it against the original report" FIRST; the EMERGENCY/TODAY workflow
  fires only after patient confirmation ("the value is wrong" logs a rejection
  and routes back to Import Review). **(4) Templates → v1.1.0:** "meets Insina
  Health's emergency/same-day alert threshold" replaces "safe range"; per-metric
  symptom sentences replace the generic four-symptom line (vital sentences are
  NEW DRAFTS pending review); the no-coordinator fallback routes
  transplant-line-then-ED instead of "urgent care clinic"; do-not-drive-yourself
  transportation wording added. **(5) Context-rich alerts:** value carries its
  unit, staged values their result date, plus a source/verification meta line.
  **(6) "Mark care team contacted — self-reported"** action, separate from
  dismissal, own timestamp. **(7)** Advisory/display-range separation is now
  test-asserted. **(8) `CLINICAL_REVIEW_MATRIX.md`** created — every threshold,
  boundary ruling, escalation-model question, wording string, and deferred item
  as sign-off checkboxes for a licensed clinician. **(9)** In-repo
  AI-originated-urgency language sweep: clean (OPEN-1's external marketing copy
  remains). Deferred to the clinical(+legal) package: ADA treatment steps,
  symptom gating, low-temp bound, high-glucose cutoff. `testAdvisory.mjs`
  35 → 77 cases.

## v1.41.0 — 2026-07-21

### Added
- **Daily question limit: 15 conversation questions per day (OPEN-17a resolved
  by Greg).** The DEC-042 work order presumed a daily limit existed; none did.
  Now it does: `src/lib/dailyQuestionLimit.js` counts each **successful**
  conversation turn in the AI Analysis tab (a rejected request or cold-start
  fetch failure never consumes quota, so Retry can't double-charge a turn) and
  blocks the 16th send with clear copy. Local-midnight reset; a live
  "N of 15 questions left today" counter sits in the composer footer (amber at
  ≤3, red at 0) and Send disables at zero. Fail-open on corrupted counter
  state — the proxy's per-IP hourly caps (60/hr chat) remain the hard
  backstop. Per the work order: per-conversation Summary prints and other AI
  surfaces are not conversation turns and are not counted. New
  `scripts/testDailyQuestionLimit.mjs` (`npm run test:daily-limit`, 8 cases).

## v1.40.0 — 2026-07-21

### Added
- **AI Analysis conversation sessions with End & Save Report (2026-07-21 work
  order Part 2, DEC-042).** The AI Analysis tab now runs explicit sessions:
  **New Conversation** is the primary topbar action (also the empty-state CTA;
  typing into a fresh thread opens a session implicitly), and **End & Save
  Report** stays visible in the topbar for the whole session. Ending generates
  ONE discussion report — session date/time header, the **verbatim timestamped
  transcript exactly as displayed** (assistant turns pass through the same
  deterministic F-03 filter the screen applied; no AI summary step), then
  "Questions for your care team" and "Why you're asking" **consolidated and
  deduplicated across all turns in code** (new `src/lib/aiSessionReport.js` —
  section extraction + normalized dedup, no model call), and a single
  contact-routing block rendered from the care-team record (24-hour lines
  first). The report saves to My Notes with the AI-generated label (DEC-022)
  and opens in the report overlay. An open session survives tab navigation and
  app restarts; on return a banner offers **Resume / End & save report /
  Discard** (discard is two-step and deletes without a report). Ended
  conversations remain on screen as archive and are **never included in API
  context** — context per turn is the patient record + current session only,
  now enforced through the unit-tested `apiMessagesForConv()` helper. Starting
  a new conversation while one is open ends-and-saves it first (nothing is
  silently dropped). Fixed alongside: the old mount logic resumed the *last*
  conversation id, silently reopening archives — sessions now resume only via
  the open-session marker, and fresh sends always target a fresh thread.
  New `scripts/testAiSessionReport.mjs` (`npm run test:ai-session`, 28 cases)
  + live browser verification of the banner → End & Save → report flow.
  **Verified, not implemented:** the work order's believed 10/day question
  limit does not exist anywhere in the codebase (only the proxy's hourly IP
  caps); adding one is an open decision — OPEN-17(a). Also flagged:
  OPEN-17(b), the `insina_ai_*` chat-storage family sits outside the P-02
  vault (pre-existing). Consultation Prep is unchanged as a one-shot document.

## v1.39.0 — 2026-07-21

### Changed
- **Care-team question generation rules + required "Why you're asking" section
  (2026-07-21 work order Part 1, DEC-041).** New shared prompt block in
  `src/prompts/core.js` (QUESTION GENERATION / WHY YOU'RE ASKING / NUMERIC
  LIMITS), composed onto every surface that produces care-team questions —
  Surface A (AI Analysis), B1/B2 (Labs), C (Notes), G (companion symptom prep),
  H (report annotation), and Tab14's Consultation Prep. Questions become one
  open-ended umbrella question per topic that never names a test, dose, or
  timing change; reconciliation questions stay exempt; settled education topics
  move out of the question list and into the new education section as stated
  facts ("Ask your physician if you'd like more information"), which itself
  states facts without mechanism and never predicts physician actions. Numeric
  limit queries follow the record-cite-or-defer pattern. Surface A's response
  structure gains the fifth section; the fixed "2 to 3 questions" counts on
  C/G are replaced by one-per-topic. PROMPT_VERSION → X-1.1 on A/B/C/G/H;
  INSINA_AI_PROMPTS.md → v2.5 with the worked omeprazole example. The CSC is
  **unchanged** (v1.1) — rule 11's "Should we...?" example now diverges and is
  flagged for a future gated CSC bump, and the new test suite asserts the CSC
  is byte-identical. New `scripts/testQuestionRules.mjs`
  (`npm run test:question-rules`, 49 cases): block present on every surface,
  omeprazole prohibited/permitted shapes, Tylenol record-cite-or-defer
  regression, doc↔code parity.

## v1.38.0 — 2026-07-21

### Added
- **Folder Backup — the no-Google backup channel (File System Access API).**
  Users who can't or won't use Google Drive can now pick a local folder once
  (Settings & Backup → Folder Backup); Insina writes dated, **encrypted** backup
  files there — rolling 4 copies, mirroring the Drive weekly snapshots. Pointing
  the folder at a Dropbox / OneDrive / iCloud Drive synced directory gives
  automatic off-device backup on the user's own cloud with zero new OAuth
  integrations. Payload parity is the load-bearing rule: the file comes from the
  same `collectLocalCiphertext()` as a Drive backup (ciphertext + wrapped key
  envelope) — never plaintext, since the chosen folder may sync to a third-party
  cloud. Chromium-desktop only; the UI feature-detects and hides elsewhere. New
  `src/lib/folderBackup.js`; directory handle persists in IndexedDB (handles
  aren't JSON-serializable). The weekly reminder banner now silently runs a
  folder backup instead when one is configured and permitted.
- **Restore from a backup file on the lock screen.** A wiped/new device can now
  rebuild from an encrypted backup *file* (folder backup or Drive-format) next
  to the existing "Restore from Google Drive" — same raw-import path (#50),
  then unlock with the existing password or recovery key.

### Fixed
- **Encrypted backups restored via Settings → Restore no longer corrupt.**
  Tab13's file import wrote every `mi_*` value through the patched
  `localStorage.setItem` — correct for readable exports, but an **encrypted**
  backup (Drive-format weekly file, and now folder backups) restored while
  unlocked would have its ciphertext treated as plaintext and double-encrypted,
  corrupting every restored key. The import now detects the encrypted format and
  routes it through the raw import path, with two guards: an envelope-less file
  is refused (blobs would be stranded undecryptable), and a file from a
  *different* vault is refused (restoring its envelope would lock the user out;
  its blobs wouldn't decrypt locally anyway). A successful encrypted restore
  resets the schema stamp so the idempotent A-08 migrations re-run. 15 new
  cases in `scripts/testVaultRestore.mjs` (20 total) cover format detection,
  raw restore end-to-end through a real unlock, both refusal guards, and the
  stamp reset.

### Notes
- `driveSync.js`: `collectLocalCiphertext()` is now exported (single payload
  source for Drive + folder), and the Drive restore core is extracted as
  `restoreFromBackupObject()` so file- and Drive-restore share one path.
- Copy: the Drive connect card gains "No Google account? Creating one is free…"
  plus a pointer to Folder Backup (or Download Backup on non-Chromium); the
  weekly banner mentions the folder option.

## v1.37.8 — 2026-07-21

### Security
- **Emergency Card now escapes the ID-card image `src` too (AUDIT_SEC_02 F-01
  follow-up, defense-in-depth).** The F-01 fix escaped every free-text field but
  deliberately left the insurance/ID-card image data URIs (`c.front`/`c.back`)
  unescaped, on the sound rationale that a base64 data URI carries no HTML
  metacharacters. That holds for real images (`compressImage` output), but it
  assumed the value is *always* base64 — a tampered or maliciously restored
  `mi_cards` could put an attribute-breakout string in the `src`. Both are now
  wrapped in `escapeHtml` — a no-op on legitimate base64, and a hard stop on a
  tampered value. `scripts/testEmergencyCardEscaping.mjs` gains a tampered-card
  case (attribute breakout + `<script>` in the image `src`); verified it fails
  against the old code (two `<script>` tags) and passes against the fix (8/8).

## v1.37.7 — 2026-07-21

### Security
- **Proxy no longer echoes the upstream AI error body (AUDIT_SEC_02 F-13,
  Low/Info).** On a non-2xx from Anthropic, `proxy/server.js` (both `/api/chat`
  and `/api/extract-pdf`) forwarded the raw upstream error body to the
  originating browser — an `invalid_request_error` can carry a fragment of the
  request. Now the proxy preserves the status code (clients still key their
  429/503/413 copy on it) but replaces the body with a generic
  `{ error: "The AI service returned an error." }`.
- **Migration failure audit records the error type, not the message
  (AUDIT_SEC_02 F-14, Low/Info).** `migrations.js` logged
  `error: String(e?.message || e)` into the persisted (encrypted-at-rest) audit;
  a thrown error could theoretically embed record content. It now stores
  `e?.name` (e.g. `"TypeError"`) only; the full message still goes to the
  ephemeral dev console.

### Notes
- **Accepted-risk audit dispositions documented (F-11, F-12, F-15)** in
  DECISIONS.md OPEN-16 — the Drive key-envelope offline-brute-force tradeoff
  (gated by PBKDF2 600k + 256-bit recovery key), the deliberate exclusion of the
  demo origin from proxy CORS (so the public demo can't spend the AI budget),
  and the RIE audit intentionally storing changed values (encrypted at rest).
  No code change; recorded so the tradeoffs are auditable.

## v1.37.6 — 2026-07-21

### Security
- **Made `.env.production` tracking explicit and secret-proof (AUDIT_SEC_02
  F-10, Low).** `.env.production` was git-tracked even though `.gitignore` lists
  `.env*`, a silent contradiction: it holds only the public `VITE_PROXY_URL`
  (already baked into every client bundle, not a secret), but the mismatch meant
  a secret later added to it would be committed unnoticed. Rather than untrack it
  (the GitHub Pages CI build, `deploy.yml → npm run build`, reads it from the
  checkout — verified that a build without it falls back to a localhost proxy
  URL and breaks production AI), the tracking is now **intentional and
  documented**: an `!.env.production` negation in `.gitignore` plus prominent
  "PUBLIC CONFIG ONLY — never put a secret here" banners in both `.gitignore`
  and the file, and a pointer comment in `aiClient.js`. All other `.env*` remain
  ignored. No behavior change; production bundle still targets the Render proxy.

## v1.37.5 — 2026-07-21

### Fixed
- **Removed the dormant, broken live-extraction fetch (AUDIT_SEC_02 F-09, Low).**
  `extraction.js` (onboarding document extraction) had a `live` mode that POSTed
  to a proxy route `/extract` that does not exist — using its own raw `fetch`
  and a duplicated copy of the bearer-auth header, the exact "each surface rolls
  its own fetch" drift the unified `aiClient` (A-02) exists to prevent. It was
  never reachable in practice (`fixture` mode is the shipped default), but in
  `live` mode it would have silently POSTed document text to a 404. Replaced the
  ad-hoc fetch with a fail-loud stub (`ExtractionNotWiredError`) and removed the
  duplicated auth header and now-unused `PROXY_URL`. The spec'd consent gate and
  page-batch/merge logic (§4.2) are unchanged. **Open decision for Greg:** when
  a real onboarding-extraction proxy route is designed (name + response shape),
  it must be implemented *through* `aiClient` so auth lives in one place.

## v1.37.4 — 2026-07-21

### Security
- **CSP on the landing page; inline scripts externalized (AUDIT_SEC_02 F-08,
  Low).** The apex document (`insinahealth.com/`) shipped no CSP and two inline
  `<script>` blocks, so — unlike `/app/` — the root origin had no XSS
  containment. Added a strict CSP meta tag (`script-src 'self'`, no inline) and
  moved all JavaScript into `landing/assets/landing.js`, loaded synchronously
  from `<head>` so the `js` class is still set before first paint (no
  reveal-flash); the DOM-dependent logic now runs on `DOMContentLoaded`.
  `style-src 'unsafe-inline'` remains accepted debt (inline `<style>` + style
  attributes), matching the app. Verified against a static build: the external
  script and all assets load with no CSP violations, and the script executes
  (js class, scroll-reveal observers, and demo-button wiring all initialize).
  Behavior is unchanged from the previous inline version.

## v1.37.3 — 2026-07-21

### Security
- **Dropped the stale `api.anthropic.com` origin from the CSP (AUDIT_SEC_02
  F-07, Low).** Since A-02, every AI call routes through the Render proxy and
  the browser never contacts Anthropic directly, yet `connect-src` still
  allowlisted `https://api.anthropic.com` (the CSP comment even said "remove
  when A-02 lands"). Removed it from both `index.html` and `companion/index.html`
  and updated the origin-inventory comment. No functional change — nothing in
  `src/` connected there; the proxy origin (`insina-health.onrender.com`) and
  the other verified origins are untouched.

## v1.37.2 — 2026-07-21

### Fixed
- **Rebrand residue in patient-facing generated documents (AUDIT_SEC_02 F-05,
  Med).** Exported artifacts still carried the pre-rebrand name "IntelliTrax".
  The medication-reminder `.ics` a patient adds to their calendar now reads
  "Insina Health reminder…", with `PRODID:-//Insina Health//Insina Health//EN`
  and an `@insinahealth` event-UID domain (`Tab04.jsx`). Lab/record export
  filenames are now `insina_labs_<date>.csv` and `insina_<type>_<date>.json`
  instead of `intellitrax_*` (`Tab13.jsx`). Also removed four unused
  `INTELLITRAX_LOGO` declarations (dead code carrying the old brand) from
  Tab08/Tab10/Tab11/Tab13 — no behavior change (Tab11 prints via `PRINT_LOGO`).
  Left intentionally unchanged: the `intellitrax-salt-2026` PIN salt (baked into
  existing companion PIN hashes — changing it breaks unlock) and internal
  provenance comments.

## v1.37.1 — 2026-07-21

### Fixed
- **Safety: onboarding bulk-accept now refuses per-item categories in the write
  layer (AUDIT_SEC_02 F-04, Med).** The §5.2 clinical-safety rule — medications,
  allergies, and conditions require explicit per-item confirmation and may never
  be bulk-accepted (C3) — was enforced only by the Review & Confirm UI choosing
  not to render a bulk button for those categories, plus a `CONFIRMATION_MATRIX`
  config flag. `confirmItemToRecord`, the single write path, had no awareness of
  bulk vs. per-item, so one config edit (`bulk:true` on medication) or any future
  loop over it would have silently bypassed the invariant. Added a logic-layer
  backstop in `src/lib/onboardingConfirm.js`: a hard-coded `PER_ITEM_ONLY` set
  (deliberately independent of the editable matrix), a sanctioned
  `bulkConfirmItems()` entry point that refuses those categories regardless of
  caller or config, and a guard inside `confirmItemToRecord` that rejects any
  `{bulk:true}` write of a protected category. `ReviewQueue`'s "Accept all
  high-confidence" now routes through `bulkConfirmItems()`. A single-item
  confirmation (the per-item path) is unchanged for every category. Five new
  cases in `scripts/testOnboarding.mjs` pin the guard and assert `PER_ITEM_ONLY`
  cannot silently drift from the matrix.

## v1.37.0 — 2026-07-21

### Added
- **Safety: deterministic AI output filter (AUDIT_SEC_02 F-03, AI-09).** The
  Clinical Safety Core instructs the model never to give specific
  medication/dose directives, but that lived only in the system prompt with no
  backstop if the model ignored or was jailbroken past it. New
  `src/lib/aiOutputFilter.js` scans AI text *after* generation for prohibited
  second-person/first-person dose or start/stop directives and redacts them
  with a visible note — deterministic and pure, the same "not the model"
  principle as the tripwire engine. Crucially, it is negation-aware: it does
  **not** flag the safe caution sentences the safety rules want ("don't stop
  your meds without asking your doctor", "only increase if your doctor tells
  you to"). Applied at every AI-render surface: the shared renderer
  (`applyBoldSafe` / `renderAiMarkdownToHtml`, covering Tab05/Tab11/Tab14/
  AnalysisOverlay), plus the three surfaces that render AI text as plain
  children and so bypass the shared renderer — Tab10 Notes summary, companion
  AILite chat, and companion Visit prep. AnalysisOverlay now filters once and
  uses that single value for on-screen render, Save-to-Notes, and
  Download-as-markdown, so the saved/exported copy can never carry a directive
  the on-screen copy already redacted. New test suite
  `scripts/testAiOutputFilter.mjs` (`npm run test:ai-filter`, 21 cases) pins
  both directions — violations caught, safe guardrail sentences left intact.

## v1.36.1 — 2026-07-21

### Fixed
- **Security: proxy rate limiter now keys on the real client IP (AUDIT_SEC_02
  F-02, Med).** `proxy/server.js` never set Express's `trust proxy`, so behind
  Render's load balancer, `express-rate-limit`'s 60/hr (`/api/chat`) and 20/hr
  (`/api/extract-pdf`) caps keyed on the LB's own address — one shared bucket
  for every user combined, not a real per-client limit. Now `app.set("trust
  proxy", 1)`: trusts exactly the one hop Render's LB appends, so the real
  client IP is used, while a value a client tries to prepend into
  `X-Forwarded-For` itself is still ignored (the difference between `1` and
  the unsafe `true`, which would trust the whole header as supplied). Verified
  locally: the proxy starts and serves normally, and a standalone IP-resolution
  check confirmed Express resolves to the correct hop in both a plain header
  and a spoofed-prefix attempt.

## v1.36.0 — 2026-07-21

### Fixed
- **Security: Emergency Card XSS (AUDIT_SEC_02 F-01, High).** `printEmergency.js`
  built the card via `document.write` interpolating patient- and AI/OCR-derived
  fields — including this weekend's new `codeStatus`/`advanceDirective`/
  `implantedDevices` free-text fields — with no HTML escaping. A crafted value
  in an imported document (condition/med/allergy/lab name, care-team field, or
  a profile free-text field) could execute script in the print window, which
  is same-origin and runs while the vault is unlocked. Every interpolation now
  routes through the shared `escapeHtml` (including inside `tel:` href
  attributes, which need quote-escaping too, not just text nodes). Card image
  data URIs are left unescaped deliberately — base64 cannot carry HTML
  metacharacters. New regression test `scripts/testEmergencyCardEscaping.mjs`
  (`npm run test:emergency-card`) plants the classic `<img onerror>` payload in
  every affected field and asserts it never appears unescaped; confirmed the
  test fails 6/7 against the pre-fix code and passes 7/7 against the fix.

## v1.35.2 — 2026-07-20

### Changed
- **Health Profile edit mode:** Code Status is now a dropdown (Full Code, DNR,
  DNI, DNR/DNI, Comfort Care Only — a stored custom value stays selectable);
  Advance Directive and Implanted Devices show example placeholder text in
  lighter type. These fields aren't part of onboarding's Quick Start Basics,
  which is unchanged by design.

## v1.35.1 — 2026-07-20

### Changed
- **Landing page:** header nav links centered between the logo and the action
  buttons; Sign In button restyled blue (text + border); the laptop mockup now
  shows a real dashboard screenshot (with the actual logo) instead of the
  CSS-built replica. The phone mockup is unchanged.

## v1.35.0 — 2026-07-20

### Added
- **24-Hour Line on care-team members.** New optional phone field ("24-Hour
  Line") in both care-team editors (Health Profile and Care Team tab). The app
  picks it up everywhere it matters: the Emergency Info screen's coordinator
  call button and the tripwire advisory dial the 24-hour line when one exists
  (office number otherwise); the Emergency Card lists members with a 24-hour
  line first, showing it bold red ("24 hr: …") with the office number
  alongside; screen cards and the Patient Profile report show it too.

### Changed
- **Landing page:** logo lockup doubled (52 → 104px, header sized to fit) and
  header text +2px (nav links and header buttons).

## v1.34.0 — 2026-07-20

### Fixed
- **Diagnostics and Procedures tabs now include Medical Records-derived
  entries** (read-only, marked "from Medical Records ↗"). Records of type
  Imaging list under Diagnostics; type Procedure under Procedures — the same
  merge the Health Profile and printed report already used, so a record whose
  studies live in Medical Records no longer sees an empty tab.

### Changed
- **Emergency Card overhaul (ED-focused):** visible Print button (auto-print
  alone stranded the card if the dialog was cancelled); sections lay out in two
  columns; new Patient Demographics & Contact section (DOB, age, sex, height,
  weight, phone, email, address); blood type as a prominent badge under the
  patient name (reads either profile field spelling); new Code Status,
  Directives & Devices section; Care Team with phone numbers, transplant
  coordinator first; stored insurance / ID card images print on the card.
- **Health Profile: three new ED-critical fields** — Code Status, Advance
  Directive, Implanted Devices — under Personal & Demographics; they print on
  the Emergency Card and the Patient Profile report when filled.
- **Patient Profile report**: blood type in the header now falls back to the
  legacy field spelling; Code Status / Advance Directive / Implanted Devices
  print under Demographics & Contact when filled.

## v1.33.0 — 2026-07-20

### Added
- **Diagnostics tab** (sidebar, My Health, after Procedures): observational
  studies — imaging, EKG, EMG, EEG, echo, and the like. Fields per study: name,
  date, ordered by, reading provider, impression, related condition (picks from
  your Conditions list), plus facility. The dividing line is intent: Procedures
  is anything done to intervene, biopsy, or treat; Diagnostics is anything
  recorded to observe. Searchable from the global search; visit-capture imaging
  from Appointments now lands here.
- **Migration v3**: existing Imaging History entries move into Diagnostics
  (name from type + body part, e.g. "MRI — Liver"); ordered-by / reading
  provider / impression start blank to fill in. Major migration — a safety
  backup auto-downloads before it runs.

### Changed
- **Surgeries renamed to Procedures** everywhere user-facing: sidebar, tab,
  global search, companion. Storage keys and internal ids unchanged.
- **Patient Profile (screen + printed report)**: "Surgical & Procedure History"
  is now **Procedures** and also includes Procedure-type records from Medical
  Records (previously those were misfiled under Imaging History on the report);
  "Imaging History" is now **Diagnostics**, showing the Diagnostics tab's
  studies plus Imaging-type records. Both profile cards are read-only mirrors —
  add/edit lives on the tabs.
- **Landing page** header now uses the full Insina Health logo lockup.

## v1.32.1 — 2026-07-20

### Fixed
- **The demo was unusable since P-02 shipped.** A demo install carries the
  fictional dataset in plaintext with no vault, but the app installed the
  storage interception unconditionally (so every `mi_*` read returned `null`)
  and started locked (so the visitor met "Encrypt your health record" instead of
  the demo). Adds `secureStorage.isDemoMode()` — true only when the demo marker
  is present **and no vault exists** — which skips the interception, the lock
  screen, the inactivity auto-lock, and the onboarding gate.
  **`hasVault()` always wins**, so a real record can never be served unlocked or
  unencrypted; verified both ways (a vault plus a forged demo marker still
  locks). The marker itself is only written by the demo loaders, which refuse to
  run when any real record is present.
- **Demo site redirect loop.** `build-demo.mjs` places the seeder at the origin
  root, where its relative `"../"` hop resolved back to itself — the demo hung on
  "Loading demo patient data…". The root seeder is now rewritten to target
  `/app/`, guarded so the rewrite throws rather than silently no-op if the source
  string changes. The build also ships `.nojekyll` (previously added by hand, easy
  to forget) and documents that `dist-demo/` is wiped each build, so a deploy
  checkout must live elsewhere.

## v1.32.0 — 2026-07-20

### Added
- **Sign In button on the landing page**, far right of the header, linking to
  the app at `/app/`. Styled neutrally so it doesn't compete with the blue
  waitlist CTA beside it. Hidden-demo rule: below 620px the header's "Open Demo"
  collapses so the three buttons don't overflow a phone (the demo is still
  reachable from the For Patients section).

### Changed
- **#49 complete — the demo now runs on its own origin.** The landing's "Open
  Demo" buttons point at `https://demo.insinahealth.com/` instead of the
  same-origin `/app/demo/`. Because browser storage is per-origin, the demo can
  no longer see, overwrite, or clear a real record under any circumstance —
  the structural fix for the 2026-07-19 incident. The in-app guards
  (v1.27.1/v1.28.0) remain as defence in depth.

## v1.31.0 — 2026-07-20

### Added
- **Last Backup date on the dashboard's Last Updated button.** The freshness
  popup already listed Labs, Meds, Vitals, Appointments, Conditions and
  Documents alongside Last Sync; it now also shows the date of the most recent
  Google Drive backup (`mi_last_weekly_backup`), so "am I actually backed up?"
  is answerable without opening Data & Backup. Rendered as a date rather than a
  clock time, since backups are weekly.

## v1.30.1 — 2026-07-20

### Changed
- **Emergency Card labs extended to five panels.** Liver Function, Kidney
  Function and Immunosuppressant Level (tacrolimus) now print ahead of the
  Metabolic Panel and CBC — the transplant-relevant values a clinician reads
  first. Each panel still shows one coherent draw (its own latest date, in the
  heading). An analyte printed in an earlier panel is not repeated in a later
  one, so the CMP/CBC sections carry only the *remaining* values. Panel order
  continues to follow Settings → Lab Category Order; panels absent from that
  list fall back to liver → kidney → tacrolimus → CMP → CBC.

## v1.30.0 — 2026-07-20

### Changed
- **Emergency Card labs are now the latest CMP and CBC only.** The card
  previously listed the most recent value per test across every panel (capped at
  16, flagged first), which mixed draw dates and buried the panels a clinician
  actually wants. It now shows **one coherent draw per panel** — the most recent
  Metabolic Panel and the most recent CBC, every value from that same date — with
  the draw date in each section heading. Panels are ordered by the patient's own
  **Settings → Lab Category Order** (`mi_lab_category_order`). Repeat imports of
  the same analyte on a draw collapse to one row. Legacy/demo category names
  (`Chemistry`/`Electrolytes`, `CBC / Hematology`) are accepted as aliases so
  older records still populate the card.

## v1.29.1 — 2026-07-19

### Fixed
- **Companion: reachable "Restore from Google Drive" + salutation.** The restore
  option was only on the setup screen; it is now also in the companion Settings
  ("Sync with the web app"), so a phone that already made its own vault can adopt
  the web app's vault without wiping. Empty-profile greeting no longer says
  "there" — it shows just the time-of-day greeting until a name syncs in.

## v1.29.0 — 2026-07-19

### Added
- **Phone ↔ web app now actually sync (companion Drive-restore).** Bidirectional
  Drive sync was already wired on both surfaces, but a fresh phone generated its
  own vault key and so couldn't decrypt the desktop's synced data. The companion
  setup screen now has **"Already use Insina? Restore from Google Drive"**, which
  rebuilds the phone from the Drive backup (envelope + ciphertext, via #50) so it
  shares the web app's vault/key — after which the existing auto-sync flows data
  both ways.
- **Tripwire advisory — staging-queue hooks + historical badge (#48).** Extracted
  labs are now evaluated against the advisory *before* per-item confirmation, in
  both staging paths (onboarding `stageExtractionResult` and the Tab12 importer).
  A recent critical fires the takeover (the modal is now also mounted in
  onboarding); a critical older than 14 days shows a **"historical critical
  value"** badge on the review row instead. Flag-gated — inert until
  `TRIPWIRE_ADVISORY_ENABLED` is turned on.

## v1.28.0 — 2026-07-19

### Added
- **Google Drive is now actually recoverable (#50).** The Drive backup now
  includes the vault's key-envelope (`_vaultEnvelope`), not just the encrypted
  data. The envelope only *wraps* the random data-key and is useless without the
  password or recovery key, so it's safe in the user's own hidden Drive folder —
  but it's the piece that lets a **wiped or new device rebuild the vault**. A
  new **"Restore from Google Drive"** button on the setup screen pulls the
  backup, lands the envelope + ciphertext, and reloads into the normal unlock,
  where the password or recovery key rebuilds the data-key and decrypts. New
  `test:vault-restore` proves the round-trip (passphrase and recovery key both
  recover on a fresh device; a backup without the envelope is correctly
  unrecoverable — the pre-fix state). Closes the gap that made the 2026-07-19
  incident unrecoverable from Drive alone.

### Fixed
- **Demo can no longer pollute a real record (#49).** The demo now sets an
  unambiguous `mi_is_demo` marker (safer than the old PIN-hash heuristic, which
  a real user with PIN 1234 could trip). Creating a real vault on a device that
  was running the demo now clears the demo data first, so Alex-Rivera demo
  content is never encrypted into a real record. (Full origin-level demo
  isolation still recommended — needs a demo subdomain.)

## v1.27.1 — 2026-07-19

### Fixed
- **Critical: the demo can no longer wipe a real record.** All demo loaders —
  the standalone `/demo/` and `/demo-review/` launchers and the in-app
  `loadDemoData()` (Data & Backup "Reset") — previously called
  `localStorage.clear()` unconditionally, which could erase a live encrypted
  record when a public "Open Demo" link (or a stale cached demo) ran. They now
  **never call `localStorage.clear()`** and **refuse to load whenever a real
  record is present** — an encrypted vault, a non-demo PIN, or any real health
  data. The demo runs only on an empty device or one already holding the demo
  dataset. (Incident: a cached pre-guard demo wiped a real record on 2026-07-19;
  recovered from a local pre-encryption backup.) Deeper isolation of the demo
  and closing the Drive-restore gap are tracked as follow-ups.

## v1.27.0 — 2026-07-19

### Changed
- **Onboarding re-themed to the light system (INSINA_UI_FORMAT_SPEC v1.0
  §1/§3/§8):** the five-step wizard now renders on the light palette — white
  ground, navy serif headlines, solid-blue primary buttons, tinted selection
  cards, warm staleness banners, and the color shield mark — via a scoped
  `.theme-light` token override on the wizard subtree. The five-node phase
  rail is replaced by the spec's DM Mono "STEP N OF 5" eyebrow + slim
  progress bar (supersedes ONBOARDING_SPEC C9's dark-workspace styling).
  Every wizard page sits on the §3 tint band (#eef4fc) with its content in
  a white paper-shadow frame, matching the approved preview.
  The dark record workspace begins at the first Dashboard load: the
  Import Records review queue and dashboard task cards keep their dark
  skin unchanged.

### Added
- **Public landing page at the site root; app moved to `/app/` (DEC-PNN
  pending: landing at root / app path move / root SW kill-switch).**
  insinahealth.com/ now serves the static marketing landing; the record
  workspace lives at `/app/` and the mobile companion is unchanged at
  `/companion/`. Because the app and companion share one source tree but need
  different base paths, the production build (`scripts/build.mjs`, wired as
  `npm run build`) runs two Vite builds into `dist/app` and `dist/companion`,
  then drops the landing at the published root with the CNAME. Service workers
  are now per-surface: `register-sw.js` self-locates its scope (`/app/` or
  `/companion/`) from its own URL, and a self-unregistering **kill-switch** ships
  at the old root `/sw.js` so previously-cached clients retire the stale
  root worker (no blind cache purge — Cache Storage is origin-wide). PWA
  manifests rescoped (`/app/`, `/companion/`) with corrected icon paths.
  Landing wiring: **Open Demo / Doctor / Investor** buttons launch the existing
  fictional-patient demo (`/app/demo/`); **Join the Waiting List** uses the
  `mailto:` flow (the only mechanism that respects the landing's no-backend /
  no-third-party-script constraints). The demo launchers now **refuse to run if
  a real encrypted record exists on the device** (they clear localStorage) —
  a data-loss guard that matters now that a public page links to the demo.
  Vault presence lights the landing's "record on this device" banner
  (presence only, never reads contents). OAuth is unaffected: the app uses the
  origin-only GIS token client, and the companion's redirect URI stays
  `/companion/` — no Google Cloud Console change needed.
- **Tripwire emergency/urgent advisory — core + manual-entry hooks (v1.27.0;
  DEC-PNN pending: tripwire advisory).** A deterministic, client-side advisory
  that flags an entered or extracted value crossing an EMERGENCY or TODAY
  threshold — never the AI. Labs draw their bounds from the existing A-01
  threshold library (single source, extended with a TODAY band; glucose
  critical-low reconciled 40→50); vitals (systolic/diastolic BP, HR, SpO2,
  temperature) are seeded fresh. Verbatim, versioned advisory templates
  (EMERGENCY/TODAY × coordinator/no-coordinator, with a staged-document
  appendix); a full-screen EMERGENCY takeover / warning-styled TODAY modal with
  911 (primary), directions to the nearest ED (platform maps deep link, no
  geolocation from Insina), and a coordinator call button; a persistent, always-
  enabled **Emergency Info** button in both the sidebar and the topbar (opens
  the same screen plus the Emergency Card). Every fire is written to a
  vault-encrypted event log included in the Data & Backup export. Hooks are
  wired at manual vitals save and manual lab save. **All threshold numbers are
  DRAFT/REVIEW-REQUIRED and advisory FIRING is gated behind
  `TRIPWIRE_ADVISORY_ENABLED = false`** until Greg signs the thresholds off; the
  Emergency Info button and templates ship regardless. 42-check suite
  (`npm run test:advisory`): verbatim template snapshots, boundary logic, the
  staged 14-day rule, a single-source drift guard, and a no-AI-import assertion.
- **UI fixes WO-1..WO-5 (2026-07-18 work order):** Log Out in the sidebar
  (session-only — clears the in-memory Drive token without revoking the
  grant, locks the vault, never touches record data); surgery entry now
  codes with **CPT** via a bundled ~150-procedure offline type-ahead
  (legacy ICD-10 entries preserved and labeled; NIH network lookup
  removed); AI Analysis send row cleared of the floating Record Integrity
  button; dashboard hot button renamed "Lab Results"; show/hide password
  toggle on every sign-in and change-password field.
- **Companion vault gate with PIN quick-unlock (DEC-034):** the phone
  companion now unlocks the P-02 encrypted record before anything renders —
  previously it ran locked, reading an empty record and silently dropping
  every capture. Password once per device, then a 4–8 digit PIN (PIN-derived
  KEK wraps the same DEK; 5 wrong tries deletes the PIN envelope and falls
  back to password). Fresh devices get on-phone vault setup with the
  one-time recovery key. After unlock: data migrations + an immediate Drive
  re-sync.
- **Companion vitals — full 10-field capture:** the phone's New Reading form
  now matches the web modal (Date, BP sys/dia, Heart Rate, Resting HR,
  O2 %, Weight, Temp, Glucose, Sleep), all covered by the A-12 plausibility
  guard; recent-readings rows show the new fields. Quick Log's voice path
  files resting HR, glucose, and sleep too.
- **Center Record button:** Doctor Visit Capture moved to a prominent
  center bottom-nav button (Today · Meds · ●Record · Log · Care), one tap
  from anywhere; today's appointment attaches automatically. AI chat moved
  to Today's quick actions.
- **Web auto-refresh:** the web app now re-syncs from Drive every 5 minutes
  while visible (in addition to the existing load/focus pulls), so
  phone-logged vitals appear without pressing Sync Now.

### Fixed
- **Evening entries dated tomorrow:** companion date defaults (`toISO`,
  `mkReading`) used UTC, so vitals/symptoms logged after ~7 PM US time
  landed on the next day's date. Now local calendar date.

- **Onboarding WP1–WP3 (ONBOARDING_SPEC v1.1):** new-user flow shell —
  consent gate with hard extraction block, five-phase rail, resume state,
  goal selection, Tier 0 basics; Add Data surface (upload with ZIP/password
  handling and per-file status pipeline, photo multi-shot, portal paste,
  guided manual medication entry with offline autocomplete); staging queue
  review with the §5.2 confirmation matrix, §5.3 duplicate/conflict Compare
  (keep current / replace / keep both / field-level merge), §4.5 document
  staleness, mandatory source side-by-side panel, and 30-day rejected-item
  recovery reachable from Import Records. Extraction runs behind a single
  gated interface (fixture mode default; live proxy client built to the
  §4.1 contract). 43 unit tests (`npm run test:onboarding`). User-facing
  "passphrase" renamed to "password" app-wide (Greg's review direction).
  Details and the session decision log: docs/ONBOARDING_SESSION_2026-07-16.md.

---

## v1.26.0 — 2026-07-15 (Phase 1: UI production readiness)

### Changed
- **UI-7 (Appointment duplicates):** manually adding an appointment that
  looks like one already on file (same date + similar title, or same date
  + same provider) now prompts — Use existing / Update existing / Keep
  both — instead of silently creating a duplicate. Nothing is saved or
  discarded until the user chooses. Edits, reschedules, and Confirm on a
  synced suggestion keep their identity and never trigger the prompt;
  Google Calendar sync already routed everything through the suggested-
  review gate and is unchanged.
- **UI-29 (Save/unsaved-change behavior):** the appointment and condition
  modals now prompt before discarding a dirty form (Keep editing /
  Discard); saving shows a brief "saved" confirmation with a ✓ text
  marker, announced to screen readers (role="status"). Repeated-click
  safety and error data-preservation were already satisfied by the
  synchronous save flow.
- **UI-26 (Search):** selecting a search result now opens the underlying
  record, not just its tab — labs open the lab's detail view, medications
  select the medication, conditions filter to and expand the card,
  appointments expand the row (filter widens to "all" so past visits
  aren't hidden), symptoms open the entry detail, and source documents
  select the matching document (plain navigation when only a reference
  summary matches). The handoff travels through sessionStorage
  (`src/lib/searchSelect.js`) so it works across the standalone tabs, and
  an event covers the already-on-that-tab case. A Search button now sits
  beside Home (same visual weight, accessible name "Search") on the
  Medications, Labs, Vitals, and Symptoms standalone screens — previously
  search was unreachable from them — and the App topbar's dim search icon
  moved next to Home with the same styling. Symptom search fixed: entries
  store `symptom`/`note`, but search only read `name`/`notes`, so symptom
  results never appeared; numeric fields (e.g. severity) no longer crash
  the matcher.
- **UI Track U2 — per-module production readiness (nine items):**
  - **UI-16 (Labs chart):** the trend chart shows exactly one range band —
    Doctor's Range when set, else the lab's printed range, never both
    (display rule only; AI text still references both); every point gains a
    hover reveal of full date + value; the legend names which range is
    shown. "Last import" is now one truthful helper — Tab04 had a hardcoded
    fake date and Tab05 read the oldest log entry.
  - **UI-18 (Care Team):** renamed from Care Plan/Team; keeps Care Team,
    Emergency, Reference; Timeline/Goals/Preventive/Milestones removed from
    the interface only (components + data intact for Phase 2); the module's
    duplicate 120px logo masthead replaced by the standard slim header.
  - **UI-25:** approved care-team selection descriptor ("…shown on your
    Dashboard and Health Profile").
  - **UI-19 (Medical Records detail):** truthful Source line on every record
    (Imported from PDF / Entered manually / Imported from Epic export) +
    date added; imported records link to their Source Document via an
    inline viewer of the stored extracted text; all Tab12 record creators
    stamp source/addedAt and link their ref doc; the fake "Open in Epic"
    example.com button became a plain Epic ID chip; Summary/facility/
    provider render only when present — no empty headings.
  - **UI-20 (Import Records):** Upload Document / Manual Entry / Import
    History are explicit modes (manual form hidden until selected); Import
    History now renders a real log — every PDF import path writes an entry
    (name, date, records created, excluded-in-review, linked doc, status;
    discards trace too); extract → review → save and correct/exclude before
    save unchanged.
  - **UI-21 (Export & Backup vs App Settings):** two distinct pages behind a
    selector; Danger Zone stays on the backup page, separated, with
    confirmations; Security gathers passphrase change + auto-lock + pilot
    token; Lab Organization gets 38px ordering targets with aria labels;
    Reset-to-Demo renders only when VITE_DEMO_BUILD is set and the stale
    "Demo PIN: 1234" note is gone (PIN auth ended with P-02). Deviations:
    no Display & Accessibility section yet (no display controls exist — an
    empty heading would break UI-19's own rule); BYO-key stays dormant per
    A-10/DEC-016 rather than resurfacing.
  - **UI-23 (Profile printing):** the report preflight now surfaces only
    critical findings — warning/info nags (optional blanks, missing refill
    dates) stay in the Review Queue instead of a pre-print warning wall;
    the printed header lists only demographics that have values.
  - **UI-24 (Conditions & Surgeries):** condition search (name/ICD-10/
    notes) + long-notes collapse; surgeries sort reverse-chronologically at
    render time and always print a full date with year (legacy non-ISO
    dates previously rendered "Invalid Date").
  - **UI-22 (Symptoms):** full numbered 1–10 severity scale with marker,
    score, and label ("Moderate · 5/10") on every card; Mark as Resolved
    records and displays the resolution date; free-form entry moved above
    the catalog.
- **UI-1 Foundation visual work (DEC-033), live-verified against the real
  record:**
  - **UI-8:** design tokens established in `src/index.css` (:root custom
    properties — surface/text/accent colors, font stacks, 15px body/nav,
    13px floor, 44px touch targets); the shared shell consumes them. Google
    Fonts load once from index.html — the identical `@import` previously
    duplicated in 16 files' `<style>` blocks is removed. Inline sizes in tab
    content bodies adopt the tokens progressively as later UI items touch
    each module.
  - **UI-10:** one shared sidebar (`src/components/AppSidebar.jsx`) replaces
    the five byte-identical copies in App.jsx and the four standalone tabs
    (Medications, Labs, Vitals, Symptoms), which also carried their own NAV
    arrays and nav CSS. No module has a competing global nav definition
    anymore.
  - **UI-9:** the nav renders as three collapsible groups — Today / My
    Health / Records & Tools — with collapse state persisted (plain
    non-vault key), the active screen's group force-expanded, and
    **Emergency Information pinned on every screen** (opens the printable
    packet; builder moved to `src/lib/printEmergency.js`). Follow-up fix:
    clicking the active group's header no longer silently stores a collapse
    the user never saw.
  - **UI-14:** shared stroke-SVG icon family in `icons.jsx` replaces every
    emoji in routine controls — dashboard hot buttons (🧪💊📅🤒❤️⬇🔄🚨🕐),
    backup banner (💾), Tab11 Clear All (🗑), Tab10 pins (📌). The primary
    nav keeps its existing uniform geometric-glyph family (not emoji).

### Fixed
- **Restore:** pre-encryption snapshot backups import without value
  corruption (raw JSON-string values pass through instead of being
  double-encoded), and restore now carries every `mi_*` key except the
  vault/security keys — the previous allowlist silently dropped records,
  cards, and settings.

---

## v1.25.0 — 2026-07-14 (Phase 1: pilot gate)

### Fixed
- **Data migrations never ran on encrypted vaults + restore-flow gaps
  (found by real-data live verification):** three connected fixes.
  (1) `main.jsx` ran the A-08 migrations at boot, before any unlock — under
  P-02 every managed key reads null while locked, so a data migration
  (A-12's mi_readings normalization onward) silently no-op'd yet still
  stamped its version, permanently skipping itself. Boot now runs
  migrations only when no vault exists (legacy plaintext installs, first
  run); encrypted installs migrate in LockScreen's `afterUnlock()`, once
  the record is actually readable — verified live: 8/8 real restored
  readings normalized on unlock.
  (2) Restore-from-file while locked silently wrote nothing (secureStorage
  drops managed-key writes when locked) while still toasting "Restored N
  data sections." Restore now refuses up front with a clear message.
  (3) Restored backups bypassed migrations entirely (the device's version
  stamp was already current). Restore now resets the stamp to the v1
  baseline so the next unlock re-runs the idempotent data migrations
  against whatever shape the backup carried.
- **Manual lab entry crash (pre-existing), found by live verification:** the
  Add Lab Result form's category dropdown referenced `LAB_CATEGORIES`, a
  constant that doesn't exist (it's `ALL_LAB_CATEGORIES`) — a
  `ReferenceError` that crashed the whole Labs tab the moment the form
  opened. Introduced by a pre-session commit ("Fix 6 user-reported issues"),
  invisible to the build because it's a runtime reference. Manual lab entry
  had been unusable since.
- **A-12 stale flag on corrected readings, found by live verification:**
  applying a plausibility-gate suggestion patched the field value but kept
  the `flag` computed from the original typo — a systolic of 1138 corrected
  to 113.8 still saved as a flagged reading and raised a false "Flagged
  vital reading" dashboard alert. The default flag rule now lives in one
  place (`defaultVitalFlag()` in vitals.js) and every suggestion-apply path
  (Tab06, Dashboard Quick Vitals, both companion paths) recomputes it.
- **P-02 data-remanence bug (DEC-032), found by live verification:** "Erase &
  Start Fresh" (the destructive reset when both passphrase and recovery key
  are lost) ran from the lock screen while locked, and `secureStorage`'s
  patched `removeItem` only forwarded managed-key deletions to real storage
  when *unlocked* — so the reset cleared only the exempt keys and left every
  encrypted health blob orphaned on disk. `removeItem` now always clears real
  storage for managed keys (deletion never needs the DEK). Verified by a new
  Node regression test and live in-browser.

### Removed
- **Dead-file cleanup (OPEN-13, UI-1 track):** Deleted
  `src/components/Dashboard.jsx` and `src/components/Sidebar.jsx` — both
  unimported anywhere (the live dashboard and sidebar are inline in App.jsx).
  Dashboard.jsx also carried stale crash-prone code and an out-of-date NAV.

### Changed
- **UI-14 (Print, partial):** One consistent printer icon + visible "Print"
  label across every print control. New `src/components/icons.jsx` exports a
  shared inline-SVG `PrinterIcon` and a `PrintLabel` (icon + label as one
  alignment-safe inline-flex unit). Replaced the inconsistent print-button
  treatments — the `⎙` glyph (renders unevenly across platforms), the `🖨`
  emoji (Tab02, Tab12), and a `✦` used for a print action (Tab11 Summary) —
  in every real print button: AnalysisOverlay, Tab02/04/05/06/09/10/11/12/14/
  15/16, and the two consent-print buttons. Icon-and-Print scope only; the
  broader UI-14 icon-family unification (nav glyphs, emoji hot-buttons) stays
  with the deferred U1 visual work.
- **UI-11 (labels):** Standardized nav labels — Profile → Health Profile,
  Records → Medical Records, Documents → Source Documents, Notes → My Notes
  (Import Records already matched). Applied in the shared sidebar (App.jsx),
  the four standalone tabs' duplicated NAV arrays (Medications, Labs, Vitals,
  Symptoms), and the Search result categories. "Export & Backup" and "App
  Settings" both still map onto the single Settings & Backup tab; splitting
  them is a new tab, not a relabel, so it's left as one entry (follow-up).
  Renamed early so later UI items use the settled names.

### Added
- **A-04 (minimal) / UI-3:** Lab test-name canonicalization + flag badge. New
  `src/lib/labCanonical.js` resolves a lab name to one canonical grouping id
  (seed synonyms — FK506 = Tacrolimus, SGPT = ALT, eGFR = Estimated GFR, etc.
  — plus the patient's confirmed `mi_lab_name_map`). Every grouping site now
  keys on it: the 12-month digest, Tab05's dedupe / detail history / print,
  custom-range lookup, and the tripwire engine's per-analyte dedupe (its
  former 4-entry inline alias table is gone).
  - **Group Tests** (Tab05, replaces the old "Duplicate Lab Names" merge):
    the previous merge rewrote `lab.name` in place — destructive,
    irreversible, and its `mi_lab_canonical` output was never read. Grouping
    is now a reversible name map: source records keep their original names,
    the chosen canonical label is applied at render only, and Ungroup
    restores the originals. The panel is always available (manual grouping of
    arbitrary names), shows confirmed groups with Ungroup, and still surfaces
    auto-detected candidates for one-tap confirmation — nothing groups
    silently.
  - **Ordinary flag badge:** a compact amber "FLAGGED" badge on out-of-range
    values in the lab list, deliberately amber so it never reads as the red
    urgent/tripwire treatment.
  - Custom ranges are now keyed canonically (a range set on Tacrolimus also
    covers FK506); existing raw-keyed ranges still resolve via a fallback.
    `mi_lab_name_map` is added to backup/restore and syncs to Drive. The RIE
    "same test under different names" nag now uses the unified id and stops
    firing once a grouping is confirmed.
  - Verified: `npm run build` passes; 9-check Node harness passes (seed
    grouping, confirmed mapping + reversibility, records never rewritten,
    digest collapses aliases to one analyte, canonical custom-range
    resolution). Live browser verification deferred (OPEN-14, vault-locked
    dev app).
- **A-13 / merged UI-15:** Analysis context gathering + AI screen. The
  prompt-side rules (v2.3 CONTEXT GATHERING, {sessionContext}, v2.4
  four-section response structure) already existed in `src/prompts/`; this
  item wires them to real UI and closes the gaps around them (DEC-029).
  - New `src/components/AnalysisOverlay.jsx`: analyses open in a
    full-screen in-page overlay (modal, not window.open — popup blockers
    and the mobile PWA are non-issues) with Print through a print
    stylesheet scoped to the overlay (branded header/footer render only in
    print), "Save to My Notes" with the explicit AI-generated label
    (DEC-022), and a dated markdown download carrying the {lastSync}
    freshness stamp and the standing Surface H footer. Shared helpers in
    new `src/lib/analysisExport.js`.
  - `Tab05.jsx` (Labs): new optional free-text field on the Full Analysis
    launch flows in as {sessionContext} (patient-reported, never record
    data); Full Analysis always opens in the overlay. The old silent
    auto-save to Notes is removed — it wrote a flat note shape Tab10's
    editor crashed on; saving is now the overlay's explicit, labeled
    button.
  - `Tab11.jsx` (AI Analysis): Quick Prompts and the context panel
    (renamed "Data used in this analysis") are collapsible; compact mode
    bar with a Change action into Settings; model names de-emphasized
    (raw model-id chip removed, badges say Standard/Advanced); responses
    carry timestamps and an "Open as report" control into the overlay;
    save-to-Notes uses the shared AI-labeled note shape.
    - **Fixed two real Tab11 bugs found in passing:** `buildDataSections()`
      formatted vitals from field names nothing writes
      (`systolic`/`pulse`/`spo2`), so BP/HR/O2 silently never reached
      Surface A; and `sendMessage`'s audit-log call referenced an
      undefined `model` variable, throwing inside the success path and
      replacing every completed streamed answer with "Error: model is not
      defined."
  - **Companion Surface G safety gap closed:** `buildSurfaceG()` (the
    CSC-backed symptom-prep prompt) existed but was never called — the
    "Ask Insina about this" symptom handoff ran on a thin ad-hoc prompt
    with no Clinical Safety Core, tripwire envelope, or rule-5 emergency
    routing. Symptom handoffs now run the whole session on the Surface G
    system prompt with the spec's payload (new
    `buildSymptomPrepSystem()` in `companionAI.js`), inheriting Surface
    A's context-gathering rules. The companion's generic chat remains on
    the lightweight prompt — no spec surface covers it; logged as OPEN-15.
  - `Tab10.jsx` (Notes): AI-generated notes show an explicit AI badge in
    the list and an AI-generated banner in the editor with a markdown
    download; legacy note shapes from the two older AI writers (flat
    `content`, `heading` sections) are normalized read-time so they open
    instead of crashing the editor.
  - Verified: `npm run build` passes; 7-check Node harness passes
    (canonical note shape + AI label, markdown export stamps/footer,
    Surface G system carries CSC/tripwire/context-gathering/no patient
    name, B1 sessionContext injection present and absent, Surface A four
    sections). Live browser verification deferred with A-12's (OPEN-14 —
    vault-locked dev app).
- **A-12 / merged UI-4:** Input plausibility guard + one shared vital schema.
  New `src/config/plausibilityBounds.js` (versioned hard/soft bounds per
  vital and per lab analyte) and `src/lib/plausibility.js`
  (`checkVitalReading`/`checkVitalCrossFields`/`checkLabReading`/
  `suggestCorrections`) — a deterministic, AI-free check distinct from the
  tripwire (A-01): hard band (physiologically impossible) blocks the save
  with correction-suggestion buttons the patient picks from, nothing
  auto-corrects; soft band (implausible but possible) confirms and saves
  with one tap and never blocks (DEC-019).
  - New `src/lib/vitals.js`: one shared vital schema/helper
    (`mkReading`/`saveReading`/`getLatestFieldValue`/`getFieldHistory`/
    `getSyntheticLatestReading`) replacing four independently-written
    vital-save paths (two in the desktop Vitals tab, two in the companion
    app) that disagreed on shape, plus a fifth, previously-undocumented one
    found during this item — the Dashboard's "Quick Vitals" modal in
    `App.jsx` (DEC-028). Readings are now id-keyed, not date-keyed, so two
    legitimate same-day readings never silently collide; a blank field is
    always `null`, never silently carried forward from the last reading
    (the exact bug UI-4 named for removal); `enteredAt` is stored separately
    from the reading's own editable date/time.
  - New migration v2 in `src/lib/migrations.js` (A-08 rails): normalizes
    every pre-existing `mi_readings` entry onto the shared schema
    regardless of which of the old shapes produced it, idempotent on
    re-run.
  - `Tab06.jsx` (desktop Vitals): both save paths route through the guard;
    added an optional Time field alongside the existing editable Date;
    fixed per-field "latest/previous" computation (a partial entry in one
    field no longer hides an earlier real reading in another) for both the
    selected-vital view and every sidebar card independently; fixed
    inconsistent O2/SpO2 labeling (chart, inline form, history table) to
    read "O2 Saturation"/"O2 Sat %" throughout.
  - `Tab05.jsx` (Labs): manual lab entry (`handleAddLab`) routes through the
    same guard for the single lab value.
  - Companion `Log.jsx`: both write paths (structured Vitals tab, Quick
    Log's AI-drafted vital branch) route through the shared helpers and the
    guard; Quick Log now shows the reading date (editable) before filing,
    per UI-4.
  - `App.jsx`'s Dashboard "Quick Vitals" modal: rewired off its own
    carry-forward + date-keyed `mergeReadings()` write path onto the shared
    helpers and the guard; added a real Date/Time picker in place of a
    free-text date field.
  - `src/rie/consistencyChecks.js`: new `checkVitalPlausibility()` /
    `checkLabPlausibility()`, wired into `runConsistency()` — reuses the
    existing Review Queue as the extraction-path / background-audit
    surface the spec calls for, rather than building new UI.
  - `src/components/Dashboard.jsx` was found to be dead code (not imported
    anywhere — the live dashboard is inline in `App.jsx`) and left
    untouched; flagged as OPEN-13 for its own small cleanup.
  - Verified: `npm run build` passes; Node-level unit tests against
    `plausibility.js`, `vitals.js`, and `migrations.js` all pass. Live
    browser verification of the gates was skipped this session — the dev
    app is now locked behind the P-02 vault passphrase; flagged as OPEN-14.
- **P-06 / PG-11 and P-05:** Legal drafts. New `TERMS_OF_SERVICE.md` and
  `PRIVACY_POLICY.md` at repo root — plain-language, both explicitly marked
  DRAFT pending attorney review, describing the non-custodial architecture
  accurately (including P-03's proxy-logging scope) rather than
  aspirationally. New `INCIDENT_PLAYBOOK.md` (P-05): breach scenarios given
  the actual architecture, immediate response steps, and the FTC Health
  Breach Notification Rule's general notification framework (exact
  triggers/deadlines flagged for counsel confirmation at the time of any
  real incident, since the rule has been amended before).
  - **Found and fixed a real "zero-log" overstatement (P-03) in three
    places** the audit was specifically looking for: `AIModeOnboardingModal.jsx`
    and `PrintableConsent.jsx` (both the printable and inline consent text)
    called Insina's proxy "zero-logging" without qualification. Corrected to
    "does not store or log message content," with the caveat that Render's
    hosting infrastructure still retains standard HTTP access metadata
    regardless of the app's own code — `proxy/DEPLOY.md` gets the same
    correction.
  - **Found and fixed a genuinely self-contradictory line** in Tab13's FAQ:
    "Is my data private?" claimed data "never leaves your device" in the
    same sentence that acknowledged AI requests are routed through a proxy
    — the exact pattern spec section P-06 names for removal. Rewritten to
    match the approved UI-5 wording. A parallel "data stays local" label in
    Tab11's AI-chat footer had the same problem and is fixed the same way.
  - **New "Before You Start" section in `AIModeOnboardingModal.jsx`**,
    required for either AI mode (not just Advanced — Standard Mode's own
    first use is a first AI use too): the UI-5 approved wording verbatim,
    an expandable "What information is sent?" explanation, an explicit
    "pseudonymous is not anonymous" statement, and a pre-commercial /
    not-a-medical-device acknowledgment checkbox that now gates the confirm
    button regardless of which mode is chosen.
  - **New "Legal" section in Settings** (Tab13) with a "View" button
    surfacing condensed Terms/Privacy content in-app, clearly marked DRAFT
    with a pointer to the full documents in the repository — the "terms/
    privacy page" the spec's own "Where" names.
  - Visit-capture's existing recording-consent screen (Mississippi/Louisiana
    two-party-consent awareness, "always ask first") is unchanged and keeps
    its own separate external-validation requirement before that feature
    ships to any pilot user beyond Greg — confirmed present, not touched.
  - Verified: `npm run build` passes. Live-verified in the browser: the new
    onboarding section renders with the correct copy, the "What information
    is sent?" toggle expands correctly, the confirm button is correctly
    gated until the acknowledgment is checked (for Standard Mode as well as
    Advanced), and the new Settings → Legal modal opens and displays the
    intended content.
- **A-10:** Settled decision recorded, no implementation this item. Verified
  all three requirements already satisfied by earlier work this phase: the
  DEC entry (`DEC-016`: BYO key stays, hardened at S-08, dormant through the
  pilot — A-02 already removed the direct-to-Anthropic calls) was already
  logged; the parked proxy-forwarded-vs-direct routing sub-decision was
  already noted in `FEATURE_INTAKE.md` as `CL-033`; and Tab13's API-key
  modal is confirmed genuinely unreachable — `setModal("apikey")` is never
  called anywhere in the codebase, so the modal renders conditionally on a
  state value nothing ever sets. No code change needed.
- **P-02 / PG-10:** Passphrase-derived encryption at rest. The passphrase
  IS the encryption key now, not a UI gate — in a non-custodial, server-less
  architecture a password that only unlocks a screen protects nothing, since
  the data sits in plaintext localStorage either way.
  - New `src/lib/vault.js`: PBKDF2-SHA256 (600,000 iterations, random
    16-byte salt) derives a passphrase KEK; a random 256-bit AES-GCM DEK
    (fresh 12-byte IV per encryption, never reused) actually encrypts the
    record; the DEK is wrapped twice — once under the passphrase KEK, once
    under an independent one-time-shown 256-bit recovery key — so a
    forgotten passphrase can never destroy the record. Changing the
    passphrase re-wraps the DEK only; no data is ever re-encrypted.
  - New `src/lib/secureStorage.js`: the integration layer. **Architecture
    decision (DEC-027):** P-02's spec assumed `store.js` was the access
    point for `mi_*` data; a grep found 167 direct
    `localStorage.getItem/setItem/removeItem` call sites across 25 other
    files bypassing it entirely, matching OPEN-6's own prior finding that a
    storage abstraction layer didn't exist yet. Greg chose Storage-API
    interception over building that abstraction first:
    `Storage.prototype.getItem/setItem/removeItem` are patched for `mi_*`
    keys against an in-memory plaintext cache (populated by decrypting
    every ciphertext blob at unlock — WebCrypto is async, `getItem` isn't,
    so this is how the two are reconciled without an async rewrite of every
    call site). Every existing call site keeps calling
    `localStorage.getItem/setItem` completely unchanged and transparently
    gets plaintext in, ciphertext out. Locked reads of a managed key return
    `null` (fail-safe), never raw ciphertext.
  - **Migration:** `setupVaultAndMigrate()` — backup-export first (a
    pre-migration JSON download, LockScreen-triggered), encrypts each
    existing plaintext value in place, round-trip-verifies it before the
    plaintext is overwritten, and only clears the interrupted flag once
    everything is verified. Resumable: the envelope is persisted *before*
    any data is encrypted specifically so a retry after an interruption
    re-derives the same DEK from the same envelope rather than generating a
    new, incompatible one (a real bug caught during testing — see below).
  - **Drive sync (`driveSync.js`) uploads ciphertext only** (spec point 7):
    a new `collectLocalCiphertext()` reads raw ciphertext blobs for Drive
    upload/weekly-backup, distinct from the existing `collectLocalData()`
    (unchanged, still plaintext — it backs the local "download backup" file
    the patient explicitly downloads to their own device, same reasoning as
    Tab13's export feature staying human-readable). `mergeIntoLocal()`
    decrypts Drive ciphertext and local ciphertext before merging arrays/
    objects, then re-encrypts on write — never writes plaintext to disk.
  - **`LockScreen.jsx` rebuilt** around passphrase setup / unlock /
    recovery-key entry, replacing the 4-digit PIN flow. The old "Forgot
    PIN → delete all data" destructive reset is replaced by the recovery-key
    unlock path; a destructive wipe remains available only as the explicit
    last resort when both the passphrase and recovery key are lost (per
    spec point 9, there is nothing else to offer at that point — the data
    is cryptographically unrecoverable). `App.jsx`'s inactivity auto-lock
    now calls `secureStorage.lock()`, clearing the DEK from memory so a
    timeout genuinely re-requires the passphrase (point 6); the initial
    `unlocked` state no longer trusts `sessionStorage.mi_unlocked` — a page
    reload always starts locked, matching how real disk-at-rest encryption
    behaves. Tab13's "Change PIN" settings panel is replaced with "Change
    Passphrase" (`secureStorage.changePassphrase()`) rather than left in
    place — a working PIN-change UI that no longer gates anything would
    itself be the false-security pattern this item exists to eliminate.
  - **Deferred (DEC-027, OPEN-11):** spec point 6's optional PIN
    "quick-unlock" convenience layered in front of an already-unlocked
    vault is not built in this pass — every unlock goes through the real
    passphrase or recovery key. `urgencyThresholds.js`-style dead PIN code
    (`hashPin`) removed.
  - **Bugs found and fixed during testing, before any real data was ever at
    risk** (per Greg's own instruction to test thoroughly with synthetic
    data first): a migration retry after an interruption was deriving a
    *new* DEK instead of re-unwrapping the original, which would have
    permanently orphaned any key already encrypted under the first attempt
    — fixed by persisting the envelope before encrypting any data; the
    resume path was populating the in-memory cache only for freshly-
    encrypted keys, leaving already-migrated keys unreadable after a
    successful resume — fixed to decrypt-and-cache skipped keys too; live
    browser testing surfaced that `setupVaultAndMigrate()` could be invoked
    concurrently (most likely React 18 StrictMode's dev-mode double-invoke)
    causing a real race — fixed with an in-flight promise guard.
  - Verified: `npm run build` passes. Three Node test suites (vault.js
    crypto core, secureStorage.js integration including a simulated
    interrupted-migration resume, driveSync.js ciphertext decrypt-merge-
    re-encrypt) — 33/33 checks passed, covering round-trip encryption, IV
    uniqueness, AES-GCM tamper detection, wrong-passphrase/wrong-recovery-
    key rejection, passphrase change without data loss, and the concurrency
    guard. Live-verified in the browser end to end: fresh setup → passphrase
    creation → recovery-key display → continue → writing a real condition
    through the UI → full page reload (confirms the DEK is genuinely gone
    from memory, not persisted) → locked reads correctly return null →
    unlock with the passphrase → the condition is readable again.
- **S-07:** Prompt-injection defense at prompt-build time. New
  `src/prompts/documents.js`: `stripControlChars()` removes C0/C1 control
  characters (keeping `\n`/`\t`); `formatDocumentBlock({id, source, date,
  text, maxLength})` wraps one document excerpt as
  `[DOCUMENT id=... source=... date=...] ... [END DOCUMENT]`, appending a
  visible `[TRUNCATED]` marker *inside* the block when capped — CSC rule 9
  handles the model side (documents are content, never instructions);
  this is the app-side half spec §S-07 asks for.
  - **Wired into every document-injection point still using raw
    concatenation:** Tab11's reference-document section (already had
    informal `[Document: "name" | ...]` brackets — replaced with the real
    delimiter format; the per-document/total-budget truncation logic is
    preserved exactly, now tracking actual post-strip byte counts rather
    than the cap itself, so budget-sharing across multiple documents in one
    request behaves the same as before). Tab09's `apiSummarizeDoc`/
    `apiExtractFindings` and Tab12's `parseDocWithClaude`/
    `parseLabsWithClaude` had **no delimiting at all** — raw document text
    concatenated straight into message content with a silent `.slice()`
    truncation the model was never told about. Tab14's `buildDocContext()`
    (Consultation Prep's document-search injection) had the same gap. All
    four now go through `formatDocumentBlock()`.
  - Verified: `npm run build` passes. A standalone test confirmed control
    characters are stripped without touching printable text, truncation
    produces a `[TRUNCATED]` marker inside the block, an under-cap document
    gets no marker, and Tab11's multi-document budget-tracking loop
    consumes exactly the post-strip byte count per document (not the
    cap) — the first two documents fit fully, a third that exceeds the
    remaining budget truncates correctly, and a fourth is correctly omitted
    once the budget is exhausted.
- **P-01:** Identity minimization in AI payloads. `src/prompts/identity.js`
  (built ahead of schedule during A-09, since the prompt builders needed
  `{userId}`/`{age}`/`{sex}` to construct the CSC at all) is the module the
  spec names as new `src/lib/identity.js` — same requirements, different
  path; A-09's builders already only ever accept `{userId, age, sex,
  dataSections, sessionContext}`-shaped payloads, so the "explicit field
  allowlist, structurally excluded rather than filtered" requirement was
  already true by construction for every Surface A–H module (confirmed by
  grep: the only `.dob` reference anywhere under `src/prompts/` is inside
  `getAge()`, which reads it only to compute age and never returns or sends
  it). Tab05 and Tab10 were also already fixed to `{userId}` during A-09.
  This item's real remaining work was auditing every other AI call site.
  - **Found and fixed a genuine identity leak the audit exists to catch:**
    `companionAI.js`'s `buildRecordSystem()` — the shared system-prompt
    builder for the companion app's AI Lite chat, Quick Log symptom prompts,
    and visit summarization — spliced the patient's real name
    (`mi_profile_personal.name`) directly into the system prompt sent to
    Claude: `"You are Insina, a personal health assistant for ${p.name}..."`.
    Because three call sites shared this one function
    (`companionAI.js` itself, `AILite.jsx`'s `system: buildRecordSystem()`,
    and `visitCapture.js`'s `summarizeVisit()` — which inlined the *entire*
    returned string, name included, into the AI *message content*, not just
    the system field, an even more easily-missed leak), one fix at the
    source closes all three. `buildRecordSystem()` now uses `getUserId()`
    the same way Tab05/10/11 do.
  - Audited every other AI-calling file (Tab09, Tab12, Tab14,
    `Log.jsx`, `VisitFlow.jsx`) for the same pattern: none read
    `mi_profile_personal`/`mi_profile_insurance` or any prohibited field
    into a prompt. The many other `mi_profile_personal` reads found
    throughout the app (App.jsx, Dashboard.jsx, Tab04/05/06/07/11/13) are
    all UI display of the patient's own data on their own device — sidebar
    labels, greetings, avatar initials, the local backup/export JSON — none
    reach an AI call.
  - Verified: `npm run build` passes. Manual trace of both fixed call sites
    confirms `buildRecordSystem()`'s output no longer contains any
    `mi_profile_personal` field.
- **A-01 / PG-09:** Deterministic tripwire engine. New `src/lib/tripwire.js`
  evaluates labs against effective thresholds and produces the evaluation
  envelope (`status`, `evaluatedAt`, `newestLabDate`, `flags[]`) that
  `INSINA_AI_PROMPTS.md` §6 defines for `{tripwireFlags}` — this is the only
  thing that classifies urgency (CSC rule 4); the AI echoes, never
  originates. New `src/config/tripwireDefaults.js`: the generalized default
  threshold library, replacing `urgencyThresholds.js`'s old
  `URGENCY_THRESHOLDS`/`getUrgencyLevel` (deleted — hardcoded to one
  patient's transplant context and, per that file's own prior "Why," already
  consumed by nothing; `CONSENT_VERSION` is all that remains in that file,
  an unrelated AI-consent-versioning export). Precedence: provider custom
  range (abnormal tier) then reviewed default library (urgent tier); a
  "user-confirmed" tier is structurally present per spec but a no-op until a
  future item adds a store for it.
  - **Threshold numbers (DEC-026):** rather than pick clinically significant
    panic values unilaterally, Greg was asked directly. v1 seeds six
    genuinely diagnosis-agnostic analytes only — Potassium, Sodium, Glucose,
    Hemoglobin, Platelets, WBC — sourced from widely published clinical
    critical-value conventions, urgent tier only. Ships `reviewedBy: null`,
    gated by the same `mi_allow_unreviewed_modules` flag as A-06's condition
    modules: zero urgent flags for any user, including Greg, until reviewed
    and approved. Transplant/tacrolimus-specific content from the old file
    is deliberately left out of v1 (OPEN-10).
  - **Envelope status (DEC-026):** `getTripwireEnvelope()` reports
    `"unavailable"` — not spec's literal "current, no flags" — whenever the
    default library is unreviewed and no provider-custom ranges exist to
    evaluate instead, since "current, no flags" would otherwise read to CSC
    rule 4 (and therefore the patient) as a clean bill when almost nothing
    was actually checked. Status is always recomputed fresh against live
    `mi_labs` on read, never trusted from the stored envelope, so a lab that
    arrives without a re-run correctly shows `"stale"`.
  - **Hooks at import, sync, and manual entry** per spec's own instruction
    to reuse "the existing mi-data-synced event": `tripwire.js` registers a
    listener on that event once at module load (imported from `main.jsx` so
    it's always active app-wide), so any current or future `mi_labs` writer
    that already dispatches the event gets evaluation for free. Tab05's
    manual-entry and duplicate-merge write sites, which didn't dispatch it
    before, now do.
  - **Fixtures wired into prebuild:** new `scripts/testThresholds.mjs`
    (plain Node, no new test-framework dependency) — input values in,
    expected flag level/bound out, per §6's acceptance-test requirement.
    `package.json` gains `test:thresholds` and a `prebuild` script that
    runs it, so `npm run build` now fails on a fixture regression before
    Vite even starts. 19 fixture assertions across all six analytes,
    boundary values (exactly-at-threshold does not flag), and the review
    gate itself.
  - **`labDigest.js` (A-03) wired to real per-analyte status:** each digest
    line's `tripwireStatus` field, hardcoded `"unavailable"` since A-03
    shipped ahead of this engine, now reports the real per-analyte flag
    status when a `tripwireEnvelope` is passed in (optional parameter,
    backward compatible).
  - **UI surfacing (Tab05):** a dismissible urgent-flag banner (mirrors the
    existing duplicate-detection badge's visual pattern) and an always-
    visible evaluation-status line — "current," "stale — new results have
    arrived since the last check ran," or "not yet active (pending clinical
    review)" — so a stale or unavailable state is surfaced, never hidden,
    per spec. Dismissal is per-flag, keyed by analyte+date+value+bound, so a
    new qualifying result re-surfaces despite a prior dismissal (mirrors
    `patternFlags.js`'s existing dismissal convention).
  - Verified: `npm run build` passes (prebuild fixtures included). A
    standalone Node harness covering the full engine — envelope states
    (unavailable/stale/current), the review gate on and off, dismissal with
    re-surfacing on a new value, provider-custom-range flagging for an
    analyte with no library entry, and formatted output shape — 13/13
    checks passed. Live-verified in the browser: an urgent Potassium value
    correctly produces the banner and "current" status with the review
    flag on; removing the flag correctly clears the banner and switches the
    status line to "not yet active" without a false "all clear"; Dismiss
    correctly removes the banner.
- **A-05 / PG-07:** Killed the silent kidney→liver terminology rewrite.
  Tab11's prompt-build path used to `.replace()` "kidney transplant," "renal
  transplant," and "LDKT" with "liver transplant"/"LDLT" wherever they
  appeared in surgical history, unconditionally and invisibly — a real RIE
  flag-don't-fix violation that would have corrupted the record of any
  pilot user whose transplant history genuinely differs. Deleted outright;
  patient-entered text now reaches the AI prompt verbatim.
  - Replacement: `src/rie/consistencyChecks.js` gains
    `checkTransplantTerminology()` — flags a surgical entry mentioning a
    transplant of one organ (liver, kidney, heart, lung, pancreas, matching
    both full names and the LDLT/LDKT abbreviations) when the condition
    list shows a transplant of a different organ, with a suggested
    correction. Nothing changes automatically: the existing Review Queue
    "Fix Now" flow (`engine.js`'s `applyFix()`, already built and used by
    the medical-dictionary checks) writes the confirmed value back to
    `mi_surgeries` only once the patient confirms, and that confirmed value
    is what both the UI and every prompt see from then on — exactly the
    flag → confirm-once → store pattern the spec calls for.
  - Verified: `npm run build` passes. A standalone Node harness confirmed
    the check reproduces the exact prior-behavior case (kidney/LDKT →
    liver/LDLT, capitalization preserved) as a suggested fix rather than an
    automatic rewrite; matches on "renal transplant" wording; produces no
    finding when the surgical and condition organs already agree, when no
    transplant condition is on file to compare against, or for a
    non-transplant procedure that happens to mention an organ (e.g. "kidney
    biopsy"); and flags only the mismatched entry among several surgeries.
- **A-06 / PG-06:** Condition-module loader. New
  `src/prompts/modules/MOD-IMMUNOSUPPRESSION.js`: the worked example from
  `INSINA_AI_PROMPTS.md` §5.5, copied verbatim into `content` fields
  (medication cautions, food and supplements, monitoring norms, procedure
  flags), `reviewed_by: null` (pending clinical review per PG-11). New
  `src/lib/conditionModules.js`: `selectConditionModules()` deterministically
  matches every module's `applies_when` (condition-name and medication-class
  regex matchers) against `{conditionsActive}` and active `{medicationsActive}`,
  excludes any module with `reviewed_by === null` unless the local
  `mi_allow_unreviewed_modules` flag is set (unset by default — no pilot user
  ever sees unreviewed content; Greg can preview it on his own device via
  devtools), caps at 4 matches ordered condition-hit before medication-only
  hit. `formatConditionModules()` renders matches under the CONDITION
  REFERENCE header from §5.3 with source citation (module id + version).
  - **This is the replacement A-09 named but didn't build yet:** A-09's
    CHANGELOG entry noted the old hardcoded NSAID/Tacrolimus/diet/infection
    block was deleted because "condition-specific reference content is
    A-06's conditionModules mechanism, not a block injected for every
    patient regardless of diagnosis" — this item is that mechanism. Wired
    into Tab11 (Surface A) and Tab05's Full Analysis (Surface B1), both of
    which list `{conditionModules}` in their spec'd payload; not wired into
    Tab05's Lab Q&A (B2) or Tab10 (Surface C), since neither surface's own
    payload list in §7 includes `{conditionModules}`.
  - Because the only authored module today is unreviewed, this ships inert
    for every pilot user by default — correct per spec, not a bug. It
    becomes live the moment `reviewed_by` is set on a clinically reviewed
    module.
  - Verified: `npm run build` passes. A standalone Node harness confirmed:
    the unreviewed module is excluded by default; setting
    `mi_allow_unreviewed_modules` makes it selectable; a medication-only
    match fires (condition list incomplete, drug reveals context, per §5.3
    point 1's own stated rationale); an unrelated condition/medication pair
    matches nothing; formatted output carries the correct source citation
    and header; an empty selection formats to an empty string rather than a
    dangling header; removing the flag reverts to exclusion.
- **A-03 v1:** Lab digest builder. New `src/lib/labDigest.js`:
  `buildLabDigestData()` groups labs by normalized raw name (trim, lowercase
  — A-04 upgrades this to canonical IDs with alias merging in Phase 2) into a
  12-month-window digest per analyte (last 6 values with dates, window min
  and max, a computed trend — first value, last value, direction, draw
  count — latest delta, unit, reference range, provider custom range, and a
  `tripwireStatus` field that reads "unavailable" until A-01 lands);
  `formatLabDigest()` renders it as the compact text block for `{labDigest}`;
  `formatLabsWindow()` renders full-detail rows for the last 60 days for
  `{labsWindow}`. `windowDays` is a parameter (default 365), so the same
  function serves the 24-month Advanced-mode `{labsExtended}` digest once a
  caller wires that trigger — not done in this item, since the master
  prompt's A-03 v1 instruction names only `{labDigest}` and `{labsWindow}`.
  - **Wired into Tab11 and Tab05**, replacing the two defects A-03 exists to
    fix: Tab11 no longer ships the complete lab history (thousands of
    entries) into the AI Analysis chat prompt; Tab05's Full Analysis and Lab
    Q&A no longer send only the most recent value per test (trend-blind,
    which defeated the product's own trend-detection framing). Tab11's
    condition-linked personalized-range reminder (flag a lab whose
    condition may warrant an individual target range when none is on file)
    is preserved, now driven by the digest's per-analyte flag data instead
    of the old full-history dump.
  - **Deviation:** the spec calls for the provider custom range to carry
    "its set date"; `mi_lab_custom_ranges` doesn't currently record when a
    range was set (Tab05's `saveCustomRange` only ever stored `{low, high}`).
    Added the field to the digest output as `null` rather than fabricating a
    date — the schema change to actually capture it is outside this item's
    named scope (new `labDigest.js` + payload builders, not the custom-range
    save UI).
  - Verified: `npm run build` passes. A standalone Node harness against
    synthetic labs confirmed: name-normalization merges case/whitespace
    variants into one analyte; the 12-month window correctly excludes an
    older draw from window min/max and trend while still counting it out of
    the digest; trend direction and latest delta compute correctly across 3
    draws; a provider custom range overrides the lab reference range; a
    non-numeric result (e.g. blood type) is handled without crashing and
    reports "insufficient data" for trend rather than a bogus number; empty
    input produces the documented placeholder text for both formatters.
- **A-09 / PG-06:** Prompts as code. New `src/prompts/` module: `core.js`
  holds the Clinical Safety Core (CSC v1.1, `CSC_VERSION` exported, the 14
  HARD RULES copied verbatim from `INSINA_AI_PROMPTS.md` §3), the shared
  FORMATTING and ROUTING blocks, and `assembleSystem()` which every builder
  composes through. `identity.js` is the minimal identity helper the
  builders need now (`getUserId`/`getAge`/`getSex`/`getIdentity`) — a stable
  pseudonymous ID plus computed age, never DOB; the full identity-audit pass
  against §2's complete allowlist is P-01, next. One builder module per
  Surface A–H (`surfaceA.js`.. `surfaceH.js`), each exporting a
  `PROMPT_VERSION` and a `build*(payload) => { system, promptVersion }`
  matching its section-7 spec (delta text, injection variables, CSC +
  optional display/routing blocks).
  - New `core.js` export `TRIPWIRE_UNAVAILABLE`: a standard envelope-status
    note every dataSections builder prepends until A-01 (the deterministic
    tripwire engine) exists. Without it, CSC rule 4 has nothing telling the
    model whether an unflagged value means "checked, no flag" or "never
    checked" — silence would let the model guess, which rule 4 forbids.
  - **Wired into consumers:** Tab11 (Surface A, both the streaming-chat and
    conversation-summary calls), Tab05 (Surface B1 Full Analysis, B2 Lab
    Q&A), Tab10 (Surface C Note summary). Each tab's inline
    `buildSystemPrompt`/system-string code is replaced by a lean
    `buildDataSections()`-style helper (record-data assembly only) feeding
    the shared builder. This deletes every hardcoded patient-specific
    clinical fact that stood in as a "no data yet" fallback (real diagnoses,
    medications, doctors' names, an entire unconditional NSAID/Tacrolimus/diet
    /infection-risk reference block) — CSC rule 7 (data fidelity) prohibits
    presenting fabricated defaults as record data, and condition-specific
    reference content is A-06's conditionModules mechanism, not a block
    injected for every patient regardless of diagnosis. Tab05's Full Analysis
    and Lab Q&A also stop sending the patient's real name (`mi_profile_personal
    .name`) — CSC rule 12 — using the pseudonymous `{userId}` instead, same as
    Tab10's A-02-era fix and Tab11's pre-existing pattern.
  - **Deviations reported, not silently taken:** Surface D (document
    extraction) and Surface E (Vision OCR) are built exactly to spec but not
    wired into Tab09/Tab12's extraction calls or the proxy's OCR prompt —
    those call sites' existing output schemas feed Documents/Labs/Findings
    record creation directly, and migrating them is a data-model change
    across multiple tabs, larger than "prompts as code." Surface H (report
    generation) is built to spec's deterministic-template-plus-annotation
    architecture, but Tab14's Consultation Prep currently generates the whole
    report as AI free text with no template layer to annotate — same
    reasoning. Surface F (companion visit summary) has a real candidate
    consumer, `visitCapture.js`'s `summarizeVisit()`, but it returns
    structured JSON that `confirmMedChange()` and the action-item UI parse —
    a different output contract than F's markdown-narrative spec. Surface G
    (symptom preparation) has no consumer at all yet; no symptom-prep screen
    exists in the companion app. All four modules exist, are correct to
    spec, and are ready for their consumers once those larger changes land.
    The kidney-to-liver rewrite regex in Tab11's surgical-history formatting
    is carried over unchanged into `buildDataSections()` — A-05/PG-07 is the
    tracked item to remove it, not this one.
  - Verified: `npm run build` passes. A standalone Node harness (localStorage
    polyfill, no app runtime) exercised all 9 builders plus `getIdentity()`'s
    stability across repeated calls and its `P-XXXXXXXXXXXXXXXX` ID format —
    11/11 checks passed.
- **S-05 item 3 / PG-04:** Pilot bearer tokens. The client now always attaches
  `Authorization: Bearer <token>` (via `aiClient.js`'s `getAuthHeaders()`, wired
  up now that A-02 gives it one place to do so) whenever a pilot token is
  stored. New `src/lib/pilotAuth.js` (`getPilotToken`/`setPilotToken`) —
  stored the same way `mi_ak` is today, moving inside the encrypted store once
  P-02 lands, per spec. New **Settings & Backup → Pilot access token** field +
  modal (mirrors the existing API-key entry pattern) so an invited pilot user
  can paste in the token they were given.
  - Proxy: `proxy/server.js` gains a `pilotAuth` middleware on both
    `/api/chat` and `/api/extract-pdf`, checking the header against
    `PILOT_TOKENS` (comma-separated, one per invited user) — but **only when
    `PILOT_AUTH_ENFORCED=true`**, which is unset by default. With no tokens
    issued and enforcement off, today's founder-only usage is completely
    unaffected — verified via an isolated middleware test across 7 cases:
    enforcement off always passes regardless of header; enforcement on
    correctly 401s a missing, wrong, or malformed-header token; a valid token
    (including one with stray whitespace from a copy-paste) passes; removing
    a token from `PILOT_TOKENS` correctly revokes it on the next request.
  - Deploy order documented in `proxy/DEPLOY.md`: client support ships first
    (this release), tokens get issued and pilot users enter theirs, **only
    then** is `PILOT_AUTH_ENFORCED` flipped on — otherwise an already-deployed
    client without a token would get locked out the moment enforcement turns
    on. **HUMAN, when ready for pilot users:** generate tokens, set
    `PILOT_TOKENS` and `PILOT_AUTH_ENFORCED=true` on Render.
- **A-02 / PG-08:** Unified AI client and model map. New `src/lib/aiClient.js`:
  every AI surface now calls one `callAI({ surface, mode, system, messages,
  stream, signal })`, which resolves the model from a single `MODEL_MAP`
  (`standard` → claude-sonnet-4-6, `advanced` → claude-opus-4-6, `extraction` →
  sonnet, `lite` → claude-haiku-4-5 — the companion's pre-existing cheap tier,
  now centralized rather than independently declared) and a per-surface
  `SURFACE_MAX_TOKENS` table (values promoted from what each site already
  used — not new numbers), clamped to the proxy's 4096 ceiling. Ported all 7
  files that made AI calls: Tab05 (Full Analysis, Lab Q&A), Tab09 (document
  summarize/findings, Vision extraction — via a new `extractPdfVision()` on the
  same module so both proxy routes share one place to attach auth), Tab10,
  Tab11 (main streaming chat, conversation summary), Tab12, Tab14, and
  `companionAI.js`. Two files weren't in the master prompt's shorthand list of
  four but had their own AI call sites and needed the same port: **Tab14**
  (Consultation Prep) and **companionAI.js** (the companion's own chat
  functions) — noted as the delta between the spec's example list and what
  "port every surface" actually required.
  - **Fixes PG-08's headline defect:** Tab10 (Notes AI summary) called
    `api.anthropic.com` directly with a stale model string
    (`claude-sonnet-4-20250514`, not on the proxy's allowlist) and the
    patient's real name in the prompt. Now routes through the proxy like every
    other surface. The full identity-minimization pass is P-01 (next); this
    port includes the minimal fix — a generic condition-context line instead
    of the patient's name — since PG-08's own rationale names the identity
    leak as one of Tab10's three defects, not a P-01-only concern.
  - **Deletes Tab12's fallback to a direct Anthropic call on a proxy 429**
    (using the BYO key from `mi_ak`). Per A-10 (settled): A-02 is what makes
    the BYO-key half-implementation dormant through the pilot. Every surface
    now targets the proxy only; nothing in the app calls `api.anthropic.com`
    directly anymore (verified — see below).
  - Bearer-token attachment point (`getAuthHeaders()`) is a documented stub
    returning `{}` for now — the "one place" S-05 item 3 fills in without
    touching every call site again, per that item's own dependency note.
  - Each surface keeps its own response-status handling (503 cold-start copy,
    413 payload-too-large copy, etc.) — `callAI()` returns the raw `Response`,
    same as the `fetch()` calls it replaces, so no surface's tailored error
    copy needed rewriting; only the model string, token ceiling, and target
    URL were centralized, which is what had actually drifted.
  - Verified: `npm run build` passes; a full-repo sweep confirms zero
    remaining `api.anthropic.com` calls (only explanatory comments mention the
    string), exactly one `PROXY_URL` declaration left in the whole `src/`
    tree (inside `aiClient.js` itself), and all 7 ported files import the
    shared client.
- **A-08:** Schema versioning and migration rails. New `src/lib/migrations.js`:
  an ordered, idempotent migration list gated by `mi_schema_version`, run once
  synchronously at boot (`main.jsx`, before either the full app or companion
  renders — both share the same `mi_*` record). Each migration logs to the RIE
  audit log (`mi_rie_audit`, Drive-synced). A migration may be flagged `major`
  (CHANGELOG's own MAJOR definition — breaking changes to how data is stored):
  before it runs, an automatic JSON export of the full record downloads as a
  safety-net backup, and an `mi_migration_interrupted` flag is set for the
  duration so a crash mid-migration is detected and retried on the next boot
  rather than silently skipped. A failed migration halts the chain — no later
  migration is applied out of order over a failure. Twenty-plus prior releases
  evolved the stores with no recorded version; migration v1 here is a no-op
  version stamp establishing the baseline, not a retroactive migration of that
  undocumented history. **P-02 (vault encryption)** and **A-07 (binary blob
  move, Phase 2)** are the first real migrations to land on these rails.
- Verified: fresh-install stamping, no-op on an already-migrated boot, and the
  full major-migration lifecycle (backup trigger, interrupted-flag set/clear,
  failure-halts-the-chain, and correct retry-in-order on the next boot) all
  confirmed against the actual runner logic.

---

## v1.24.0 — 2026-07-11 (Phase 0: pilot security hardening — in progress)

### Security
- **S-01 / PG-01 (DEC-014):** Removed the committed credential file
  (`GitHub Token.docx`) from the working tree and purged it from all git history
  with `git filter-repo`; the exposed token was revoked first. Added `*.docx`,
  `.claude/`, and `.env*` to `.gitignore` and untracked local Claude settings.
  Public history is force-pushed as part of this item; existing clones must be
  re-cloned.
- **S-05 items 1-2 / PG-04 (DEC-015):** Proxy rate limiting is now enforced —
  the limiter's disable switch is removed. `/api/chat` is capped at 60 requests
  per IP per hour; `/api/extract-pdf` (Vision OCR, the expensive route) gets its
  own 20/hour cap. Backstop is a hard monthly spend cap in the Anthropic console
  (HUMAN). Per-pilot-user bearer tokens are Phase 1 (S-05 item 3).
- **S-02 / PG-02:** AI-generated text is now escaped before it becomes HTML,
  everywhere in the app. Uploaded documents can be OCR'd and quoted back by the
  AI; without escaping, an embedded tag in that echoed content would execute in
  the app's origin (full record, PIN hash). Added a single shared module,
  `src/lib/renderAiText.js` (escape `&<>"'` first, then apply `**bold**` /
  `-----` transforms), and ported every AI-text-to-HTML renderer to it — the
  duplicated `answerToHTML`/`applyBold` in Tab05.jsx and Tab11.jsx (both the
  print-window builders and the on-screen chat renderers), plus a third,
  independently-drifted copy in Tab14.jsx's Consultation Prep printout that had
  a real gap (escaping was applied only on its fallback text branch, not on
  bullets/numbered items/headers). No other function in the codebase builds
  HTML from AI output. Verified with a Node script: a malicious payload
  (`<img onerror>`, `<script>`) is neutralized by the new renderer while the
  reconstructed old renderer is shown passing it through unescaped; benign AI
  responses render visually identical (HTML-entity-encoded apostrophes/quotes
  display the same as the raw characters — required by the fix, not a
  regression).
- **S-04 / PG-03:** pdf.js is now bundled, not fetched from a CDN at runtime.
  The spec named one call site (Tab12); the current code had **five**, across
  four files — Tab09 (text extraction + the Vision-OCR page renderer), Tab11
  (reference-doc upload), Tab12 (Import Records), and Tab14 (post-visit
  capture) — all dynamically importing pdf.js 4.4.168 from cdnjs while
  `pdfjs-dist@5.5` sat unused in package.json. Added `src/lib/pdfjs.js`, a
  shared lazy loader (Vite code-splits it, so the main bundle is unchanged and
  pdf.js still loads only when a PDF is parsed) with the worker bundled via
  Vite's `?url` asset import. All five sites ported; every CDN URL deleted.
  Verified: build emits `pdf-*.js` chunk + `pdf.worker.min-*.mjs` asset, zero
  cdnjs references in the built output, and the v5 API surface used by all
  call sites (`getDocument`, `getTextContent`, `getViewport`,
  `render({canvasContext})`) confirmed present in the installed package.
- **S-03 / PG-05:** Added a Content-Security-Policy meta tag to both entry
  points (`index.html` and `companion/index.html`) — GitHub Pages cannot set
  response headers, so the meta tag is the enforcement point. Policy:
  `script-src 'self'` + accounts.google.com (Google Identity), style/font
  allowances for Google Fonts, `img-src` adds `data:`/`blob:` (card photos)
  and `*.googleusercontent.com` (profile photo), `connect-src` limited to the
  proxy, www.googleapis.com (Drive/Calendar), accounts.google.com,
  api.anthropic.com (BYO-key fallback — comes out when A-02 lands), and
  clinicaltables.nlm.nih.gov (ICD-10 lookup); `object-src 'none'`,
  `base-uri 'self'`, `worker-src 'self' blob:`. The two inline scripts in the
  HTML (companion-manifest swap, service-worker registration) moved to
  self-hosted files so `script-src` needs no `'unsafe-inline'`;
  `style-src 'unsafe-inline'` stays as accepted debt (inline styles are
  pervasive). The tag is stripped during `npm run dev` only (vite.config.js
  hook) because the React dev plugin injects an inline refresh preamble;
  production builds ship it untouched. Verified: both built HTMLs carry
  exactly one enforcing tag and zero inline scripts; live checks of fonts,
  Google sign-in, Drive sync, and AI streaming ride the Phase 0 manual test
  list.
- **S-06:** Secrets hygiene going forward. Pre-commit secret scanning
  (gitleaks) is documented as a standing rule in CLAUDE.md; the repo-visibility
  question (public vs private) is logged in DECISIONS.md as **OPEN-8** for
  Greg to answer — recorded choice, not a default. Re-verified no PHI in
  tracked files (only the public GitHub username in deploy URLs and one
  cosmetic form placeholder, flagged for the Phase 1 de-personalization pass).
  HUMAN actions: install gitleaks locally and enable GitHub push protection on
  the repo.

### Changed
- **A-14:** Home-button parity. Medications, Labs & Trends, Vitals, and
  Symptoms — the four tabs that render their own topbar — now carry the same
  Home button (house icon + label, top-left) the shared topbar gained in
  v1.23.0, byte-for-byte the same implementation and placement. It replaces
  those tabs' older "‹ Dashboard" chevron, exactly as the shared topbar's
  Home button replaced it there, so the navigation affordance is uniform
  across every tab. No restyling; no new shared component (the source pattern
  is inline, per spec).

---


## v1.23.0 — 2026-07-09

*Entry reconstructed 2026-08-09 from commit `6216710` — this release shipped
without a CHANGELOG entry at the time. Content is taken from the commit and its
diff, not from memory.*

### Changed — Dashboard overhaul
- **Log Vitals became a proper modal.** The inline 4-field form on the Dashboard
  was replaced with a full 10-field overlay: date, systolic, diastolic, heart
  rate, resting heart rate, oxygen saturation, weight, temperature, glucose and
  sleep. Logging a full set of readings no longer means leaving the Dashboard.
- **The stat cards are gone.** DataFreshness, Refills, BP, Weight and BMI cards
  were removed — five panels competing for the top of the screen, each showing
  one number.
- **"Last Updated" now opens a freshness popup** with a per-category date for
  Labs, Medications, Vitals, Appointments, Conditions and Documents, plus the
  last sync time and a **Sync Now** action. This replaced the standalone
  freshness card with something that answers "is anything stale?" in one place.
- **A real Home button.** The subtle back-arrow on non-dashboard tabs was
  replaced with a prominent house icon plus a "Home" label on every tab. (A-14
  in v1.24.0 later extended the same button, byte-for-byte, to the four tabs
  that render their own topbar.)
- **New Current Vitals panel** above Active Alerts, showing the nine most recent
  vitals plus calculated BMI; the older Recent Vitals table was removed.

---


## v1.22.0 — 2026-07-09

*Entry reconstructed 2026-08-09 from commit `816a780` — this release shipped
without a CHANGELOG entry, and its `package.json` bump was skipped too (the
commit subject reads "v1.21.0"; the version was tagged after the fact). Content
is taken from the commit and its diff.*

### Added
- **Dashboard hot buttons.** A row of nine action buttons — Test Results,
  Medications, Appointments, Symptoms, Log Vitals, Import Records, Refills,
  Emergency Info and Last Updated — replaced the lone "Log Vitals" button, making
  the common destinations reachable in one tap from the Dashboard.
- **Print helpers for Emergency Info and Refills** (`printEmergency()`,
  `printRefills()`).

### Changed
- **AI Lab Analysis prompt rewritten** with clinical communication rules and a
  fixed per-finding structure: Finding, Why it matters, Urgency, Best clinician
  to ask, Patient action, and a suggested question. Analysis results also began
  auto-saving to the Notes tab. (This is the ancestor of what later became the
  prompts-as-code architecture and the DEC-041 question rules.)
- **Imaging and procedure entries from the Records tab now appear on the Patient
  Profile**, marked with a Records badge, so procedures live in one view.
- **Dashboard appointments show facility and address**, not just the time.

### Fixed
- **Appointment changes sync immediately.** Saving an appointment now triggers a
  Drive upload straight away instead of waiting for the next scheduled sync.
- **Attach Records modal lists your records.** It now reads `mi_records`; a
  smart-quote parse error in the same view was fixed.

---


## v1.21.0 — 2026-07-01

### Changed — Appointments post-visit capture
- **Capture happens inline — no more tab-hopping.** The "Visit complete" prompt
  shown on **Mark Complete** no longer bounces you to other tabs. Each row now
  expands into a small capture form right in the prompt:
  - **Clinical notes / documents** and **Lab results** — a file picker. Images are
    compressed to a data URL via `compressImage`; text-PDFs have their text pulled
    in automatically. Both save to your Documents (labs filed under the *lab*
    category).
  - **New condition / diagnosis** — name, status, and diagnosed date (pre-filled
    from the visit); saves to Conditions and refreshes the active-conditions
    summary.
  - **New or changed medication** — name, dose, and frequency; saves to
    Medications with the prescriber pre-filled from the appointment.
  - **Imaging study** — type and body part (plus an optional compressed image);
    facility and date pre-fill from the visit.
- **Everything auto-attaches to the appointment.** Whatever you capture is written
  to the right record store **and** immediately linked to the appointment's
  **Records & Documents** section — one prompt for the whole visit, still no
  per-item juggling.
- **Open tabs and the Record Integrity Engine re-read** after each capture
  (`mi-data-synced`), and oversized images surface a friendly "storage is full"
  message instead of failing silently.

---

## v1.20.0 — 2026-06-29

### Added / Changed — Appointments
- **Directions link.** An appointment's expanded detail now shows a 🧭 Directions
  link (built from its facility + address) that opens Google Maps.
- **Calendar events come in for review, not auto-added.** Google Calendar sync
  (manual and the daily auto-sync) now brings events in as **Suggested** rather
  than dropping them straight onto your schedule. The tab switches to the
  Suggested filter with a count so you can **edit to fill gaps, then Confirm or
  Dismiss** each one. Nothing hits your real schedule until you accept it — fixes
  incomplete calendar entries silently becoming appointments.
- **Post-visit capture on Mark Complete.** Marking an appointment complete now
  opens one prompt (not a prompt per item) to capture anything from the visit —
  clinical notes/documents, labs, new conditions, new/changed meds, imaging —
  each with a jump button to the right place. Add what applies, then attach it to
  the appointment from its Records & Documents section.

---

## v1.19.0 — 2026-06-29

### Added — RIE Report Preflight
- **Reports are now integrity-checked before they generate.** Printing the
  Patient Profile, a Consultation Prep, the Medication reports, or the Lab report
  first runs a preflight scan (full-record consistency + spelling **plus**
  report-specific critical checks). If anything is found, a modal shows three
  sections — **Critical / Warnings / Suggested cleanup** — each with Fix Now,
  Ignore This Time, and Dismiss, plus an Apply-safe-fixes batch.
- **Critical issues block generation** until fixed or explicitly overridden;
  **Override & Generate** is recorded in the audit log. If the record is clean,
  the report generates immediately with no interruption.
- Report-specific criticals per the spec, e.g. Consultation Prep flags missing
  transplant/immunosuppression status, an empty allergy list, or a missing
  platelet count; the Profile flags missing insurance.

### Notes
- This is the "spell-check shared documents at generate time" path — the preflight
  scan includes the medical-dictionary/spelling findings, so misspellings surface
  before a document is printed or shared.

---

## v1.18.1 — 2026-06-29

### Fixed
- **"Server error 413" on AI analysis with a rich record.** The AI proxy's
  `/api/chat` body limit was 256 KB, but a full record (all labs/vitals/meds plus
  uploaded reference documents) exceeds it, so the proxy rejected the request
  before it reached Claude — whose context window is far larger. Raised the proxy
  limit to 1 MB, added a total-text cap (~120 KB) across all reference documents
  so a large document library can't blow the payload, and replaced the cryptic
  "Server error 413" with a clear message pointing at reference-doc context.
  **Requires the Render proxy to redeploy** (auto-deploys on push).

---

## v1.18.0 — 2026-06-29

### Added — Record Integrity Engine (Phase 1)
- **A client-side data-quality engine** (`src/rie/`) that scans your record for
  problems and surfaces them in a **Review Queue** before they reach reports or
  AI analysis. Nothing leaves your device; nothing is changed without your
  confirmation.
- **Five consistency-check categories** across your `mi_*` data: medications
  (missing dose/frequency/prescriber/refill, duplicate active meds by generic),
  labs (missing unit/range, impossible/future dates, duplicates, same test under
  two names), providers/contacts (appointment missing provider/location, care-team
  spelling mismatches, duplicate emergency contacts), conditions/allergies
  (missing status/onset, duplicate allergy, allergy-vs-active-med conflict), and
  documents (procedure missing date/facility, garbled imported text).
- **Medical dictionary** seeded from your own record plus a curated base list of
  common misspellings (e.g. "Trazedone" → Trazodone). Surfaced in the queue with
  a Confirm-style **Fix Now** — medication names are never auto-corrected or
  batch-fixed.
- **Review Queue** — a floating button with a Critical+Warning count badge, on
  every tab. Each finding shows a severity badge, the issue, a before→after diff
  where applicable, and **Fix Now / Ignore This Time / Dismiss Permanently**, plus
  an **Apply Safe Fixes** batch (never medication names or Critical items) and a
  manual **Re-scan**.
- **Audit log** of every action, and **permanent dismissals**, stored under `mi_`
  keys so they ride Google Drive sync; "ignore this time" stays session-local.

### Deferred (next phases)
- Live as-you-type spell squiggles, the English (nspell) dictionary, report/print
  **preflight** blocking, and the AI-context completeness panel. The engine is
  structured so a "spell-check shared documents at print/share time" preflight
  drops in next.

---

## v1.17.1 — 2026-06-28

### Fixed
- **Out-of-range now uses your doctor's range first.** When a lab has a custom
  doctor's range set, the in/out-of-range status (the colored value, the "OUT OF
  RANGE" badge, the list dots, the flagged count and filter, the printed report,
  and the AI summaries) is now based on **your doctor's range**, falling back to
  the lab report's printed range only when no doctor's range is set. Previously
  the range *bar* honored the doctor's range but the status flags did not — so a
  value like Tacrolimus that's within your doctor's target but outside the lab's
  generic range was wrongly shown as out of range. Both ranges are still displayed
  for reference.

---

## v1.17.0 — 2026-06-28

### Added — reorder lab groups on the tab
- **Reorder lab groups right on the Labs & Trends tab.** A "⠿ Reorder Groups"
  button reveals a panel where you **drag** groups (or use up/down arrows) into
  the order you want. The on-screen list reorders live and the **printout follows
  the same order**.
- The order is remembered until you change it again — freely re-arrangeable per
  appointment. It writes the same `mi_lab_category_order` used by the printout and
  the Settings → Lab Category Order panel, so all three stay in sync.

---

## v1.16.0 — 2026-06-28

### Fixed
- **Adding a second insurance card (or the back of a card) now works.** The card
  uploader was defined inside the modal, so React remounted the hidden file input
  on every keystroke/pick and the second image got dropped. The uploader is now a
  stable top-level component using a ref — both sides and multiple cards load
  reliably.

### Added
- **Insurance/ID cards print on the Profile report.** Selected cards are added at
  the end of the printed profile (front & back images). When you have more than
  one card, **Print Profile** first asks which card(s) to include; with a single
  card it just prints it.
- **"Refilled" button on each medication row.** The main Medications list now has
  a quick **Refilled** action per row that advances the refill date by the days
  supply (same as Complete Refill in the detail) — no need to open the med first.
  It briefly confirms with "✓ Refilled".

---

## v1.15.0 — 2026-06-28

### Added — records tied to appointments
- **Each appointment now has a "Records & Documents" section** in its expanded
  detail. Link uploaded documents, imaging studies, and notes to a visit, and the
  AI **Consultation Prep** generated for that visit shows there automatically
  (with a ⎙ View to reprint it).
- **+ Attach** opens a picker that lists your documents, imaging, and notes —
  with a **Suggested** group at the top for items that match the visit by date or
  provider (manual selection + auto-suggest in one). Detach with the ✕.
- **↗ Open** jumps to where a linked record lives (Documents, Profile imaging, or
  Notes). Attachments are stored on the appointment and sync via Drive.

---

## v1.14.0 — 2026-06-28

### Added — Insurance & ID cards
- **Photograph and store insurance/ID cards on both apps.** Capture the **front
  and back** of a card; add as many cards as you like (primary + secondary
  insurance, pharmacy, dental, etc.) with the **+ Add** button.
- Cards are stored in your record (`mi_cards`) and ride the existing Drive sync,
  so a card added on the phone appears on the web app and vice-versa.
- **View full-screen** to show at a check-in desk, flip between front/back, and a
  **Share / Send** button that uses the phone's share sheet (or downloads on
  desktop) to send a card to a provider or family member.
- Full app: Profile → "Insurance & ID Cards". Companion: Today → "Insurance
  cards". Photos are auto-compressed so they stay small.

---

## v1.13.2 — 2026-06-28

### Changed
- **The Vitals tab now refreshes live when a sync arrives.** Previously, if you
  were already on the Vitals tab when a phone-logged reading synced in, it
  wouldn't show until you navigated away and back. A Drive pull now broadcasts a
  "data synced" event and the Vitals tab re-reads immediately.

---

## v1.13.1 — 2026-06-28

### Fixed
- **Vitals (and other data) logged on the phone companion now appear on the web
  app automatically.** The desktop only pulled from Drive when you clicked Sync;
  its background task uploaded but never downloaded. It now auto-pulls from Drive
  on open and whenever you return to the tab — matching the companion — so a
  reading logged on the phone shows up without a manual sync.
- **Profile → Latest Vitals now shows Blood Pressure and Heart Rate.** The card
  read `systolic/diastolic/pulse`, but readings are stored as `bp_s/bp_d/hr`, so
  BP and HR were always blank. Now reads the correct fields (with fallback for any
  legacy data).

---

## v1.13.0 — 2026-06-27

### Added — shared consultation prep (web ⇄ companion)
- **The companion now shows the same visit-specific Consultation Prep as the web
  app, instead of a generic template.** Prep is generated once per appointment
  (Claude Sonnet) from that appointment's details plus your conditions and meds,
  and **saved into your record** keyed by appointment id, so it syncs over Google
  Drive between the web app and the phone.
  - Generate it on the **web app** → it appears on the **companion** after the next
    sync (no rebuild).
  - Open a visit's brief on the **companion** with no prep yet → the companion
    generates it and saves it back, so the **web app** then has it too.
  - A **Regenerate** button refreshes it; if the appointment's details change, both
    apps flag the saved prep as stale.
  - Offline with nothing cached, the brief falls back to a few record-grounded
    questions so it's never empty.

### Notes
- Requires Google sign-in on both surfaces (Drive is the sync transport) and the
  proxy to be reachable for generation. Prep propagates on the next sync, not
  instantly.

---

## v1.12.0 — 2026-06-27

### Added — web app Vitals
- **"✦ Ask AI" on the Vitals tab.** The Vitals tab had no AI hand-off; each vital's
  detail header now has an Ask AI button that sends the currently-viewed vital and
  its trend (over the selected time range) to AI Analysis, cross-referenced against
  medications, conditions, other vitals, and labs.

### Note
- Labs and Medications already have their own in-tab AI (Labs has "Full Analysis"
  plus a free-text question box; Medications has its own hand-off), so no
  redundant button was added there.

---

## v1.11.1 — 2026-06-27

### Changed — web app Symptoms
- **Each symptom row now has a clear "✦ Ask AI" button.** Previously you had to
  click the row to open the side panel to reach the AI hand-off, which was easy to
  miss (the severity number looked like the only target). The button sends the
  symptom straight to AI Analysis, cross-referencing it against your labs, vitals,
  and medications. The severity number and full side panel are unchanged.

---

## v1.11.0 — 2026-06-27

### Fixed — companion symptom logging
- **Saving a symptom now confirms it.** The companion Symptoms tab saved silently
  (no feedback), so it felt like nothing happened. It now shows a "✓ <symptom>
  saved — will sync to Drive" confirmation, matching the Vitals tab.

### Added
- **Ask Insina about a symptom.** Every logged symptom (and the just-saved
  confirmation) now has a **✦ Ask Insina about this** button that opens the AI tab
  and auto-sends a prompt cross-referencing that symptom against the patient's
  labs, vitals, and medications — bringing the companion in line with the web
  app's symptom → AI hand-off.

---

## v1.10.0 — 2026-06-26

### Added — companion improvements
- **Voice input.** A 🎤 mic on the AI box and Quick Log uses on-device speech
  recognition where available (Chrome/Android). On iPhone, every text field
  already accepts the keyboard's built-in dictation, so vitals, symptoms, and
  questions can all be spoken.
- **My Medications list.** A button on the Meds screen opens the full list with
  name, dose/frequency, and prescribing doctor (e.g. "Tacrolimus · 3 mg · twice
  daily · Dr. Zapata").
- **Surgeries & Procedures list**, reachable from Today (procedure, date, surgeon,
  facility, outcome).
- **Sign-in screen** now leads with a 2× larger logo.

### Changed
- **Meds tracking mode is now pick-once.** Instead of always showing all four
  options, you choose a mode once; afterward the screen shows just "Tracking:
  <mode> · Change". Added **per-dose-group reminder toggles** (morning / midday /
  evening), each independently on/off with its own time. Medication reminders moved
  off the Settings screen to the Meds screen; Settings keeps appointment and
  attention-alert toggles.
- **Appointment Prep shows only relevant safety flags.** The AI now selects the
  flags that matter for that visit's provider/specialty (always keeping
  life-critical ones), with a "Show all flags" toggle. Offline, it falls back to a
  deterministic specialty filter.

### Fixed
- **"Talk to Insina" no longer errors with "AI did not return JSON."** The
  structured-entry parse now forces valid JSON (assistant prefill) and retries
  before failing, with a friendly fallback message.
- **App fits the screen.** Fixed horizontal overflow and applied left/right
  safe-area insets so nothing sits off to the right on iPhone.
- **Back button everywhere.** A back control returns to the previous screen; from a
  main tab it returns to Today (useful since an installed PWA has no browser back).

---

## v1.9.0 — 2026-06-25

### Added
- **Per-conversation printing in AI Analysis.** The chat is now split into
  separate conversations on screen. A **＋ New Conversation** button (by the
  input) starts a fresh topic without clearing — earlier conversations stay
  visible above, each under its own header. Every conversation has its own two
  print buttons: **⎙ Transcript** (verbatim, instant) and **✦ Summary** (an
  AI-written brief of just that conversation).
- Each conversation also has its **own independent AI context** — starting a new
  conversation gives the AI a clean slate, so topics don't bleed together.

### Changed
- Removed the top "Print Summary" button (which summarized *everything*); printing
  is now per-conversation.
- The sidebar action is now **🗑 Clear All** (saves all conversations to Notes,
  then clears the screen).
- Pop-up-blocked fallback now applies to both transcript and summary prints.

---

## v1.8.3 — 2026-06-19

### Added
- **Companion sign-in screen.** A full-screen welcome now handles Google
  connection before the app, replacing the cramped top-bar "Sign in" button that
  sat under the iOS status bar and couldn't be tapped. Large Google sign-in button
  plus an optional "Continue without signing in" (capture still works offline).

### Fixed
- **Top bar hidden under the status bar / notch.** The app now respects
  `safe-area-inset-top`, so the sync bar and content clear the status bar and
  Dynamic Island.
- **Sign-in returns you to where you started.** The OAuth redirect now comes back
  to the launch path (e.g. `/companion/`) instead of always `/?companion=1`, so an
  installed standalone app stays in its own scope. **Requires** adding
  `https://insinahealth.com/companion/` to the Google OAuth client's Authorized
  redirect URIs.

---

## v1.8.2 — 2026-06-19

### Fixed
- **Companion home-screen icon still opened the full app (v1.8.1 follow-up).**
  Swapping only the manifest wasn't enough: both apps shared `scope: "/"`, so iOS
  couldn't tell the companion webclip apart from the already-installed full-app
  webclip and resolved to the full app (companion would flash, then the full app
  loaded). The companion now lives at its **own path and scope, `/companion/`**,
  with a distinct manifest `id` — so iOS installs it as a genuinely separate app.
  `src/main.jsx` routes the companion for `/companion/` (or the legacy
  `?companion=1`); the build now emits a second `/companion/` entry point.
  Bumped the service-worker cache (`insina-v4`) so devices drop the stale shell.

### Note
- New companion URL is **`insinahealth.com/companion/`** (the old `?companion=1`
  still works). Existing home-screen icons must be deleted and re-added once.

---

## v1.8.1 — 2026-06-19

### Fixed
- **Companion "Add to Home Screen" launched the full web app instead of the
  companion.** iOS reads the linked Web App Manifest's `start_url` when you add to
  the home screen, and the single manifest pointed at `/` (the full app). Added a
  dedicated companion manifest (`start_url: /?companion=1`) that is swapped in
  whenever the page is loaded in companion mode, so the home-screen icon now opens
  the companion. The full web app's icon is unchanged.

---

## v1.8.0 — 2026-06-19

### Added — Insina Health Mobile companion (`/?companion=1`)
A rebuilt mobile companion PWA following the principle **"Mobile captures, the web
app organizes."** Reads and writes the same Google-Drive-synced record as the web
app — one record, two front doors. Five-tab bottom navigation:

- **Today** — greeting + sync status, an at-a-glance row (next visit / labs /
  refills), the latest vital, and quick-capture buttons. Surfaces **proactive
  pattern flags** computed from the record (e.g. blood pressure drifting up across
  recent readings, a drug-level trough trending toward its low bound, a flagged lab
  moving further from range) — conservative and dismissible. Emergency Info and
  Notifications are one tap away.
- **Meds** — the daily screen, built for a large pill burden. Tracking **modes**
  (Reminders only / Quick confirm / Full logging / Off, default Quick); **whole-group
  one-tap confirmation** (morning / midday / evening) so a drug is named only when
  **flagging an exception** (skipped / late / reaction / as-needed). Refills surface
  at the top.
- **Log** — fast structured Vitals and Symptoms capture, plus **Quick Log / Talk to
  Insina**: say it in plain language and Insina drafts a structured entry you confirm
  before it's filed.
- **Care** — upcoming appointments with countdowns, provider, location + Maps
  directions, and the entry into Doctor Visit Capture; lists captured visits.
- **AI** — a lite, record-grounded assistant for quick questions on the go.

- **Doctor Visit Capture** — Pre-Visit Brief (safety flags, what's changed,
  suggested questions) → **Consent (cannot be skipped; Mississippi/Louisiana
  recording-law notice)** → a deliberately minimal During-Visit screen (record /
  pause / stop, timer, optional note, optional "mark moment") → AI summary
  (Discussed / Plan / When to call / Still open) → Action Items, where a detected
  **medication change must be explicitly confirmed** before the med list updates.
- **Emergency Info** — offline-first must-know status, meds, allergies, key labs,
  and care-team phone numbers; loads instantly to show an EMT or ER nurse.
- **Offline-first + notifications** — all capture works offline and queues a Drive
  sync via an outbox that drains when back online; three independently-switchable
  notification types (medication, appointment, attention alerts).

### Notes
- **Audio transcription is intentionally deferred** behind a clean interface — the
  Anthropic stack can't transcribe audio. Visits record, save, and summarize from
  manual notes today; full audio transcription will be wired to a provider later.
- Companion AI runs through the existing proxy (no client API key on the phone);
  `claude-haiku-4-5` was added to the proxy allow-list for cheap/short work. **The
  proxy must be redeployed** for companion AI to work in production.

---

## v1.7.1 — 2026-06-18

### Fixed
- **AI Print Summary no longer fails silently.** When the browser blocked the
  print pop-up, the button finished with no window and no file. It now (a) falls
  back to downloading the summary as an `.html` file to your Downloads folder,
  and (b) shows a clear on-screen message explaining what happened — whether the
  pop-up was blocked or the AI server was still waking up. (Note: the in-app
  button opens a print dialog / saves to Downloads; it does not write to the
  Insina Reports folder.)

---

## v1.7.0 — 2026-06-17

### Added
- **Inactivity auto-lock.** After a configurable idle period (default 30 minutes)
  Insina returns to the PIN lock screen. Because the app unmounts when locked, no
  data is visible behind the lock — you re-enter your PIN to resume. Activity
  (mouse, keyboard, scroll, touch) resets the timer; the setting lives in
  Settings & Backup → App Settings → "Auto-lock after inactivity" (Off / 5 / 10 /
  15 / 30 / 60 min) and re-arms immediately when changed.

### Notes
- The existing 4-digit PIN is unchanged. An alphanumeric **password** option and
  **two-step authentication** are planned for when other users keep their own
  data in Insina (deferred for now while the app is PIN-protected for testing and
  demos).

---

## v1.6.2 — 2026-06-17

### Added
- **Daily auto-sync (on open).** Once you've connected a calendar, Insina
  auto-syncs it the first time you open the Appointments tab each day, quietly in
  the background — it only shows a message when it actually adds appointments.
  Tracked via `mi_gcal_last_sync` (date), so it runs at most once per day whether
  triggered automatically or by the manual button. The connected-calendar line
  now notes "auto-syncs daily".
- Note: this runs when the app is open (browser-only app, no background server),
  so it catches you up on first open each day rather than at a fixed clock time.

---

## v1.6.1 — 2026-06-17

### Added
- **Calendar sync auto-fills from Care Team.** When a synced event's title ends
  with a doctor's name (convention: `… - Dr. Barclay`), Insina reads that name,
  matches it against your Care Team, and fills in any **blank** fields —
  specialty, phone, facility, address. Values already in the event are kept.
- The Care Team matcher is now shared between calendar sync and the Add
  Appointment form, and the form's auto-fill now also fills specialty.

---

## v1.6.0 — 2026-06-17

### Added
- **Google Calendar sync (one-way)** — a "⟳ Sync Google Calendar" button on the
  Appointments tab pulls events from a calendar you choose into your
  appointments. Reuses the existing Google sign-in (adds read-only Calendar
  permission). Pick your medical calendar the first time; the choice is
  remembered and can be changed. New events are matched on Google event id, then
  date + title, so re-syncing only adds genuinely new appointments — your edits
  are never overwritten. Event title → appointment title, start → date/time,
  location → address, description → notes.

### Setup required (one-time)
- The Calendar permission must be enabled on the app's Google OAuth consent
  screen, and you must be listed as a test user. Until then, sign-in will refuse
  the Calendar scope.

---

## v1.5.0 — 2026-06-17

This is the first formally versioned release. Everything below was built prior
to introducing version tracking; it is recorded here as the v1.5.0 baseline.

### Added
- **Versioning system** — semantic version sourced from `package.json`, shown in
  Settings & Backup → App version, with this changelog.
- **AI Analysis — fluid conversation & Print Summary** — the AI tab is now a
  continuous chat; a single **Print Summary** generates a structured one-to-two
  page brief (conversation summary, your questions, key findings, topics for your
  doctor, bottom line) instead of printing each response separately. Input box
  auto-expands vertically; New Conversation saves the transcript to Notes.
- **Imaging History** on the Profile tab — log MRI, CT, X-ray, and other studies
  with type, body part, facility, and date; included in the printed profile.
- **Vitals** — added Resting Heart Rate and Sleep to the inline entry form, plus
  auto-calculated **BMI** on both the Vitals tab and the Dashboard.
- **Care Team** — providers are now fully editable and deletable; checked
  physicians appear on the Dashboard styled like the Profile tab.
- **Medications** — Complete Refill / Complete Renewal buttons auto-calculate the
  next date; printable refill report sorted by pharmacy (due in ≤7 days, with Rx#).
- **Appointments** — auto-fills provider address from the Care Team; appointment
  notes flow into the Consultation Prep report and AI prompt; AI Appointment Prep
  pulls in relevant documents, conditions, and surgeries.
- **Custom lab reference ranges** with a dual-range bar and AI awareness.
- **Weekly backup infrastructure** and Google Drive sync.

### Fixed
- AI Appointment Prep no longer shows `Error: [object Object]` — the real error
  message from the API is now surfaced.

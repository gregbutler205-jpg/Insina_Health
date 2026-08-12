# VALIDATION_HISTORY_BUILDER.md
Founder click-through script for WO_HISTORY_BUILDER_01. Three paths. Run each
in a separate browser profile (or clear site data between paths). The builder
lives at Records & Tools, History Builder; its next-step card also appears at
the top of the Dashboard.

## Path 1. Fresh profile: wizard completion through Emergency Packet ready

1. Fresh profile. Create a vault, complete onboarding, pick the goal
   "Create an emergency health packet".
2. Open the Dashboard. Expect one "Next step" card. With no medications it
   reads "Add your current medications" with the suffix "Needed for your
   Emergency Packet." No percentage or progress bar anywhere.
3. Add two medications on the Medications tab. Return to History Builder.
   The Current Health area now asks "Is this your complete medication list?"
   Tap "Yes, this is everything".
4. Allergies: tap "I have no known allergies" (or add one, then Confirm).
5. Transplant details: the card asks for organ, date, and center. Add the
   transplant on Procedures with a date and facility. The ask clears.
6. Conditions: tap "Confirm your active conditions" after reviewing.
7. Care team: add one contact with a phone number. The ask clears.
8. Expect the one-time green card "Your Emergency Packet is ready" on the
   builder home. Dismiss it with OK; reload; it must not return.
9. If no care-team member has a coordinator role with phone, the soft line
   "Add your transplant coordinator's number when you have it." shows. It
   never blocks anything.
10. Print the Emergency Card. The footer carries the provenance lines
    "Medication list confirmed by patient on {date}" etc.

## Path 2. Existing-data profile: zero re-asks, correct readiness on load

1. Restore a full backup (or use the founder record). Open History Builder.
2. Expect NO prompts for anything already present: no medication ask, no
   transplant ask, no care-team ask. Attestation confirms (C-02, C-03, C-05)
   appear once each; confirm them.
3. Readiness should reflect the record immediately: Medication Report ready
   after the meds confirm, Emergency Packet ready once all three confirms are
   done (transplant and care team already present).
4. Dismiss the next-step card with "Later". It must not return until the
   other prompts in its stage clear, and at most once this session.
5. Upload any PDF from Source Documents. Expect the copy "Document saved.
   You can add details from it manually any time." No extraction offer in
   this build.

## Path 3. Fresh profile on the appointment goal: anchor, suffixes, boosts

1. Fresh profile. Pick the goal "Prepare for an upcoming appointment".
2. The FIRST thing the builder shows is "Which appointment are you preparing
   for?" listing upcoming appointments nearest first, plus the add form via
   "Add an appointment". Pick or add one.
3. After the anchor, S1 prompts run in order, each carrying the suffix
   "Needed for your appointment prep."
4. Complete the spine as in Path 1. After S1, the trough and panel prompts
   surface next (boosted), each carrying "Useful before your {date}
   appointment." with the chosen appointment's date.
5. Add a tacrolimus result. The trough backfill ask ("Trends need more than
   one point.") follows in Recent Care.
6. If a medication matches the lookup table (e.g. tacrolimus), at most one
   "You take {medication}. Add {condition} to your conditions?" appears per
   session. "No" must never re-propose it, this session or any later one.

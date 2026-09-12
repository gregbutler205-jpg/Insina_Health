# DEC drafts: landing page alignment (2026-09-11)

Drafted on completion of the landing alignment work order (branch `feat/landing-align-01`).
IDs are TBD until merged into DECISIONS.md. Each entry follows the DECISIONS.md shape.
Nothing here is Settled until Greg merges it.

---

## DEC-TBD-L1: The landing page states a complex-care focus beginning with liver disease

**Status:** Draft (work order, 2026-09-11)

**Source.** Landing alignment work order, Section 1; the pitch deck's positioning.

**Decision.** The hero carries one positioning line directly beneath the headline: "Built for people managing complex care across multiple specialists, beginning with liver disease." The headline is unchanged. The page metadata (title, description, Open Graph, Twitter) carries the same framing and keeps the not-a-medical-device clause.

**Rationale.** The deck, one-pager and outreach materials already say who the product is for; the landing page was the last surface that did not.

**Related:** DEC-TBD-L4 (framework line), the informational-tool disclaimer (locked copy, unchanged).

---

## DEC-TBD-L2: The primary CTA moves from waiting-list framing to invited early access

**Status:** Draft (work order, 2026-09-11)

**Decision.** Every primary CTA reads "Request Early Access" (was "Join the Waiting List" / "Join Waiting List"). The For Patients CTA carries the microcopy "Access is limited and invited." beneath it. The mechanism is unchanged: a mailto to hello@insinahealth.com, subject "Early access request" (was "Waitlist"). The secondary "Open Demo" CTA and "Sign In" are unchanged.

**Rationale.** A waiting list promises eventual access to everyone; the pilot admits people by invitation. The label should say what the process is.

**Related:** PILOT_GATE.md (second-user gating), DEC on evaluator onboarding.

---

## DEC-TBD-L3: Founder provenance is stated on the public landing page

**Status:** Draft (work order, 2026-09-11)

**Decision.** A single-column section, "Built from lived experience," sits after "You control your data" and before the For Doctors / For Investors split: "Insina Health was built by a liver transplant recipient who needed one place to hold the medications, labs, records, and appointments spread across nine physicians and seven patient portals." No portrait, no pull quote, no card. No health system, transplant center, donor or family member is named, on this page or elsewhere on the landing page.

**Rationale.** The origin of the product is its strongest credibility claim and the only one that is currently true without qualification. Institutional and family details add nothing the visitor needs and would create privacy and permission questions.

**Related:** Hard rule 4 of the work order (no claims not currently true; no institutional names).

---

## DEC-TBD-L4: "Organize. Educate. Prepare." is the product framework, scoped to brand level

**Status:** Draft (work order, 2026-09-11)

**Decision.** The framework line "Organize. Educate. Prepare." appears once, directly above the hero headline, in the existing hero sub-lead style. It does not appear in, above or beside the AI section, and the AI section's verbs ("explains, organizes, and prepares"; "never decides urgency") are locked safety language and stay byte-identical. "Educate" describes the product; it does not describe what the AI does.

**Rationale.** The framework is already the spine of the deck, one-pager and outreach. Keeping it out of AI feature copy keeps the safety language exact: the AI explains, organizes and prepares, and the framework must never be read as a claim that the AI educates or advises.

**Related:** Clinical Safety Core v1.2 (safety language), DEC-TBD-L1.

---

## DEC-TBD-L5: The hero uses a static product image with a fictional-data caption

**Status:** Draft (work order, 2026-09-11)

**Decision.** The rendered HTML/CSS device mockups (a laptop frame around a dashboard screenshot and a hand-built phone mockup, 105 lines of CSS and a dark palette token block used by nothing else) are replaced by one product image served through `<picture>`: AVIF and WebP at 1x (672 x 448) and 2x (1344 x 896), PNG fallback at 1x, flattened to the hero background (no alpha), width and height attributes set, eager with `fetchpriority="high"`, the AVIF preloaded. Alt text describes the two devices and what they show. A caption directly beneath reads "Illustrative interface. Fictional patient data." No animation, parallax or hover effect on the image.

**Rationale.** One reviewed image is easier to keep truthful than two hand-built mockups whose content drifted from the shipped app. The caption keeps the fictional-data disclosure next to the picture rather than in a footer.

**Open item recorded at build (not blocking, Greg to decide before merge):** the supplied 2400 px render still shows one of the earlier-listed defects, a contradictory attention state on the laptop (the greeting says "2 lab values need review" while the Your updates panel says "Your record is up to date"). The phone is consistent with the greeting. Everything else on the pre-ship gate checks out; the informational backup banner remains but is no longer a warning; the interface date is the known 2025 cosmetic.

**Related:** DEC-TBD-L1, the informational-tool disclaimer.

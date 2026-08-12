// REVIEW_REQUIRED clinical safety pass.
// History Builder ranking constants (HISTORY_BUILDER_SPEC section 5).
// These influence prompt ordering only. They never produce patient-facing
// threshold language, and no urgency vocabulary derives from them.
export const TROUGH_PROMPT_AGE_DAYS = 30;
export const PANEL_PROMPT_AGE_DAYS = 90;
export const APPT_BOOST_WINDOW_DAYS = 14;

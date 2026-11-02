/**
 * Game constants. Client-safe: this file must NEVER contain answer data
 * (canonical answers, aliases, priors or judge verdicts).
 * Labels for bands live in /config/brand.ts; only numbers live here.
 */

/** Smoothing strength for the prior in p_hat = (c_a + ALPHA * pi_a) / (N + ALPHA). */
export const ALPHA = 50;

export const PROMPTS_PER_DAY = 5;

/** Seconds a player has to answer each prompt. */
export const ANSWER_SECONDS = 25;

/** Server-side grace for network latency before an answer is rejected as late. */
export const GRACE_SECONDS = 2;

/** Odds are displayed as "X/1" and capped at this X. */
export const ODDS_DISPLAY_CAP = 999;

export const POINTS_MIN = 0;
export const POINTS_MAX = 100;

/** The only timezone used for "game day" logic. See /lib/time.ts. */
export const TIMEZONE = "Europe/London";

/**
 * Inclusive lower bounds, in points, for each band. Index-aligned with
 * `brand.bands` (index 0 = the most common answers, last = the rarest).
 */
export const BAND_THRESHOLDS = [0, 20, 40, 60, 80] as const;

export type BandIndex = 0 | 1 | 2 | 3 | 4;

/**
 * Game #1 is played on this London date; gameNumber derives from it.
 * TODO(PM): placeholder until the launch date is confirmed.
 */
export const LAUNCH_DATE = "2027-01-04";

/** Prior for a brand-new answer accepted mid-day by the judge (PM answer 6). */
export const PRIOR_UNSEEN = 0.002;

/** "Did you mean?": at most this many per question, server-side pause cap (PM answer 12). */
export const DID_YOU_MEAN_MAX_PER_QUESTION = 1;
export const DID_YOU_MEAN_MAX_PAUSE_SECONDS = 10;

/** Daily set scheduling: a prompt may not be reused within this many days. */
export const DAILY_REUSE_DAYS = 60;
/** daily:check fails if any of this many London days (from today) lacks a set. */
export const DAILY_CHECK_DAYS = 7;

/** Category keys for prompts. Display labels live in brand.ts (brand.categories). */
export const CATEGORY_KEYS = [
  "food_drink",
  "places",
  "tv_radio",
  "sport",
  "first_names",
  "everyday_britain",
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** Rate limits (PM answer 23). Implementation: PLAN items 5 and 11. */
export const RATE_LIMIT_PLAY_PER_DEVICE_PER_MIN = 30;
export const RATE_LIMIT_PLAY_PER_IP_PER_MIN = 120;
/** More than this many new device_ids from one IP in 24h → Turnstile on next play start. */
export const TURNSTILE_NEW_DEVICES_PER_IP_PER_DAY = 15;

/** Privacy (PM answer 22): raw answer text kept this long, then only norm/answer_id. */
export const RAW_ANSWER_RETENTION_DAYS = 90;

/** Minimum player age (PM answer 17; UK GDPR digital consent age). */
export const MIN_PLAYER_AGE = 13;

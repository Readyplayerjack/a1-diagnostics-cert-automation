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

/**
 * Scoring maths (CLAUDE.md "Scoring"). Pure; constants from config/game.ts.
 *
 *   p_hat  = (c_a + ALPHA * pi_a) / (N + ALPHA)
 *   odds   = 1 / p_hat, displayed "X/1" with X = round(odds) capped at ODDS_DISPLAY_CAP
 *   points = clamp(round(10 * log2(1 / p_hat)), POINTS_MIN, POINTS_MAX)
 *   invalid answer → 0 points + a plain-English reason
 *
 * Callers decide what c and N contain (e.g. whether the current player's
 * own answer is already counted); this module only does the arithmetic.
 */
import {
  ALPHA,
  BAND_THRESHOLDS,
  ODDS_DISPLAY_CAP,
  POINTS_MAX,
  POINTS_MIN,
  type BandIndex,
} from "@/config/game";

export type RarityInput = {
  /** c_a: players who gave this answer. Integer, 0 ≤ c ≤ n. */
  readonly c: number;
  /** N: plays of this prompt that day. Integer ≥ 0. */
  readonly n: number;
  /** pi_a: prior probability of this answer, 0 < prior ≤ 1. */
  readonly prior: number;
};

function assertInput({ c, n, prior }: RarityInput): void {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`n must be an integer >= 0, got ${n}`);
  if (!Number.isInteger(c) || c < 0 || c > n) {
    throw new RangeError(`c must be an integer in [0, n=${n}], got ${c}`);
  }
  if (!Number.isFinite(prior) || prior <= 0 || prior > 1) {
    throw new RangeError(`prior must be in (0, 1], got ${prior}`);
  }
}

/** Smoothed probability that a player gives this answer. Always in (0, 1]. */
export function pHat(input: RarityInput): number {
  assertInput(input);
  return (input.c + ALPHA * input.prior) / (input.n + ALPHA);
}

function assertP(p: number): void {
  if (!Number.isFinite(p) || p <= 0 || p > 1)
    throw new RangeError(`p_hat must be in (0, 1], got ${p}`);
}

/** The X in "X/1": round(1 / p_hat), at least 1, capped at ODDS_DISPLAY_CAP. */
export function oddsX(p: number): number {
  assertP(p);
  return Math.min(Math.max(Math.round(1 / p), 1), ODDS_DISPLAY_CAP);
}

/** Format a raw odds value X as "X/1", rounded and capped. Used by share text too. */
export function formatOdds(x: number): string {
  if (!Number.isFinite(x) || x < 1)
    throw new RangeError(`odds must be a finite number >= 1, got ${x}`);
  return `${Math.min(Math.round(x), ODDS_DISPLAY_CAP)}/1`;
}

/** Points for a valid answer with smoothed probability p. */
export function points(p: number): number {
  assertP(p);
  const raw = Math.round(10 * Math.log2(1 / p));
  return Math.min(Math.max(raw, POINTS_MIN), POINTS_MAX);
}

/** Band index for a points total: the highest band whose lower bound is ≤ pts. */
export function bandFor(pts: number): BandIndex {
  if (!Number.isFinite(pts) || pts < POINTS_MIN || pts > POINTS_MAX) {
    throw new RangeError(`points must be in [${POINTS_MIN}, ${POINTS_MAX}], got ${pts}`);
  }
  let band = 0;
  BAND_THRESHOLDS.forEach((min, i) => {
    if (pts >= min) band = i;
  });
  return band as BandIndex;
}

export type ValidScore = {
  readonly valid: true;
  readonly pHat: number;
  readonly oddsX: number;
  readonly oddsLabel: string;
  readonly points: number;
  readonly band: BandIndex;
};

export type InvalidScore = {
  readonly valid: false;
  readonly points: 0;
  readonly reason: string;
};

export type Score = ValidScore | InvalidScore;

/** Score a valid answer from its counts and prior. */
export function scoreValid(input: RarityInput): ValidScore {
  const p = pHat(input);
  const pts = points(p);
  const x = oddsX(p);
  return {
    valid: true,
    pHat: p,
    oddsX: x,
    oddsLabel: formatOdds(x),
    points: pts,
    band: bandFor(pts),
  };
}

/** Score a rejected answer: 0 points, and a reason is mandatory (hard rule 10). */
export function scoreInvalid(reason: string): InvalidScore {
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new Error("an invalid answer must carry a plain-English reason");
  return { valid: false, points: 0, reason: trimmed };
}

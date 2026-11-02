/**
 * The single home for "game day" time logic. Everything is Europe/London
 * via Intl (no server-local time, no naive UTC midnight). Pure, no network.
 *
 * UK clocks change at 01:00 UTC, so London midnight is never skipped or
 * repeated; days are 23 h (spring forward) or 25 h (fall back) long.
 */
import { LAUNCH_DATE, TIMEZONE } from "@/config/game";

export { TIMEZONE };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const londonParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partsAt(instant: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of londonParts.formatToParts(new Date(instant))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out;
}

/** London's offset from UTC (ms) at an instant: 0 in GMT, 3_600_000 in BST. */
export function londonOffsetMs(instant: number): number {
  const p = partsAt(instant);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function assertIsoDate(s: string): void {
  if (!isIsoDate(s)) throw new RangeError(`expected a YYYY-MM-DD date, got "${s}"`);
}

function dateToUtcMs(date: string): number {
  const m = DATE_RE.exec(date)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function utcMsToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Calendar arithmetic on YYYY-MM-DD strings (timezone-free). */
export function addDays(date: string, days: number): string {
  assertIsoDate(date);
  return utcMsToDate(dateToUtcMs(date) + days * DAY_MS);
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  assertIsoDate(a);
  assertIsoDate(b);
  return Math.round((dateToUtcMs(b) - dateToUtcMs(a)) / DAY_MS);
}

/** The London game date (YYYY-MM-DD) at an instant. */
export function gameDate(now: Date): string {
  const p = partsAt(now.getTime());
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The UTC instant at which a London date begins (its 00:00 Europe/London). */
export function londonMidnight(date: string): Date {
  assertIsoDate(date);
  const naive = dateToUtcMs(date);
  let instant = naive - londonOffsetMs(naive);
  // Re-check with the offset that applies at the candidate instant itself.
  instant = naive - londonOffsetMs(instant);
  return new Date(instant);
}

/** The instant a London date ends, i.e. the next date's midnight. */
export function endOfGameDay(date: string): Date {
  return londonMidnight(addDays(date, 1));
}

/** The next 00:00 Europe/London strictly after `now`. */
export function nextRollover(now: Date): Date {
  return endOfGameDay(gameDate(now));
}

/**
 * Whole seconds until the next rollover, rounded DOWN so anything cached for
 * this long expires at or before midnight. 0 in the final second of the day.
 */
export function secondsUntilRollover(now: Date): number {
  return Math.floor((nextRollover(now).getTime() - now.getTime()) / 1000);
}

/** Game number for a London date: LAUNCH_DATE is #1. Throws for earlier dates. */
export function gameNumber(date: string): number {
  const n = daysBetween(LAUNCH_DATE, date) + 1;
  if (n < 1) throw new RangeError(`${date} is before launch (${LAUNCH_DATE})`);
  return n;
}

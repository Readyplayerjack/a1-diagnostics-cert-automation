import { describe, expect, it } from "vitest";
import { LAUNCH_DATE } from "@/config/game";
import {
  addDays,
  daysBetween,
  endOfGameDay,
  gameDate,
  gameNumber,
  isIsoDate,
  londonMidnight,
  londonOffsetMs,
  nextRollover,
  secondsUntilRollover,
} from "@/lib/time";

const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

/**
 * London midnights (UTC instants). UK clock changes, verified against the
 * runtime's tz data: 2026-03-29T01:00Z (→BST), 2026-10-25T01:00Z (→GMT),
 * 2027-03-28T01:00Z (→BST), 2027-10-31T01:00Z (→GMT).
 */
const MIDNIGHTS: Array<[date: string, utc: string, note: string]> = [
  ["2026-01-16", "2026-01-16T00:00:00.000Z", "winter (GMT)"],
  ["2026-07-15", "2026-07-14T23:00:00.000Z", "summer (BST)"],
  ["2026-03-29", "2026-03-29T00:00:00.000Z", "spring-forward day 2026 starts in GMT"],
  ["2026-03-30", "2026-03-29T23:00:00.000Z", "first full BST day 2026"],
  ["2026-10-25", "2026-10-24T23:00:00.000Z", "fall-back day 2026 starts in BST"],
  ["2026-10-26", "2026-10-26T00:00:00.000Z", "first full GMT day 2026"],
  ["2027-03-28", "2027-03-28T00:00:00.000Z", "spring-forward day 2027 starts in GMT"],
  ["2027-03-29", "2027-03-28T23:00:00.000Z", "first full BST day 2027"],
  ["2027-10-31", "2027-10-30T23:00:00.000Z", "fall-back day 2027 starts in BST"],
  ["2027-11-01", "2027-11-01T00:00:00.000Z", "first full GMT day 2027"],
  ["2027-01-01", "2027-01-01T00:00:00.000Z", "new year (GMT)"],
  ["2028-02-29", "2028-02-29T00:00:00.000Z", "leap day (GMT)"],
];

describe("londonMidnight / gameDate either side of every midnight", () => {
  it.each(MIDNIGHTS)("%s begins at %s (%s)", (date, utc) => {
    expect(londonMidnight(date).toISOString()).toBe(utc);
    const t = Date.parse(utc);
    expect(gameDate(new Date(t))).toBe(date);
    expect(gameDate(new Date(t - 1))).toBe(addDays(date, -1));
    expect(gameDate(new Date(t + 1))).toBe(date);
  });
});

describe("clock changes (the instant itself does not change the game date)", () => {
  it.each([
    ["2026-03-29T00:59:59.999Z", "2026-03-29", 0],
    ["2026-03-29T01:00:00.000Z", "2026-03-29", HOUR],
    ["2026-10-25T00:59:59.999Z", "2026-10-25", HOUR],
    ["2026-10-25T01:00:00.000Z", "2026-10-25", 0],
    ["2027-03-28T00:59:59.999Z", "2027-03-28", 0],
    ["2027-03-28T01:00:00.000Z", "2027-03-28", HOUR],
    ["2027-10-31T00:59:59.999Z", "2027-10-31", HOUR],
    ["2027-10-31T01:00:00.000Z", "2027-10-31", 0],
  ])("%s → %s, offset %i ms", (iso, date, offset) => {
    expect(gameDate(at(iso))).toBe(date);
    expect(londonOffsetMs(Date.parse(iso))).toBe(offset);
  });
});

describe("day lengths", () => {
  it.each([
    ["2026-03-29", 23],
    ["2026-10-25", 25],
    ["2027-03-28", 23],
    ["2027-10-31", 25],
    ["2026-03-28", 24],
    ["2026-03-30", 24],
    ["2026-10-24", 24],
    ["2026-10-26", 24],
    ["2026-07-15", 24],
    ["2026-01-15", 24],
  ])("%s lasts %i hours", (date, hours) => {
    expect(endOfGameDay(date).getTime() - londonMidnight(date).getTime()).toBe(hours * HOUR);
  });
});

describe("nextRollover / secondsUntilRollover", () => {
  it.each([
    // [now, next rollover, seconds until]
    ["2026-01-15T23:59:59.000Z", "2026-01-16T00:00:00.000Z", 1],
    ["2026-01-15T23:59:59.500Z", "2026-01-16T00:00:00.000Z", 0],
    ["2026-01-16T00:00:00.000Z", "2026-01-17T00:00:00.000Z", 86_400],
    ["2026-07-14T22:59:00.000Z", "2026-07-14T23:00:00.000Z", 60],
    ["2026-07-14T23:00:00.000Z", "2026-07-15T23:00:00.000Z", 86_400],
    // spring forward 2026: the 29th is 23 h long
    ["2026-03-29T00:00:00.000Z", "2026-03-29T23:00:00.000Z", 82_800],
    ["2026-03-29T00:30:00.000Z", "2026-03-29T23:00:00.000Z", 81_000],
    ["2026-03-29T01:30:00.000Z", "2026-03-29T23:00:00.000Z", 77_400],
    ["2026-03-28T23:59:30.000Z", "2026-03-29T00:00:00.000Z", 30],
    // fall back 2026: the 25th is 25 h long
    ["2026-10-24T23:00:00.000Z", "2026-10-26T00:00:00.000Z", 90_000],
    ["2026-10-25T00:30:00.000Z", "2026-10-26T00:00:00.000Z", 84_600],
    ["2026-10-25T01:30:00.000Z", "2026-10-26T00:00:00.000Z", 81_000],
    ["2026-10-24T22:59:30.000Z", "2026-10-24T23:00:00.000Z", 30],
    // 2027 changes
    ["2027-03-28T00:00:00.000Z", "2027-03-28T23:00:00.000Z", 82_800],
    ["2027-03-27T23:59:00.000Z", "2027-03-28T00:00:00.000Z", 60],
    ["2027-10-30T23:00:00.000Z", "2027-11-01T00:00:00.000Z", 90_000],
    ["2027-10-30T22:59:00.000Z", "2027-10-30T23:00:00.000Z", 60],
  ])("at %s → %s (%i s)", (now, next, secs) => {
    expect(nextRollover(at(now)).toISOString()).toBe(next);
    expect(secondsUntilRollover(at(now))).toBe(secs);
  });

  const checkInstant = (t: number) => {
    const now = new Date(t);
    const next = nextRollover(now).getTime();
    expect(next).toBeGreaterThan(t);
    expect(next - t).toBeLessThanOrEqual(25 * HOUR);
    expect(gameDate(new Date(next))).toBe(addDays(gameDate(now), 1));
    expect(gameDate(new Date(next - 1))).toBe(gameDate(now));
  };

  it("holds every 59 min across 2026–2027", () => {
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 59 * 60_000) checkInstant(t);
  });

  it("holds every minute within ±3 h of each clock change", () => {
    for (const change of [
      "2026-03-29T01:00:00Z",
      "2026-10-25T01:00:00Z",
      "2027-03-28T01:00:00Z",
      "2027-10-31T01:00:00Z",
    ]) {
      const c = Date.parse(change);
      for (let t = c - 3 * HOUR; t <= c + 3 * HOUR; t += 60_000) checkInstant(t);
    }
  });
});

describe("gameNumber", () => {
  it("LAUNCH_DATE is #1 and counts calendar days (DST-safe)", () => {
    expect(gameNumber(LAUNCH_DATE)).toBe(1);
    expect(gameNumber(addDays(LAUNCH_DATE, 1))).toBe(2);
    expect(gameNumber(addDays(LAUNCH_DATE, 365))).toBe(366);
  });

  it("is continuous across clock changes", () => {
    const after = (d: string) => gameNumber(addDays(d, 1)) - gameNumber(d);
    for (const d of ["2027-03-27", "2027-03-28", "2027-10-30", "2027-10-31"])
      expect(after(d)).toBe(1);
  });

  it("throws before launch and for malformed dates", () => {
    expect(() => gameNumber(addDays(LAUNCH_DATE, -1))).toThrow(RangeError);
    expect(() => gameNumber("2027-02-30")).toThrow(RangeError);
    expect(() => gameNumber("04/01/2027")).toThrow(RangeError);
  });
});

describe("date helpers", () => {
  it("isIsoDate", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2027-13-01")).toBe(false);
    expect(isIsoDate("2027-1-01")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  it("addDays / daysBetween across month, year and DST boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", -1)).toBe("2026-10-24");
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2027-01-04", "2026-11-02")).toBe(-63);
  });
});

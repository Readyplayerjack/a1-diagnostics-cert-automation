import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";
import * as game from "@/config/game";

describe("config/game.ts", () => {
  it("has the specified constants", () => {
    expect(game.ALPHA).toBe(50);
    expect(game.PROMPTS_PER_DAY).toBe(5);
    expect(game.ANSWER_SECONDS).toBe(25);
    expect(game.GRACE_SECONDS).toBe(2);
    expect(game.ODDS_DISPLAY_CAP).toBe(999);
    expect(game.POINTS_MIN).toBe(0);
    expect(game.POINTS_MAX).toBe(100);
    expect(game.TIMEZONE).toBe("Europe/London");
    expect(game.BAND_THRESHOLDS).toEqual([0, 20, 40, 60, 80]);
  });

  it("band thresholds start at POINTS_MIN, ascend strictly and end at or below POINTS_MAX", () => {
    const t = game.BAND_THRESHOLDS;
    expect(t[0]).toBe(game.POINTS_MIN);
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!).toBeGreaterThan(t[i - 1]!);
    }
    expect(t[t.length - 1]!).toBeLessThanOrEqual(game.POINTS_MAX);
  });

  it("has exactly one brand label per band threshold", () => {
    expect(brand.bands).toHaveLength(game.BAND_THRESHOLDS.length);
  });

  it("does not reuse any competitor tier values", () => {
    expect(game.BAND_THRESHOLDS).not.toEqual([10, 15, 30, 60, 85, 100]);
    for (const v of [10, 15, 30, 85]) expect(game.BAND_THRESHOLDS).not.toContain(v);
  });

  it("has the PM-specified constants (message #2 answers)", () => {
    expect(game.LAUNCH_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(game.PRIOR_UNSEEN).toBe(0.002);
    expect(game.DID_YOU_MEAN_MAX_PER_QUESTION).toBe(1);
    expect(game.DID_YOU_MEAN_MAX_PAUSE_SECONDS).toBe(10);
    expect(game.DAILY_REUSE_DAYS).toBe(60);
    expect(game.RATE_LIMIT_PLAY_PER_DEVICE_PER_MIN).toBe(30);
    expect(game.RATE_LIMIT_PLAY_PER_IP_PER_MIN).toBe(120);
    expect(game.TURNSTILE_NEW_DEVICES_PER_IP_PER_DAY).toBe(15);
    expect(game.RAW_ANSWER_RETENTION_DAYS).toBe(90);
    expect(game.MIN_PLAYER_AGE).toBe(13);
    expect(game.CATEGORY_KEYS).toHaveLength(6);
  });

  it("every category key has a brand label", () => {
    for (const key of game.CATEGORY_KEYS) expect(brand.categories[key]).toBeTruthy();
    expect(Object.keys(brand.categories).sort()).toEqual([...game.CATEGORY_KEYS].sort());
  });

  it("TIMEZONE is a valid IANA zone", () => {
    expect(() => new Intl.DateTimeFormat("en-GB", { timeZone: game.TIMEZONE })).not.toThrow();
  });

  it("exports only primitives and number tuples (no answer data)", () => {
    for (const [key, value] of Object.entries(game)) {
      const ok =
        typeof value === "number" ||
        typeof value === "string" ||
        (Array.isArray(value) &&
          ((value as unknown[]).every((v) => typeof v === "number") ||
            (value as unknown[]).every((v) => typeof v === "string")));
      expect(ok, `${key} has an unexpected shape`).toBe(true);
    }
  });
});

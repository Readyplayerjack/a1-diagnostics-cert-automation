import { describe, expect, it } from "vitest";
import { ALPHA, BAND_THRESHOLDS, ODDS_DISPLAY_CAP, POINTS_MAX, POINTS_MIN } from "@/config/game";
import { bandFor, formatOdds, oddsX, pHat, points, scoreInvalid, scoreValid } from "@/lib/scoring";

describe("pHat", () => {
  it("implements (c + ALPHA·prior) / (N + ALPHA)", () => {
    expect(ALPHA).toBe(50);
    expect(pHat({ c: 0, n: 0, prior: 0.01 })).toBeCloseTo(0.01, 12);
    expect(pHat({ c: 10, n: 100, prior: 0.1 })).toBeCloseTo((10 + 5) / 150, 12);
    expect(pHat({ c: 1, n: 1, prior: 0.02 })).toBeCloseTo(2 / 51, 12);
    expect(pHat({ c: 1000, n: 1000, prior: 1 })).toBe(1);
  });

  it("with no plays, equals the prior", () => {
    for (const prior of [1e-6, 0.001, 0.25, 1])
      expect(pHat({ c: 0, n: 0, prior })).toBeCloseTo(prior, 12);
  });

  it("converges to c/N as N grows", () => {
    expect(pHat({ c: 300_000, n: 1_000_000, prior: 0.9 })).toBeCloseTo(0.3, 4);
  });

  it.each([
    [{ c: -1, n: 5, prior: 0.1 }],
    [{ c: 6, n: 5, prior: 0.1 }],
    [{ c: 1.5, n: 5, prior: 0.1 }],
    [{ c: 0, n: -1, prior: 0.1 }],
    [{ c: 0, n: 2.5, prior: 0.1 }],
    [{ c: 0, n: 5, prior: 0 }],
    [{ c: 0, n: 5, prior: -0.1 }],
    [{ c: 0, n: 5, prior: 1.01 }],
    [{ c: 0, n: 5, prior: Number.NaN }],
  ])("rejects invalid input %j", (input) => {
    expect(() => pHat(input)).toThrow(RangeError);
  });
});

describe("oddsX / formatOdds", () => {
  it.each([
    [1, 1],
    [0.5, 2],
    [1 / 33, 33],
    [0.0303, 33], // 33.0033 → 33
    [0.01, 100],
    [1 / 999, 999],
    [1 / 1000, ODDS_DISPLAY_CAP],
    [1e-9, ODDS_DISPLAY_CAP],
    [0.4, 3], // 2.5 rounds up
  ])("p=%f → %i/1", (p, x) => {
    expect(oddsX(p)).toBe(x);
  });

  it("formats as X/1 with rounding and the cap", () => {
    expect(formatOdds(33)).toBe("33/1");
    expect(formatOdds(32.5)).toBe("33/1");
    expect(formatOdds(1)).toBe("Evens");
    expect(formatOdds(1.49)).toBe("Evens");
    expect(formatOdds(1.5)).toBe("2/1");
    expect(formatOdds(5000)).toBe("999/1");
    expect(() => formatOdds(0.9)).toThrow(RangeError);
    expect(() => formatOdds(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("rejects p outside (0, 1]", () => {
    for (const p of [0, -0.1, 1.0001, Number.NaN]) expect(() => oddsX(p)).toThrow(RangeError);
  });
});

describe("points", () => {
  it.each([
    [1, 0], // certain answer
    [0.5, 10],
    [0.25, 20],
    [0.1, 33], // 33.22
    [0.01, 66], // 66.44
    [1 / 33, 50], // 50.44
    [2 ** -9.95, 100], // 99.5 rounds to 100
    [2 ** -9.94, 99], // 99.4 → 99
    [2 ** -10, 100],
    [1e-6, 100], // 199 clamped
    [Number.MIN_VALUE, POINTS_MAX],
  ])("p=%f → %i points", (p, expected) => {
    expect(points(p)).toBe(expected);
  });

  it("rejects p outside (0, 1]", () => {
    for (const p of [0, 2, Number.NaN]) expect(() => points(p)).toThrow(RangeError);
  });
});

describe("bandFor", () => {
  it.each([
    [0, 0],
    [19, 0],
    [20, 1],
    [39, 1],
    [40, 2],
    [59, 2],
    [60, 3],
    [79, 3],
    [80, 4],
    [100, 4],
  ])("%i points → band %i", (pts, band) => {
    expect(bandFor(pts)).toBe(band);
  });

  it("every threshold starts its own band", () => {
    BAND_THRESHOLDS.forEach((min, i) => expect(bandFor(min)).toBe(i));
  });

  it("rejects out-of-range points", () => {
    for (const pts of [-1, 101, Number.NaN]) expect(() => bandFor(pts)).toThrow(RangeError);
  });
});

describe("scoreValid / scoreInvalid", () => {
  it("assembles a full score", () => {
    const s = scoreValid({ c: 0, n: 0, prior: 0.01 });
    expect(s).toEqual({
      valid: true,
      pHat: expect.closeTo(0.01, 12),
      oddsX: 100,
      oddsLabel: "100/1",
      points: 66,
      band: 3,
    });
  });

  it("the most common answer scores 0 in the bottom band", () => {
    const s = scoreValid({ c: 900, n: 1000, prior: 0.9 });
    expect(s.points).toBe(2);
    expect(s.band).toBe(0);
    expect(scoreValid({ c: 1000, n: 1000, prior: 1 })).toMatchObject({
      points: 0,
      oddsLabel: "Evens",
    });
  });

  it("an unseen answer with a tiny prior hits the caps", () => {
    expect(scoreValid({ c: 1, n: 5000, prior: 1e-6 })).toMatchObject({
      oddsX: ODDS_DISPLAY_CAP,
      oddsLabel: `${ODDS_DISPLAY_CAP}/1`,
      points: 100,
      band: 4,
    });
  });

  it("invalid answers score 0 and must carry a reason", () => {
    expect(scoreInvalid("  Not a supermarket own-brand product. ")).toEqual({
      valid: false,
      points: 0,
      reason: "Not a supermarket own-brand product.",
    });
    expect(() => scoreInvalid("")).toThrow();
    expect(() => scoreInvalid("   ")).toThrow();
  });
});

describe("scoring invariants over a parameter grid", () => {
  const ns = [0, 1, 2, 10, 50, 100, 1_000, 10_000, 250_000];
  const priors = [1e-6, 1e-4, 0.001, 0.01, 0.05, 0.1, 0.3, 0.5, 0.9, 1];
  const grid: Array<{ c: number; n: number; prior: number }> = [];
  for (const n of ns)
    for (const prior of priors)
      for (const c of new Set(
        [0, 1, Math.floor(n / 10), Math.floor(n / 2), n].filter((c) => c <= n),
      ))
        grid.push({ c, n, prior });

  it(`holds bounds for ${grid.length} combinations`, () => {
    for (const input of grid) {
      const s = scoreValid(input);
      expect(s.pHat).toBeGreaterThan(0);
      expect(s.pHat).toBeLessThanOrEqual(1);
      expect(Number.isInteger(s.points)).toBe(true);
      expect(s.points).toBeGreaterThanOrEqual(POINTS_MIN);
      expect(s.points).toBeLessThanOrEqual(POINTS_MAX);
      expect(s.oddsX).toBeGreaterThanOrEqual(1);
      expect(s.oddsX).toBeLessThanOrEqual(ODDS_DISPLAY_CAP);
      expect(s.oddsLabel).toMatch(/^(?:\d{1,3}\/1|Evens)$/);
      expect(s.oddsLabel === "Evens").toBe(s.oddsX === 1);
      expect(s.band).toBe(bandFor(s.points));
    }
  });

  it("more players giving the same answer never increases points (fixed N, prior)", () => {
    for (const n of ns)
      for (const prior of priors) {
        let prev = Number.POSITIVE_INFINITY;
        for (let c = 0; c <= Math.min(n, 200); c++) {
          const pts = scoreValid({ c, n, prior }).points;
          expect(pts).toBeLessThanOrEqual(prev);
          prev = pts;
        }
      }
  });

  it("a higher prior never increases points (fixed c, N)", () => {
    for (const n of ns)
      for (const c of [0, Math.floor(n / 3)]) {
        let prev = Number.POSITIVE_INFINITY;
        for (const prior of priors) {
          const pts = scoreValid({ c, n, prior }).points;
          expect(pts).toBeLessThanOrEqual(prev);
          prev = pts;
        }
      }
  });

  it("rarer always means longer (or equal, once capped) odds", () => {
    for (const prior of priors) {
      let prev = 0;
      for (let c = 1000; c >= 0; c -= 50) {
        const x = scoreValid({ c, n: 1000, prior }).oddsX;
        expect(x).toBeGreaterThanOrEqual(prev);
        prev = x;
      }
    }
  });
});

describe("PM expected values (message #2, answer 6) — round half up", () => {
  it.each([
    // [prior, c, N, p_hat ≈, odds label, points]
    [0.35, 1, 1, 0.3627, "3/1", 15],
    [0.002, 1, 1, 0.02157, "46/1", 55],
    [0.002, 1, 1000, 0.0010476, "955/1", 99],
  ])("prior %f, c=%i, N=%i → p≈%f, %s, %i pts", (prior, c, n, p, label, pts) => {
    const s = scoreValid({ c, n, prior });
    expect(s.pHat).toBeCloseTo(p, 4);
    expect(s.oddsLabel).toBe(label);
    expect(s.points).toBe(pts);
  });

  it("odds that round to 1 display as Evens (brand.strings.evens)", () => {
    const s = scoreValid({ c: 99, n: 100, prior: 0.35 });
    expect(s.oddsX).toBe(1);
    expect(s.oddsLabel).toBe("Evens");
  });
});

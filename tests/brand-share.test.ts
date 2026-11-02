import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";
import { ODDS_DISPLAY_CAP } from "@/config/game";

const { shareText, ogTitle, ogDescription } = brand.share;

describe("brand.share.shareText", () => {
  it("matches the documented format", () => {
    expect(shareText({ day: 12, longestOdds: 212, points: 340 })).toBe(
      `${brand.name} #12 · Longest odds: 212/1 · 340 pts`,
    );
  });

  it("is built from brand.name", () => {
    expect(shareText({ day: 1, longestOdds: 3, points: 10 }).startsWith(`${brand.name} #1 `)).toBe(
      true,
    );
  });

  it("rounds odds and caps them at the display cap", () => {
    expect(shareText({ day: 2, longestOdds: 32.6, points: 0 })).toContain("33/1");
    expect(shareText({ day: 2, longestOdds: 5000, points: 0 })).toContain(`${ODDS_DISPLAY_CAP}/1`);
  });

  it("rejects nonsense input", () => {
    expect(() => shareText({ day: 0, longestOdds: 2, points: 1 })).toThrow(RangeError);
    expect(() => shareText({ day: 1.5, longestOdds: 2, points: 1 })).toThrow(RangeError);
    expect(() => shareText({ day: 1, longestOdds: 0.5, points: 1 })).toThrow(RangeError);
    expect(() => shareText({ day: 1, longestOdds: Number.NaN, points: 1 })).toThrow(RangeError);
    expect(() => shareText({ day: 1, longestOdds: 2, points: -1 })).toThrow(RangeError);
  });
});

describe("brand.share OG text", () => {
  it("ogTitle", () => {
    expect(ogTitle({ day: 7 })).toBe(`${brand.name} #7`);
    expect(() => ogTitle({ day: -1 })).toThrow(RangeError);
  });

  it("ogDescription is spoiler-free and includes odds, points and tagline", () => {
    const d = ogDescription({ longestOdds: 212, points: 340 });
    expect(d).toBe(`Longest odds 212/1 · 340 pts. ${brand.tagline}`);
  });
});

describe("brand copy", () => {
  it("has the required disclaimer and five ordered bands", () => {
    expect(brand.strings.disclaimer).toBe("The odds are just for fun. No stakes, no money, ever.");
    expect(brand.bands).toEqual(["Favourite", "Fancied", "Outsider", "Longshot", "Rank Outsider"]);
  });

  it("uses no ocean/sea/depth/dive/underwater/fish wording", () => {
    const text = JSON.stringify(brand).toLowerCase();
    for (const word of ["ocean", "sea", "depth", "dive", "underwater", "fish", "krillion"]) {
      expect(text, `brand contains "${word}"`).not.toMatch(new RegExp(`\\b${word}`));
    }
  });
});

import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #RRGGBB colour: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
    const c = parseInt(h ?? "0", 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const AA_BODY = 4.5;

describe("contrastRatio helper", () => {
  it("matches known reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#123456", "#123456")).toBe(1);
  });
});

describe("brand colour pairs meet WCAG AA (4.5:1)", () => {
  for (const mode of ["light", "dark"] as const) {
    for (const { fg, bg } of brand.contrastPairs) {
      it(`${mode}: ${fg} on ${bg}`, () => {
        const ratio = contrastRatio(brand.colors[fg][mode], brand.colors[bg][mode]);
        expect(ratio, `${fg} on ${bg} (${mode}) = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          AA_BODY,
        );
      });
    }
  }

  it("every colour is a valid #RRGGBB value", () => {
    for (const [token, c] of Object.entries(brand.colors)) {
      expect(c.light, token).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.dark, token).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

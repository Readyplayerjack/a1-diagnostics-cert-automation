import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";
import { cssVarName, themeCss } from "@/lib/theme";

describe("themeCss", () => {
  it("maps camelCase tokens to kebab-case variables", () => {
    expect(cssVarName("racingGreen")).toBe("--brand-racing-green");
    expect(cssVarName("paper")).toBe("--brand-paper");
  });

  it("emits every brand colour for light and dark mode", () => {
    const css = themeCss(brand.colors);
    for (const [token, c] of Object.entries(brand.colors)) {
      expect(css).toContain(`${cssVarName(token)}:${c.light};`);
      expect(css).toContain(`${cssVarName(token)}:${c.dark};`);
    }
    expect(css).toContain("@media (prefers-color-scheme: dark)");
  });
});

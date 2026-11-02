import type { ModeColor } from "@/config/brand";

/** CSS custom property name for a colour token, e.g. racingGreen → --brand-racing-green. */
export function cssVarName(token: string): string {
  return `--brand-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * Build the stylesheet that sets brand colour variables for light mode and
 * (via prefers-color-scheme) dark mode. Tailwind's theme reads these variables
 * in app/globals.css, so no other file hard-codes a colour.
 */
export function themeCss(colors: Readonly<Record<string, ModeColor>>): string {
  const entries = Object.entries(colors);
  const light = entries.map(([t, c]) => `${cssVarName(t)}:${c.light};`).join("");
  const dark = entries.map(([t, c]) => `${cssVarName(t)}:${c.dark};`).join("");
  return `:root{color-scheme:light dark;${light}}@media (prefers-color-scheme: dark){:root{${dark}}}`;
}

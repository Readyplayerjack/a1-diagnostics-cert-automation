/**
 * ALL branding lives here: name, UI copy, band labels, colours, share and OG text.
 * Renaming the game must only require editing this file.
 *
 * Client-safe: no secrets, no answer data.
 */
import { formatOdds } from "../lib/scoring";

/** A colour with explicit light- and dark-mode values (hex, #RRGGBB). */
export type ModeColor = { readonly light: `#${string}`; readonly dark: `#${string}` };

const name = "LONGSHOT";
const tagline = "Back the answer nobody else will.";

/**
 * Pub / racing-slip palette. Token names describe the role, not the hue in
 * every mode: `paper` is always the page background and `ink` always the body
 * text, so in dark mode `paper` is dark and `ink` is light.
 */
const colors = {
  /** Page background: betting-slip cream / night-time slip. */
  paper: { light: "#F6F0DF", dark: "#101914" },
  /** Raised surface (cards, slips) on top of `paper`. */
  slip: { light: "#FFFBF0", dark: "#18241D" },
  /** Body text. */
  ink: { light: "#1C1B17", dark: "#F2EBD8" },
  /** Secondary text. */
  mutedInk: { light: "#55503F", dark: "#BDB5A0" },
  /** Primary brand colour: racing green. */
  racingGreen: { light: "#0E4D33", dark: "#7FCBA0" },
  /** Accent: brass / gold. */
  brass: { light: "#7A5A10", dark: "#D8B25A" },
  /** Emphasis and warnings: oxblood. */
  oxblood: { light: "#7B1E2C", dark: "#EE9AA3" },
} as const satisfies Record<string, ModeColor>;

export type ColorToken = keyof typeof colors;

/**
 * Foreground/background pairs actually used for text. Each must meet WCAG AA
 * (4.5:1) in both light and dark mode; enforced by tests/brand-contrast.test.ts.
 */
const contrastPairs = [
  { fg: "ink", bg: "paper" },
  { fg: "ink", bg: "slip" },
  { fg: "mutedInk", bg: "paper" },
  { fg: "mutedInk", bg: "slip" },
  { fg: "racingGreen", bg: "paper" },
  { fg: "racingGreen", bg: "slip" },
  { fg: "brass", bg: "paper" },
  { fg: "oxblood", bg: "paper" },
  { fg: "oxblood", bg: "slip" },
  { fg: "paper", bg: "racingGreen" },
] as const satisfies ReadonlyArray<{ fg: ColorToken; bg: ColorToken }>;

function assertDay(day: number): void {
  if (!Number.isInteger(day) || day < 1) {
    throw new RangeError(`day must be a positive integer, got ${day}`);
  }
}

function assertPoints(points: number): void {
  if (!Number.isInteger(points) || points < 0) {
    throw new RangeError(`points must be a non-negative integer, got ${points}`);
  }
}

export type ShareInput = {
  /** 1-based game number, e.g. 12 for "#12". */
  readonly day: number;
  /** The X of the player's longest "X/1" odds that day. */
  readonly longestOdds: number;
  /** Total points for the day. */
  readonly points: number;
};

/** Spoiler-free share text, e.g. "LONGSHOT #12 · Longest odds: 212/1 · 340 pts". */
function shareText({ day, longestOdds, points }: ShareInput): string {
  assertDay(day);
  assertPoints(points);
  return `${name} #${day} · Longest odds: ${formatOdds(longestOdds)} · ${points} pts`;
}

/** Open Graph title, e.g. "LONGSHOT #12". */
function ogTitle({ day }: Pick<ShareInput, "day">): string {
  assertDay(day);
  return `${name} #${day}`;
}

/** Open Graph description; spoiler-free (never contains answers). */
function ogDescription({ longestOdds, points }: Omit<ShareInput, "day">): string {
  assertPoints(points);
  return `Longest odds ${formatOdds(longestOdds)} · ${points} pts. ${tagline}`;
}

export const brand = {
  name,
  shortName: "Longshot",
  tagline,
  /** Placeholder until a domain is registered. */
  domain: "longshot.example",
  socialHandle: null,
  /** Ordered from most common answers (index 0) to rarest. Thresholds: config/game.ts. */
  bands: ["Favourite", "Fancied", "Outsider", "Longshot", "Rank Outsider"],
  colors,
  contrastPairs,
  strings: {
    siteTitle: `${name} — the daily word game for long odds`,
    metaDescription:
      "Five prompts a day. Twenty-five seconds each. The rarer your answer, the longer your odds.",
    tagline,
    footer: "New prompts every day at midnight, UK time.",
    disclaimer: "The odds are just for fun. No stakes, no money, ever.",
  },
  share: {
    shareText,
    ogTitle,
    ogDescription,
  },
} as const;

export type Brand = typeof brand;

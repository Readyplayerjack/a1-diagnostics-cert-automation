import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";

/**
 * Branding guard: the product name may only appear in /config/brand.ts, so a
 * rename is a one-file edit. Competitor names and their ocean theme are banned.
 * Scans /app, /components and /lib (not /config, docs or node_modules).
 */
const ROOT = join(__dirname, "..");
const SCANNED_DIRS = ["app", "components", "lib"];
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|json|md|mdx|html|svg|txt)$/i;
const BANNED = ["krillion", "ocean", "depth", "underwater"];

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (TEXT_EXT.test(entry)) out.push(full);
  }
  return out;
}

export function findViolations(root: string): string[] {
  const needles = [brand.name.toLowerCase(), ...BANNED];
  const violations: string[] = [];
  for (const file of SCANNED_DIRS.flatMap((d) => walk(join(root, d)))) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const lower = line.toLowerCase();
      for (const needle of needles) {
        if (lower.includes(needle)) {
          violations.push(`${relative(root, file)}:${i + 1} contains "${needle}"`);
        }
      }
    });
  }
  return violations;
}

describe("branding guard", () => {
  it("scans at least the app entry points", () => {
    const scanned = SCANNED_DIRS.flatMap((d) => walk(join(ROOT, d)));
    expect(scanned.some((f) => f.endsWith(join("app", "page.tsx")))).toBe(true);
  });

  it("finds no product-name literal or banned words in app/, components/ or lib/", () => {
    expect(findViolations(ROOT)).toEqual([]);
  });
});

/**
 * Gambling-optics guard (CLAUDE.md hard rule 13). Banned in UI copy: bet, wager,
 * stake, punt, bookie, bookmaker, win money, payout, cash, jackpot, odds-on, tips.
 * Whole words incl. simple inflections, case-insensitive.
 */
export const BANNED_UI_WORDS =
  /\b(?:bet(?:s|ting)?|wager(?:s|ed|ing)?|stak(?:e|es|ed|ing)|punt(?:s|er|ers|ing)?|bookies?|bookmakers?|win(?:ning)?\s+money|payouts?|cash|jackpots?|odds-on|tips|tipsters?)\b/i;

/**
 * The one sanctioned exception: the mandatory disclaimer (Prompt #1) negates
 * stakes ("No stakes, no money, ever."). Flagged to the PM; change it there.
 */
const EXEMPT_STRINGS = new Set<string>([brand.strings.disclaimer]);

function brandStrings(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => brandStrings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object" && path !== "brand.colors") {
    for (const [k, v] of Object.entries(value)) brandStrings(v, `${path}.${k}`, out);
  }
}

export function findBannedWords(root: string): string[] {
  const hits: string[] = [];
  for (const file of ["app", "components"].flatMap((d) => walk(join(root, d)))) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const m = BANNED_UI_WORDS.exec(line);
        if (m) hits.push(`${relative(root, file)}:${i + 1} "${m[0]}"`);
      });
  }
  const strings: Array<[string, string]> = [];
  brandStrings(brand, "brand", strings);
  // Generated copy too, from representative inputs.
  strings.push(
    ["share.shareText", brand.share.shareText({ day: 12, longestOdds: 212, points: 340 })],
    ["share.ogTitle", brand.share.ogTitle({ day: 12 })],
    ["share.ogDescription", brand.share.ogDescription({ longestOdds: 1, points: 0 })],
  );
  for (const [path, s] of strings) {
    if (EXEMPT_STRINGS.has(s)) continue;
    const m = BANNED_UI_WORDS.exec(s);
    if (m) hits.push(`${path} "${m[0]}"`);
  }
  return hits;
}

describe("banned gambling wording (hard rule 13)", () => {
  it("matches the banned words and their inflections, not innocent words", () => {
    for (const w of [
      "bet",
      "Betting",
      "wager",
      "stakes",
      "punter",
      "bookie",
      "Bookmakers",
      "win money",
      "payout",
      "CASH",
      "jackpot",
      "odds-on",
      "tips",
    ]) {
      expect(BANNED_UI_WORDS.test(w), w).toBe(true);
    }
    for (const w of [
      "between",
      "better",
      "alphabet",
      "abet",
      "cashew",
      "cache",
      "steak",
      "tip",
      "outsider",
      "favourite",
      "long shot",
      "the field",
      "back an answer",
      "form",
    ]) {
      expect(BANNED_UI_WORDS.test(w), w).toBe(false);
    }
  });

  it("finds none in app/, components/ or brand.ts strings", () => {
    expect(findBannedWords(ROOT)).toEqual([]);
  });
});

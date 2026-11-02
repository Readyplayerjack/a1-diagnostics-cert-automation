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

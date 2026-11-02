import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hard rule 2: server-only modules start with `import "server-only"`, so a
 * client import fails the build instead of leaking secrets or answer data.
 */
const ROOT = join(__dirname, "..");
const SERVER_DIR = join(ROOT, "lib", "server");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

describe("lib/server modules", () => {
  const files = walk(SERVER_DIR);

  it("exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [relative(ROOT, f), f]))(
    '%s starts with import "server-only"',
    (_name, file) => {
      const firstCode = readFileSync(file, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .find(
          (l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*"),
        );
      expect(firstCode).toMatch(/^import ["']server-only["'];?$/);
    },
  );
});

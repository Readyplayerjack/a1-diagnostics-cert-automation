/** Load and validate every /content/prompts/*.json file. Used by the CLI scripts. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type PromptFile, validatePromptFile } from "../lib/content/schema";

export const PROMPTS_DIR = join(__dirname, "..", "content", "prompts");

export type LoadResult = { files: PromptFile[]; errors: string[] };

export function loadPromptFiles(dir: string = PROMPTS_DIR): LoadResult {
  let names: string[];
  try {
    names = readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .sort();
  } catch {
    return { files: [], errors: [] };
  }
  const files: PromptFile[] = [];
  const errors: string[] = [];
  for (const name of names) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch (e) {
      errors.push(`${name}: invalid JSON (${(e as Error).message})`);
      continue;
    }
    const r = validatePromptFile(json);
    if (!r.ok) {
      errors.push(...r.errors.map((err) => `${name}: ${err}`));
      continue;
    }
    if (`${r.file.slug}.json` !== name) {
      errors.push(`${name}: file name must be "${r.file.slug}.json"`);
      continue;
    }
    files.push(r.file);
  }
  return { files, errors };
}

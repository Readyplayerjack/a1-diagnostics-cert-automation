/**
 * Seed prompt content into the database.
 *
 *   pnpm seed                    approved prompts only
 *   pnpm seed --include-drafts   also drafts (local development)
 *   pnpm seed --dry-run          validate + print the plan, touch nothing
 *
 * Database URL: SUPABASE_DB_URL, else `supabase status` (local).
 * Refuses to run if ANY content file is invalid.
 */
import { execSync } from "node:child_process";
import pg from "pg";
import { buildSeedPlan } from "../lib/content/seed-plan";
import { loadPromptFiles } from "./content-files";
import { applySeedPlan } from "./seed-apply";

function dbUrl(): string {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const out = execSync("pnpm exec supabase status -o env", { encoding: "utf8" });
  const m = /^DB_URL="?([^"\n]+)"?$/m.exec(out);
  if (!m?.[1]) throw new Error("No DB URL: set SUPABASE_DB_URL or run `pnpm db:start`.");
  return m[1];
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const { files, errors } = loadPromptFiles();
  if (errors.length > 0) {
    console.error(
      `Refusing to seed: ${errors.length} content problem(s). Run pnpm content:validate.`,
    );
    process.exit(1);
  }
  const selected = files.filter(
    (f) => f.status === "approved" || (args.has("--include-drafts") && f.status === "draft"),
  );
  const plan = buildSeedPlan(selected);
  console.log(
    `Plan: ${plan.prompts.length} prompts, ${plan.answers.length} answers, ${plan.aliases.length} aliases`,
  );
  if (args.has("--dry-run")) return;

  const client = new pg.Client({ connectionString: dbUrl() });
  await client.connect();
  try {
    const report = await applySeedPlan(client, plan);
    console.log(`Seeded. New aliases this run: ${report.aliasesInserted}`);
    if (report.aliasConflicts.length) {
      console.warn(`Alias conflicts (left unchanged):\n  ${report.aliasConflicts.join("\n  ")}`);
    }
    if (report.orphanAnswers.length) {
      console.warn(
        `Answers in DB but not in files (not deleted):\n  ${report.orphanAnswers.join("\n  ")}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

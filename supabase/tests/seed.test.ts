/**
 * Seeder integration test (needs a running database). Run with `pnpm test:db`.
 * Uses SUPABASE_DB_URL, else `supabase status`.
 */
import { execSync } from "node:child_process";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promptId } from "../../lib/content/ids";
import { buildSeedPlan } from "../../lib/content/seed-plan";
import { applySeedPlan } from "../../scripts/seed-apply";
import { makePromptFile } from "../../tests/fixtures/prompt-file";

function dbUrl(): string {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const out = execSync("pnpm exec supabase status -o env", { encoding: "utf8" });
  const m = /^DB_URL="?([^"\n]+)"?$/m.exec(out);
  if (!m?.[1]) throw new Error("No DB URL: set SUPABASE_DB_URL or run `pnpm db:start`.");
  return m[1];
}

const SLUG = "seed-test-fixture";
const PID = promptId(SLUG);
const db = new pg.Client({ connectionString: dbUrl() });

async function cleanup(): Promise<void> {
  await db.query("begin");
  await db.query("set local role service_role");
  await db.query("delete from public.prompts where id = $1", [PID]);
  await db.query("commit");
}

async function count(sql: string): Promise<number> {
  await db.query("begin");
  await db.query("set local role service_role");
  const r = await db.query<{ n: string }>(sql, [PID]);
  await db.query("rollback");
  return Number(r.rows[0]?.n);
}

beforeAll(async () => {
  await db.connect();
  await cleanup();
});

afterAll(async () => {
  try {
    await cleanup();
  } finally {
    await db.end();
  }
});

describe("applySeedPlan", () => {
  const file = makePromptFile({
    slug: SLUG,
    answers: makePromptFile().answers.map((a, i) =>
      i === 0 ? { ...a, aliases: ["F.A. one"] } : a,
    ),
  });

  it("inserts prompts, answers and aliases", async () => {
    const report = await applySeedPlan(db, buildSeedPlan([file]));
    expect(report).toMatchObject({
      prompts: 1,
      answers: 25,
      aliasesInserted: 26,
      aliasConflicts: [],
    });
    expect(
      await count("select count(*)::text n from public.canonical_answers where prompt_id = $1"),
    ).toBe(25);
    expect(await count("select count(*)::text n from public.aliases where prompt_id = $1")).toBe(
      26,
    );
  });

  it("is idempotent: a second run adds nothing", async () => {
    const report = await applySeedPlan(db, buildSeedPlan([file]));
    expect(report.aliasesInserted).toBe(0);
    expect(
      await count("select count(*)::text n from public.canonical_answers where prompt_id = $1"),
    ).toBe(25);
    expect(await count("select count(*)::text n from public.aliases where prompt_id = $1")).toBe(
      26,
    );
  });

  it("updates changed fields, keeps admin merges, reports orphans and alias conflicts", async () => {
    const plan = buildSeedPlan([file]);
    const [first, second] = plan.answers;
    // Simulate admin work: merge answer #2 into #1, and add a human alias "fa two" to #1.
    await db.query("begin");
    await db.query("set local role service_role");
    await db.query(
      "update public.canonical_answers set status='merged', merged_into=$1 where id=$2",
      [first?.id, second?.id],
    );
    await db.query(
      "insert into public.aliases (answer_id, prompt_id, alias_norm, source) values ($1, $2, 'fa two', 'human')",
      [first?.id, PID],
    );
    await db.query("commit");

    const edited = makePromptFile({
      ...file,
      text: "Name a fixture used only in tests, edited",
      answers: file.answers
        .slice(0, 24) // drop the last answer from the file
        .map((a, i) =>
          i === 1 ? { ...a, aliases: ["FA two"] } : i === 2 ? { ...a, prior: 0.02 } : a,
        ),
    });
    // 24 answers fails content rules, but applySeedPlan works on any plan; build it directly.
    const report = await applySeedPlan(db, buildSeedPlan([edited]));
    expect(report.orphanAnswers).toHaveLength(1);
    expect(report.aliasConflicts).toHaveLength(1);

    await db.query("begin");
    await db.query("set local role service_role");
    const p = await db.query<{ text: string }>("select text from public.prompts where id = $1", [
      PID,
    ]);
    const merged = await db.query<{ status: string }>(
      "select status from public.canonical_answers where id = $1",
      [second?.id],
    );
    const prior = await db.query<{ prior_p: string }>(
      "select prior_p::text from public.canonical_answers where id = $1",
      [plan.answers[2]?.id],
    );
    await db.query("rollback");
    expect(p.rows[0]?.text).toBe("Name a fixture used only in tests, edited");
    expect(merged.rows[0]?.status).toBe("merged");
    expect(prior.rows[0]?.prior_p).toBe("0.02");
  });
});

/**
 * Daily endpoints against a real database: leak test (PLAN item 4).
 * Seeds prompts WITH canonical answers, aliases and priors, publishes today's
 * and yesterday's sets, then string-searches the serialised responses.
 *
 * Layer 1 (always): endpoint logic with a pg-backed repo using the same
 *   column allowlist as production.
 * Layer 2 (needs the Supabase Data API; skipped with RLS_DB_ONLY=1): the real
 *   route handlers through supabase-js with the service-role key.
 */
import { execSync } from "node:child_process";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CATEGORY_KEYS } from "../../config/game";
import { answerId, promptId } from "../../lib/content/ids";
import type { PromptFile } from "../../lib/content/schema";
import { buildSeedPlan } from "../../lib/content/seed-plan";
import { normalise } from "../../lib/normalise";
import { addDays } from "../../lib/time";
import { applySeedPlan } from "../../scripts/seed-apply";
import { makePromptFile } from "../../tests/fixtures/prompt-file";

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));

const status = (() => {
  try {
    const out = execSync("pnpm exec supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return Object.fromEntries(
      [...out.matchAll(/^([A-Z_]+)="?([^"\n]*)"?$/gm)].map((m) => [m[1], m[2]]),
    );
  } catch {
    return {} as Record<string, string>;
  }
})();
const DB_URL = process.env.SUPABASE_DB_URL ?? status.DB_URL;
const API_URL = process.env.SUPABASE_API_URL ?? status.API_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? status.SERVICE_ROLE_KEY;
const apiEnabled = !process.env.RLS_DB_ONLY;

const TODAY = "2027-03-28";
const PAST = addDays(TODAY, -1);
const NOON = new Date("2027-03-28T12:00:00Z");
const SLUGS = CATEGORY_KEYS.slice(0, 5).map((c) => `leak-test-${c.replace(/_/g, "-")}`);

/** Distinctive answer data that must never appear in a response. */
function leakFile(slug: string, i: number): PromptFile {
  const base = makePromptFile();
  return makePromptFile({
    slug,
    status: "approved",
    review: { reviewer: "test", date: "2027-01-01" },
    category: CATEGORY_KEYS[i]!,
    text: `Name a leak-test thing, set ${i}`,
    answers: base.answers.map((a, j) => ({
      ...a,
      label: `Zyzzogeton Answer ${i}-${j}`,
      aliases: [`Qwxv Alias ${i} ${j}`],
      prior: j < 22 ? 0.031415 : 0.004242,
    })),
  });
}
const FILES = SLUGS.map(leakFile);
const NEEDLES = [
  ...FILES.flatMap((f) =>
    f.answers.flatMap((a) => [a.label, ...a.aliases, normalise(a.aliases[0]!)]),
  ),
  "Zyzzogeton",
  "zyzzogeton",
  "Qwxv",
  "qwxv",
  "0.031415",
  "0.004242",
  "prior",
  "alias",
  "canonical",
  "answer",
  "judge",
];

const db = new pg.Client({ connectionString: DB_URL });
const PIDS = SLUGS.map(promptId);

async function asService(fn: () => Promise<unknown>): Promise<void> {
  await db.query("begin");
  await db.query("set local role service_role");
  try {
    await fn();
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function cleanup(): Promise<void> {
  await asService(async () => {
    await db.query("delete from public.daily_sets where date = any($1::date[])", [[TODAY, PAST]]);
    await db.query("delete from public.prompts where id = any($1::uuid[])", [PIDS]);
  });
}

/** Same column allowlist as supabaseDailyRepo, via SQL. */
function pgRepo() {
  return {
    async getSet(date: string) {
      const r = await db.query<{ prompt_ids: string[]; published_at: string | null }>(
        "select prompt_ids::text[] as prompt_ids, published_at::text as published_at from public.daily_sets where date = $1::date",
        [date],
      );
      return r.rows[0] ?? null;
    },
    async getPrompts(ids: readonly string[]) {
      const r = await db.query<{ id: string; text: string; category: string }>(
        "select id::text as id, text, category from public.prompts where id = any($1::uuid[])",
        [ids],
      );
      return r.rows;
    },
  };
}

beforeAll(async () => {
  if (!DB_URL) throw new Error("No DB URL: set SUPABASE_DB_URL or run `pnpm db:start`.");
  await db.connect();
  await cleanup();
  await applySeedPlan(db, buildSeedPlan(FILES));
  await asService(async () => {
    for (const d of [TODAY, PAST]) {
      await db.query(
        "insert into public.daily_sets (date, prompt_ids, published_at) values ($1::date, $2::uuid[], now())",
        [d, PIDS],
      );
    }
  });
});

afterAll(async () => {
  try {
    await cleanup();
  } finally {
    await db.end();
  }
});

function assertNoLeak(body: string): void {
  for (const needle of NEEDLES) expect(body, `response contains "${needle}"`).not.toContain(needle);
}

describe("seeded data really contains the secrets (so the leak test is meaningful)", () => {
  it("canonical answers, aliases and priors exist for every leak-test prompt", async () => {
    await db.query("begin");
    await db.query("set local role service_role");
    const r = await db.query<{ n: string; aliases: string; priors: string }>(
      `select count(*)::text as n,
              (select count(*) from public.aliases where prompt_id = any($1::uuid[]))::text as aliases,
              string_agg(distinct prior_p::text, ',') as priors
       from public.canonical_answers where prompt_id = any($1::uuid[])`,
      [PIDS],
    );
    await db.query("rollback");
    expect(Number(r.rows[0]?.n)).toBe(125);
    expect(Number(r.rows[0]?.aliases)).toBe(250);
    expect(r.rows[0]?.priors).toBe("0.004242,0.031415");
    expect(answerId(SLUGS[0]!, "Zyzzogeton Answer 0-0")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("leak test: endpoint logic over the real schema", () => {
  it("GET /api/daily body has the 5 prompts and none of the answer data", async () => {
    const { getDaily, toResponse } = await import("../../lib/server/daily");
    const res = toResponse(await getDaily(pgRepo(), NOON));
    expect(res.status).toBe(200);
    const body = await res.text();
    const json = JSON.parse(body) as { prompts: Array<{ id: string; text: string }> };
    expect(json.prompts.map((p) => p.id)).toEqual(PIDS);
    expect(json.prompts[0]?.text).toBe("Name a leak-test thing, set 0");
    assertNoLeak(body);
  });

  it("GET /api/daily/[date] for today and a past date leak nothing", async () => {
    const { getDaily, toResponse } = await import("../../lib/server/daily");
    for (const date of [TODAY, PAST]) {
      const res = toResponse(await getDaily(pgRepo(), NOON, date));
      expect(res.status).toBe(200);
      assertNoLeak(await res.text());
    }
  });
});

describe.runIf(apiEnabled)("leak test: real route handlers via the Supabase Data API", () => {
  beforeAll(() => {
    if (!API_URL || !SERVICE_KEY) throw new Error("Supabase API not found (or set RLS_DB_ONLY=1).");
    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    process.env.PLAY_TOKEN_SECRET ??= "x".repeat(44);
    process.env.ADMIN_PASSWORD ??= "test";
    vi.useFakeTimers({ now: NOON, toFake: ["Date"] });
  });
  afterAll(() => vi.useRealTimers());

  it("GET /api/daily and /api/daily/[date]", async () => {
    const today = await import("../../app/api/daily/route");
    const byDate = await import("../../app/api/daily/[date]/route");
    const responses = [
      await today.GET(),
      await byDate.GET(new Request("http://x"), { params: Promise.resolve({ date: TODAY }) }),
      await byDate.GET(new Request("http://x"), { params: Promise.resolve({ date: PAST }) }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(200);
      assertNoLeak(await res.text());
    }
    const future = await byDate.GET(new Request("http://x"), {
      params: Promise.resolve({ date: addDays(TODAY, 1) }),
    });
    expect(future.status).toBe(404);
  });
});

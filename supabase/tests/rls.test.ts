/**
 * RLS / privilege lockdown tests. Run with `pnpm test:rls` against a running
 * local Supabase (`pnpm db:start && pnpm db:reset`).
 *
 * Connection details come from env (SUPABASE_DB_URL, SUPABASE_API_URL,
 * SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) or, failing that, from
 * `supabase status -o env`.
 *
 * The table list is read from information_schema, so new tables are covered
 * automatically. Every table needs a fixture row (FIXTURES below) so that
 * "anon sees zero rows" is meaningful; the test fails if one is missing.
 *
 * RLS_DB_ONLY=1 explicitly skips the HTTP (PostgREST) layer, for environments
 * with Postgres but no Supabase API. It is never skipped silently.
 */
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Config = { dbUrl: string; apiUrl?: string; anonKey?: string; serviceKey?: string };

function loadConfig(): Config {
  const fromEnv: Partial<Config> = {
    dbUrl: process.env.SUPABASE_DB_URL,
    apiUrl: process.env.SUPABASE_API_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  let status: Record<string, string> = {};
  if (!fromEnv.dbUrl || (!process.env.RLS_DB_ONLY && !fromEnv.apiUrl)) {
    try {
      const out = execSync("pnpm exec supabase status -o env", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      status = Object.fromEntries(
        [...out.matchAll(/^([A-Z_]+)="?([^"\n]*)"?$/gm)].map((m) => [m[1] ?? "", m[2] ?? ""]),
      );
    } catch (e) {
      throw new Error(
        `Could not read local Supabase status. Is it running? Run \`pnpm db:start\` first.\n${String(e)}`,
      );
    }
  }
  const dbUrl = fromEnv.dbUrl ?? status.DB_URL;
  if (!dbUrl) throw new Error("No database URL: set SUPABASE_DB_URL or run `pnpm db:start`.");
  return {
    dbUrl,
    apiUrl: fromEnv.apiUrl ?? status.API_URL,
    anonKey: fromEnv.anonKey ?? status.ANON_KEY ?? status.PUBLISHABLE_KEY,
    serviceKey: fromEnv.serviceKey ?? status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
  };
}

const EXPECTED_TABLES = [
  "aliases",
  "answer_counts",
  "canonical_answers",
  "daily_sets",
  "judge_cache",
  "league_members",
  "leagues",
  "play_answers",
  "plays",
  "prompts",
  "streaks",
  "users",
];

// One row per table, inserted as service_role, in FK order. Fixed ids so cleanup is exact.
const P = "00000000-0000-4000-8000-0000000000a1";
const A = "00000000-0000-4000-8000-0000000000a2";
const U = "00000000-0000-4000-8000-0000000000a3";
const L = "00000000-0000-4000-8000-0000000000a4";
const PL = "00000000-0000-4000-8000-0000000000a5";
const D = "1999-01-01";
const FIXTURES = `
  insert into public.prompts (id, text, category) values ('${P}', 'rls fixture prompt', 'test');
  insert into public.canonical_answers (id, prompt_id, label, prior_p) values ('${A}', '${P}', 'fixture', 0.5);
  insert into public.aliases (answer_id, prompt_id, alias_norm, source) values ('${A}', '${P}', 'fixture', 'seed');
  insert into public.judge_cache (prompt_id, norm_string, verdict, reason, model) values ('${P}', 'fixture', 'valid', 'test', 'stub');
  insert into public.daily_sets (date, prompt_ids) values ('${D}', array['${P}','${P}','${P}','${P}','${P}']::uuid[]);
  insert into public.users (id, email) values ('${U}', 'rls-fixture@example.invalid');
  insert into public.streaks (subject_id, subject_type) values ('rls-fixture-device', 'device');
  insert into public.leagues (id, code, name, created_by) values ('${L}', 'RLSFIX01', 'fixture', 'rls-fixture-device');
  insert into public.league_members (league_id, member_id, display_name) values ('${L}', 'rls-fixture-device', 'fixture');
  insert into public.plays (id, device_id, date) values ('${PL}', 'rls-fixture-device', '${D}');
  insert into public.play_answers (play_id, prompt_id, raw, norm, matched_by, valid, reason) values ('${PL}', '${P}', 'x', 'x', 'none', false, 'fixture');
  insert into public.answer_counts (date, prompt_id, answer_id, c) values ('${D}', '${P}', '${A}', 1);
`;
const CLEANUP = `
  delete from public.answer_counts where date = '${D}';
  delete from public.plays where id = '${PL}';
  delete from public.leagues where id = '${L}';
  delete from public.streaks where subject_id = 'rls-fixture-device';
  delete from public.users where id = '${U}';
  delete from public.daily_sets where date = '${D}';
  delete from public.prompts where id = '${P}';
`;

const cfg = loadConfig();
const apiEnabled = !process.env.RLS_DB_ONLY;
const db = new pg.Client({ connectionString: cfg.dbUrl });
let tables: string[] = [];
const firstColumn = new Map<string, string>();

async function asServiceRole(sql: string): Promise<void> {
  await db.query("begin");
  try {
    await db.query("set local role service_role");
    await db.query(sql);
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function rowCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await db.query("begin");
  await db.query("set local role service_role");
  for (const t of tables) {
    const r = await db.query<{ n: string }>(`select count(*)::text as n from public."${t}"`);
    out[t] = Number(r.rows[0]?.n);
  }
  await db.query("rollback");
  return out;
}

beforeAll(async () => {
  await db.connect();
  const r = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  tables = r.rows.map((row) => row.table_name);
  const cols = await db.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and ordinal_position = 1`,
  );
  for (const c of cols.rows) firstColumn.set(c.table_name, c.column_name);
  await asServiceRole(CLEANUP);
  await asServiceRole(FIXTURES);
});

afterAll(async () => {
  try {
    await asServiceRole(CLEANUP);
  } finally {
    await db.end();
  }
});

describe("schema coverage", () => {
  it("finds every expected public table (and no surprises go untested)", () => {
    expect(tables).toEqual(expect.arrayContaining(EXPECTED_TABLES));
  });

  it("every public table has RLS enabled and forced", async () => {
    const r = await db.query<{ relname: string; on: boolean; forced: boolean }>(
      `select c.relname, c.relrowsecurity as on, c.relforcerowsecurity as forced
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')`,
    );
    expect(r.rows.length).toBe(tables.length);
    const bad = r.rows.filter((row) => !row.on || !row.forced).map((row) => row.relname);
    expect(bad, `tables missing enabled+forced RLS: ${bad.join(", ")}`).toEqual([]);
  });

  it("no RLS policies exist for anon, authenticated or public", async () => {
    const r = await db.query(
      `select tablename, policyname, roles from pg_policies
       where schemaname = 'public' and roles && array['anon','authenticated','public']::name[]`,
    );
    expect(r.rows).toEqual([]);
  });

  it("every table has a fixture row (so zero-row checks are meaningful)", async () => {
    const counts = await rowCounts();
    const empty = tables.filter((t) => (counts[t] ?? 0) < 1);
    expect(empty, `add a fixture in supabase/tests/rls.test.ts for: ${empty.join(", ")}`).toEqual(
      [],
    );
  });
});

describe("database roles", () => {
  for (const role of ["anon", "authenticated"] as const) {
    it(`${role} holds no privileges on any public table`, async () => {
      const r = await db.query<{ table_name: string }>(
        `select c.relname as table_name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and has_table_privilege($1, c.oid,
                 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,
        [role],
      );
      expect(r.rows.map((row) => row.table_name)).toEqual([]);
    });

    it(`${role}: select/insert/update/delete are denied on every table`, async () => {
      const failures: string[] = [];
      await db.query("begin");
      try {
        await db.query(`set local role ${role}`);
        for (const t of tables) {
          const col = firstColumn.get(t);
          const statements = {
            select: `select * from public."${t}" limit 1`,
            insert: `insert into public."${t}" default values`,
            update: `update public."${t}" set "${col}" = "${col}"`,
            delete: `delete from public."${t}"`,
          };
          for (const [op, sql] of Object.entries(statements)) {
            await db.query("savepoint s");
            try {
              await db.query(sql);
              failures.push(`${role} ${op} on ${t} succeeded`);
            } catch (e) {
              const code = (e as { code?: string }).code;
              if (code !== "42501")
                failures.push(`${role} ${op} on ${t}: unexpected error ${code}`);
            }
            await db.query("rollback to savepoint s");
          }
        }
      } finally {
        await db.query("rollback");
      }
      expect(failures).toEqual([]);
    });
  }

  it("service_role can select from every table and sees the fixtures", async () => {
    const counts = await rowCounts();
    for (const t of tables) expect(counts[t], t).toBeGreaterThanOrEqual(1);
  });
});

describe.runIf(apiEnabled)("Data API (PostgREST)", () => {
  let anon: SupabaseClient;
  let service: SupabaseClient;
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };

  beforeAll(() => {
    if (!cfg.apiUrl || !cfg.anonKey || !cfg.serviceKey) {
      throw new Error("API URL / anon key / service-role key not found (or set RLS_DB_ONLY=1).");
    }
    anon = createClient(cfg.apiUrl, cfg.anonKey, opts);
    service = createClient(cfg.apiUrl, cfg.serviceKey, opts);
  });

  it("anon key cannot read or write any table", async () => {
    const before = await rowCounts();
    const leaks: string[] = [];
    const leaked = (r: { error: unknown; data: unknown[] | null }) =>
      !r.error && (r.data?.length ?? 0) > 0;
    for (const t of tables) {
      const col = firstColumn.get(t) ?? "id";
      const sel = await anon.from(t).select("*");
      if (leaked(sel)) leaks.push(`select ${t} returned ${sel.data?.length} rows`);
      const ins = await anon.from(t).insert({}).select();
      if (leaked(ins)) leaks.push(`insert ${t} returned rows`);
      const upd = await anon
        .from(t)
        .update({ [col]: null })
        .not(col, "is", null)
        .select();
      if (leaked(upd)) leaks.push(`update ${t} affected rows`);
      const del = await anon.from(t).delete().not(col, "is", null).select();
      if (leaked(del)) leaks.push(`delete ${t} affected rows`);
    }
    expect(leaks).toEqual([]);
    expect(await rowCounts()).toEqual(before);
  });

  it("service-role key can select from every table", async () => {
    for (const t of tables) {
      const r = await service.from(t).select("*").limit(1);
      expect(r.error, `${t}: ${r.error?.message}`).toBeNull();
      expect(r.data?.length, t).toBe(1);
    }
  });
});

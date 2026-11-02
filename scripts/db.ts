/** Database helpers for CLI scripts (seed, daily:schedule, daily:check). */
import { execSync } from "node:child_process";
import pg from "pg";

/** SUPABASE_DB_URL, else the local stack's DB_URL from `supabase status`. */
export function dbUrl(): string {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  let out: string;
  try {
    out = execSync("pnpm exec supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("No DB URL: set SUPABASE_DB_URL or run `pnpm db:start`.");
  }
  const m = /^DB_URL="?([^"\n]+)"?$/m.exec(out);
  if (!m?.[1]) throw new Error("No DB URL: set SUPABASE_DB_URL or run `pnpm db:start`.");
  return m[1];
}

export async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: dbUrl() });
  await client.connect();
  return client;
}

/** Run `fn` in one transaction as service_role (RLS is forced on every table). */
export async function asServiceRole<T>(
  client: Pick<pg.Client, "query">,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    await client.query("set local role service_role");
    const result = await fn();
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}

/** Database reads/writes for daily scheduling. Prompt ids and categories only. */
import type pg from "pg";
import type { ExistingSet, PlannedSet, SchedulablePrompt } from "../lib/daily-schedule";
import { addDays } from "../lib/time";

type Queryable = Pick<pg.Client, "query">;

export async function loadApprovedPrompts(db: Queryable): Promise<SchedulablePrompt[]> {
  const r = await db.query<SchedulablePrompt>(
    `select id::text as id, category from public.prompts where status = 'approved' order by id`,
  );
  return r.rows;
}

/** Existing sets that can affect the reuse window for [from, from + days). */
export async function loadSetsAround(
  db: Queryable,
  from: string,
  days: number,
  reuseDays: number,
): Promise<ExistingSet[]> {
  const r = await db.query<{ date: string; prompt_ids: string[] }>(
    `select to_char(date, 'YYYY-MM-DD') as date, prompt_ids::text[] as prompt_ids
     from public.daily_sets where date between $1::date and $2::date order by date`,
    [addDays(from, -reuseDays), addDays(from, days + reuseDays)],
  );
  return r.rows.map((row) => ({ date: row.date, promptIds: row.prompt_ids }));
}

/**
 * Insert planned sets (published immediately). `on conflict do nothing` plus a
 * row-count check means an existing date is never altered; a concurrent insert
 * makes the whole transaction fail rather than silently overwrite.
 */
export async function insertPlannedSets(db: Queryable, sets: readonly PlannedSet[]): Promise<void> {
  for (const s of sets) {
    const r = await db.query(
      `insert into public.daily_sets (date, prompt_ids, published_at)
       values ($1::date, $2::uuid[], now()) on conflict (date) do nothing`,
      [s.date, s.promptIds],
    );
    if (r.rowCount !== 1) throw new Error(`daily set for ${s.date} already exists; not altered`);
  }
}

/** Dates in [from, to] that have a published set. */
export async function publishedDates(
  db: Queryable,
  from: string,
  to: string,
): Promise<Set<string>> {
  const r = await db.query<{ date: string }>(
    `select to_char(date, 'YYYY-MM-DD') as date from public.daily_sets
     where date between $1::date and $2::date and published_at is not null`,
    [from, to],
  );
  return new Set(r.rows.map((row) => row.date));
}

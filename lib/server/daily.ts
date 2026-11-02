import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brand } from "@/config/brand";
import { LAUNCH_DATE } from "@/config/game";
import {
  type DailyError,
  type DailyResponse,
  dailyErrorSchema,
  dailyResponseSchema,
} from "@/lib/daily-schema";
import {
  daysBetween,
  endOfGameDay,
  gameDate,
  gameNumber,
  isIsoDate,
  secondsUntilRollover,
} from "@/lib/time";
import { db } from "./db";

/**
 * Data access for the daily endpoints. Implementations must select ONLY the
 * listed columns (explicit allowlist, never `select *`).
 */
export interface DailyRepo {
  /** daily_sets: date, prompt_ids, published_at */
  getSet(date: string): Promise<{ prompt_ids: string[]; published_at: string | null } | null>;
  /** prompts: id, text, category */
  getPrompts(
    ids: readonly string[],
  ): Promise<Array<{ id: string; text: string; category: string }>>;
}

export const DAILY_SET_COLUMNS = "date,prompt_ids,published_at";
export const DAILY_PROMPT_COLUMNS = "id,text,category";

export function supabaseDailyRepo(client: Pick<SupabaseClient, "from"> = db()): DailyRepo {
  return {
    async getSet(date) {
      const { data, error } = await client
        .from("daily_sets")
        .select(DAILY_SET_COLUMNS)
        .eq("date", date)
        .maybeSingle<{ date: string; prompt_ids: string[]; published_at: string | null }>();
      if (error) throw new Error(`daily_sets read failed: ${error.message}`);
      return data ? { prompt_ids: data.prompt_ids, published_at: data.published_at } : null;
    },
    async getPrompts(ids) {
      const { data, error } = await client
        .from("prompts")
        .select(DAILY_PROMPT_COLUMNS)
        .in("id", [...ids])
        .returns<Array<{ id: string; text: string; category: string }>>();
      if (error) throw new Error(`prompts read failed: ${error.message}`);
      return data ?? [];
    },
  };
}

export type DailyResult =
  | { status: 200; body: DailyResponse; cacheControl: string }
  | { status: 400 | 404 | 503; body: DailyError; cacheControl: string };

/** Errors are never cached: a 404 for "tomorrow" must not outlive midnight. */
const NO_STORE = "no-store";
export const PAST_CACHE_CONTROL = "public, s-maxage=86400";

/** s-maxage = min(60, seconds until London midnight): stale data never crosses midnight. */
export function todayCacheControl(now: Date): string {
  const s = Math.min(60, secondsUntilRollover(now));
  return `public, s-maxage=${s}, stale-while-revalidate=0`;
}

function fail(status: 400 | 404 | 503, error: string): DailyResult {
  return { status, body: dailyErrorSchema.parse({ error }), cacheControl: NO_STORE };
}

/**
 * Today's set (requestedDate undefined) or a specific London date.
 *  - invalid date → 400; future date → 404 (no peeking); before launch → 404
 *    (today before launch → 503 notLaunched)
 *  - today with no published set, or a set whose prompts are missing → 503 + error log
 *  - past date with no set → 404
 */
export async function getDaily(
  repo: DailyRepo,
  now: Date,
  requestedDate?: string,
  log: (msg: string) => void = (m) => console.error(m),
): Promise<DailyResult> {
  const today = gameDate(now);
  const date = requestedDate ?? today;
  if (!isIsoDate(date)) return fail(400, brand.strings.badDate);
  const offset = daysBetween(today, date);
  if (offset > 0) return fail(404, brand.strings.dayNotFound);
  const isToday = offset === 0;
  if (daysBetween(LAUNCH_DATE, date) < 0) {
    return isToday ? fail(503, brand.strings.notLaunched) : fail(404, brand.strings.dayNotFound);
  }

  let set: Awaited<ReturnType<DailyRepo["getSet"]>>;
  let rows: Awaited<ReturnType<DailyRepo["getPrompts"]>> = [];
  try {
    set = await repo.getSet(date);
    if (set?.published_at) rows = await repo.getPrompts(set.prompt_ids);
  } catch (e) {
    log(`[daily] ${date}: ${(e as Error).message}`);
    return fail(503, brand.strings.dailyUnavailable);
  }

  if (!set || !set.published_at) {
    if (!isToday) return fail(404, brand.strings.dayNotFound);
    log(`[daily] no published daily set for today (${date})`);
    return fail(503, brand.strings.dailyUnavailable);
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const missing = set.prompt_ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    log(`[daily] set ${date} references missing prompts: ${missing.join(", ")}`);
    return fail(503, brand.strings.dailyUnavailable);
  }

  // Built field by field from the allowlist; strict schema rejects anything else.
  const parsed = dailyResponseSchema.safeParse({
    date,
    gameNumber: gameNumber(date),
    closesAt: endOfGameDay(date).toISOString(),
    prompts: set.prompt_ids.map((id, i) => {
      const r = byId.get(id)!;
      return { id: r.id, text: r.text, category: r.category, position: i + 1 };
    }),
  });
  if (!parsed.success) {
    log(`[daily] set ${date} failed response validation: ${parsed.error.message}`);
    return fail(503, brand.strings.dailyUnavailable);
  }
  return {
    status: 200,
    body: parsed.data,
    cacheControl: isToday ? todayCacheControl(now) : PAST_CACHE_CONTROL,
  };
}

export function toResponse(result: DailyResult): Response {
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": result.cacheControl },
  });
}

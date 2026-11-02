/**
 * Daily set planning (PLAN item 4). Pure and deterministic: the same prompts,
 * existing sets, options and seed always give the same plan. Holds only
 * prompt ids and categories (no answer data). Used by scripts/daily-schedule.ts.
 *
 * Rules:
 *  - never plans a date that already has a set (existing sets are never touched)
 *  - never plans a date before London "today"
 *  - 5 approved prompts per day; at most 1 per category when 5+ categories are
 *    eligible that day, otherwise at most 2
 *  - a prompt is not reused within `reuseDays` of any other use (past, future,
 *    or planned earlier in the same run)
 *  - fails loudly (ScheduleError naming the date and reason) if a day can't be filled
 */
import { createHash } from "node:crypto";
import { DAILY_REUSE_DAYS, PROMPTS_PER_DAY } from "@/config/game";
import { addDays, daysBetween, isIsoDate } from "@/lib/time";

export type SchedulablePrompt = { readonly id: string; readonly category: string };
export type ExistingSet = { readonly date: string; readonly promptIds: readonly string[] };
export type PlannedSet = { readonly date: string; readonly promptIds: string[] };

export type ScheduleOptions = {
  readonly from: string;
  readonly days: number;
  /** London game date "now" (lib/time gameDate). */
  readonly today: string;
  readonly seed: string;
  readonly reuseDays?: number;
};

export type SchedulePlan = { planned: PlannedSet[]; alreadySet: string[] };

export class ScheduleError extends Error {
  override name = "ScheduleError";
  constructor(
    readonly date: string,
    readonly reason: string,
  ) {
    super(`Cannot schedule ${date}: ${reason}`);
  }
}

function rank(seed: string, date: string, id: string): string {
  return createHash("sha256").update(`${seed}|${date}|${id}`).digest("hex");
}

export function planSchedule(
  prompts: readonly SchedulablePrompt[],
  existing: readonly ExistingSet[],
  opts: ScheduleOptions,
): SchedulePlan {
  const reuseDays = opts.reuseDays ?? DAILY_REUSE_DAYS;
  if (!isIsoDate(opts.from)) throw new ScheduleError(opts.from, "--from must be YYYY-MM-DD");
  if (!Number.isInteger(opts.days) || opts.days < 1 || opts.days > 366) {
    throw new ScheduleError(opts.from, `--days must be an integer from 1 to 366, got ${opts.days}`);
  }
  if (daysBetween(opts.today, opts.from) < 0) {
    throw new ScheduleError(
      opts.from,
      `it is before London today (${opts.today}); past days are never scheduled`,
    );
  }
  const ids = new Set<string>();
  for (const p of prompts) {
    if (ids.has(p.id)) throw new ScheduleError(opts.from, `duplicate prompt id ${p.id}`);
    ids.add(p.id);
  }

  const setDates = new Set(existing.map((s) => s.date));
  const uses = new Map<string, string[]>();
  const recordUse = (id: string, date: string) => uses.set(id, [...(uses.get(id) ?? []), date]);
  for (const s of existing) for (const id of s.promptIds) recordUse(id, s.date);

  const plan: SchedulePlan = { planned: [], alreadySet: [] };

  for (let i = 0; i < opts.days; i++) {
    const date = addDays(opts.from, i);
    if (setDates.has(date)) {
      plan.alreadySet.push(date);
      continue;
    }

    const eligible = prompts.filter((p) =>
      (uses.get(p.id) ?? []).every((used) => Math.abs(daysBetween(used, date)) >= reuseDays),
    );
    const categories = new Set(eligible.map((p) => p.category));
    const perCategoryCap = categories.size >= PROMPTS_PER_DAY ? 1 : 2;

    const ordered = [...eligible].sort((a, b) =>
      rank(opts.seed, date, a.id).localeCompare(rank(opts.seed, date, b.id)),
    );
    const picked: SchedulablePrompt[] = [];
    const perCategory = new Map<string, number>();
    for (const p of ordered) {
      if (picked.length === PROMPTS_PER_DAY) break;
      const n = perCategory.get(p.category) ?? 0;
      if (n >= perCategoryCap) continue;
      perCategory.set(p.category, n + 1);
      picked.push(p);
    }

    if (picked.length < PROMPTS_PER_DAY) {
      throw new ScheduleError(
        date,
        `only ${picked.length} of ${PROMPTS_PER_DAY} prompts could be picked: ` +
          `${eligible.length} approved prompts are outside the ${reuseDays}-day reuse window, ` +
          `across ${categories.size} categories (max ${perCategoryCap} per category). ` +
          `Approve more prompts or shorten the reuse window.`,
      );
    }

    const promptIds = picked.map((p) => p.id);
    for (const id of promptIds) recordUse(id, date);
    plan.planned.push({ date, promptIds });
  }
  return plan;
}

/** London dates in [today, today + days) that have no published set. */
export function missingDates(
  published: ReadonlySet<string>,
  today: string,
  days: number,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    if (!published.has(d)) out.push(d);
  }
  return out;
}

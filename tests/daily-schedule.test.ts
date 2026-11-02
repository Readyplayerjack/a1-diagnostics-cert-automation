import { describe, expect, it } from "vitest";
import { DAILY_REUSE_DAYS } from "@/config/game";
import {
  missingDates,
  planSchedule,
  ScheduleError,
  type ExistingSet,
  type SchedulablePrompt,
} from "@/lib/daily-schedule";
import { addDays, daysBetween } from "@/lib/time";
import { fakeApprovedPrompts } from "./fixtures/daily-prompts";

const TODAY = "2027-03-01";
const prompts = fakeApprovedPrompts(); // 42 across 6 categories
const categoryOf = new Map(prompts.map((p) => [p.id, p.category]));
const base = { from: TODAY, days: 8, today: TODAY, seed: "test" };

function assertReuse(sets: Array<{ date: string; promptIds: readonly string[] }>, window: number) {
  const seen = new Map<string, string>();
  for (const s of [...sets].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const id of s.promptIds) {
      const prev = seen.get(id);
      if (prev) expect(daysBetween(prev, s.date), `${id} reused`).toBeGreaterThanOrEqual(window);
      seen.set(id, s.date);
    }
  }
}

describe("planSchedule", () => {
  it("fills every requested day with 5 distinct prompts", () => {
    const plan = planSchedule(prompts, [], base);
    expect(plan.planned.map((s) => s.date)).toEqual(
      Array.from({ length: 8 }, (_, i) => addDays(TODAY, i)),
    );
    for (const s of plan.planned) {
      expect(s.promptIds).toHaveLength(5);
      expect(new Set(s.promptIds).size).toBe(5);
    }
  });

  it("is deterministic for the same inputs and seed, regardless of input order", () => {
    const a = planSchedule(prompts, [], base);
    const b = planSchedule([...prompts].reverse(), [], base);
    expect(b).toEqual(a);
    expect(planSchedule(prompts, [], { ...base, seed: "other" })).not.toEqual(a);
  });

  it("uses at most 1 prompt per category when 5+ categories are eligible", () => {
    for (const s of planSchedule(prompts, [], base).planned) {
      const cats = s.promptIds.map((id) => categoryOf.get(id));
      expect(new Set(cats).size).toBe(5);
    }
  });

  it("allows at most 2 per category when fewer than 5 categories are eligible", () => {
    const three = prompts.filter((p) => ["sport", "places", "tv_radio"].includes(p.category));
    const plan = planSchedule(three, [], { ...base, days: 3 });
    for (const s of plan.planned) {
      const counts = new Map<string, number>();
      for (const id of s.promptIds) {
        const c = categoryOf.get(id)!;
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    }
  });

  it("never reuses a prompt within 60 days (42 prompts → exactly 8 full days, then fails loudly)", () => {
    // 42 prompts / 5 per day = 8 days of fresh prompts. With 1-per-category,
    // 7 per category x 6 categories also allows 8 days (each day skips one category).
    const plan = planSchedule(prompts, [], base);
    assertReuse(plan.planned, DAILY_REUSE_DAYS);
    expect(() => planSchedule(prompts, [], { ...base, days: 9 })).toThrow(ScheduleError);
    try {
      planSchedule(prompts, [], { ...base, days: 9 });
    } catch (e) {
      expect(e).toBeInstanceOf(ScheduleError);
      expect((e as ScheduleError).date).toBe(addDays(TODAY, 8));
      expect((e as ScheduleError).message).toMatch(
        /Cannot schedule 2027-03-09: only \d of 5 prompts/,
      );
    }
  });

  it("allows reuse once the window has passed (configurable)", () => {
    const plan = planSchedule(prompts, [], { ...base, days: 30, reuseDays: 8 });
    expect(plan.planned).toHaveLength(30);
    assertReuse(plan.planned, 8);
  });

  it("counts existing past AND future sets in the reuse window", () => {
    const [p0, p1, p2, p3, p4] = prompts as [SchedulablePrompt, ...SchedulablePrompt[]];
    const ids = [p0, p1!, p2!, p3!, p4!].map((p) => p.id);
    const existing: ExistingSet[] = [
      { date: addDays(TODAY, -59), promptIds: ids.slice(0, 2) },
      { date: addDays(TODAY, 40), promptIds: ids.slice(2, 5) },
    ];
    const plan = planSchedule(prompts, existing, { ...base, days: 3 });
    const used = new Set(plan.planned.flatMap((s) => s.promptIds));
    for (const id of ids) expect(used.has(id)).toBe(false);
  });

  it("never touches dates that already have a set", () => {
    const existing: ExistingSet[] = [
      { date: TODAY, promptIds: ["a", "b", "c", "d", "e"] },
      { date: addDays(TODAY, 2), promptIds: ["f", "g", "h", "i", "j"] },
    ];
    const plan = planSchedule(prompts, existing, { ...base, days: 4 });
    expect(plan.alreadySet).toEqual([TODAY, addDays(TODAY, 2)]);
    expect(plan.planned.map((s) => s.date)).toEqual([addDays(TODAY, 1), addDays(TODAY, 3)]);
  });

  it("refuses past dates and bad options, naming the date", () => {
    expect(() => planSchedule(prompts, [], { ...base, from: addDays(TODAY, -1) })).toThrow(
      /Cannot schedule 2027-02-28: it is before London today/,
    );
    expect(() => planSchedule(prompts, [], { ...base, from: "2027-02-30" })).toThrow(ScheduleError);
    expect(() => planSchedule(prompts, [], { ...base, days: 0 })).toThrow(/--days/);
    expect(() => planSchedule([prompts[0]!, prompts[0]!], [], base)).toThrow(/duplicate prompt id/);
  });

  it("fails loudly when there are too few prompts", () => {
    expect(() => planSchedule(prompts.slice(0, 4), [], base)).toThrow(
      /Cannot schedule 2027-03-01: only \d of 5 prompts could be picked/,
    );
  });
});

describe("missingDates", () => {
  it("lists unpublished days in [today, today + n)", () => {
    const published = new Set([TODAY, addDays(TODAY, 1), addDays(TODAY, 3)]);
    expect(missingDates(published, TODAY, 5)).toEqual([addDays(TODAY, 2), addDays(TODAY, 4)]);
    expect(missingDates(published, TODAY, 2)).toEqual([]);
  });
});

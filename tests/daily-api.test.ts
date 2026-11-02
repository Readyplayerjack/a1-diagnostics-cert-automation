import { describe, expect, it, vi } from "vitest";
import { brand } from "@/config/brand";
import { LAUNCH_DATE } from "@/config/game";
import { uuidV5 } from "@/lib/content/ids";
import { dailyResponseSchema } from "@/lib/daily-schema";
import {
  type DailyRepo,
  DAILY_PROMPT_COLUMNS,
  DAILY_SET_COLUMNS,
  getDaily,
  PAST_CACHE_CONTROL,
  supabaseDailyRepo,
  todayCacheControl,
  toResponse,
} from "@/lib/server/daily";
import { addDays } from "@/lib/time";

const TODAY = "2027-03-28"; // spring-forward day: 23 h long, ends 2027-03-28T23:00Z
const NOON = new Date("2027-03-28T12:00:00Z");
const ids = Array.from({ length: 5 }, (_, i) => uuidV5(`daily-test:${i}`));
const cats = ["food_drink", "places", "tv_radio", "sport", "everyday_britain"];

type Row = Record<string, unknown> & { id: string; text: string; category: string };

function fakeRepo(
  sets: Record<string, { prompt_ids: string[]; published_at: string | null }>,
  rows: Row[],
): DailyRepo & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getSet(date) {
      calls.push(`set:${date}`);
      return sets[date] ?? null;
    },
    async getPrompts(wanted) {
      calls.push(`prompts:${wanted.length}`);
      return rows.filter((r) => wanted.includes(r.id)) as Array<{
        id: string;
        text: string;
        category: string;
      }>;
    },
  };
}

const ROWS: Row[] = ids.map((id, i) => ({
  id,
  text: `Name thing number ${i + 1}`,
  category: cats[i]!,
}));
const published = { prompt_ids: ids, published_at: "2027-03-01T00:00:00Z" };
const repo = () =>
  fakeRepo(
    { [TODAY]: published, [addDays(TODAY, -1)]: published, [addDays(TODAY, 1)]: published },
    ROWS,
  );
const silent = () => undefined;

describe("GET /api/daily (today)", () => {
  it("returns today's set in position order with closesAt = next London midnight", async () => {
    const r = await getDaily(repo(), NOON, undefined, silent);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      date: TODAY,
      gameNumber: 84, // 2027-01-04 is #1
      closesAt: "2027-03-28T23:00:00.000Z",
      prompts: ids.map((id, i) => ({
        id,
        text: `Name thing number ${i + 1}`,
        category: cats[i],
        position: i + 1,
      })),
    });
    expect(dailyResponseSchema.parse(r.body)).toEqual(r.body);
  });

  it.each([
    ["2027-03-28T12:00:00Z", "public, s-maxage=60, stale-while-revalidate=0"],
    ["2027-03-28T22:59:30Z", "public, s-maxage=30, stale-while-revalidate=0"], // 23:59:30 BST
    ["2027-03-28T22:59:59.900Z", "public, s-maxage=0, stale-while-revalidate=0"],
    ["2027-01-15T23:59:15Z", "public, s-maxage=45, stale-while-revalidate=0"], // GMT
  ])("Cache-Control at %s is %s", (iso, header) => {
    expect(todayCacheControl(new Date(iso))).toBe(header);
  });

  it("503 with a brand string (and an error log) when today has no set", async () => {
    const log = vi.fn();
    const r = await getDaily(fakeRepo({}, ROWS), NOON, undefined, log);
    expect(r).toEqual({
      status: 503,
      body: { error: brand.strings.dailyUnavailable },
      cacheControl: "no-store",
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("no published daily set for today (2027-03-28)"),
    );
  });

  it("503 when today's set is unpublished, references a missing prompt, or the repo throws", async () => {
    const unpublished = fakeRepo({ [TODAY]: { ...published, published_at: null } }, ROWS);
    expect((await getDaily(unpublished, NOON, undefined, silent)).status).toBe(503);
    const missing = fakeRepo({ [TODAY]: published }, ROWS.slice(0, 4));
    expect((await getDaily(missing, NOON, undefined, silent)).status).toBe(503);
    const broken: DailyRepo = {
      getSet: () => Promise.reject(new Error("db down")),
      getPrompts: () => Promise.resolve([]),
    };
    const log = vi.fn();
    expect((await getDaily(broken, NOON, undefined, log)).status).toBe(503);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("db down"));
  });

  it("503 notLaunched before LAUNCH_DATE", async () => {
    const r = await getDaily(
      repo(),
      new Date(`${addDays(LAUNCH_DATE, -1)}T12:00:00Z`),
      undefined,
      silent,
    );
    expect(r).toMatchObject({ status: 503, body: { error: brand.strings.notLaunched } });
  });
});

describe("GET /api/daily/[date]", () => {
  it("past dates: 200 with a 24 h CDN cache", async () => {
    const r = await getDaily(repo(), NOON, addDays(TODAY, -1), silent);
    expect(r.status).toBe(200);
    expect(r.cacheControl).toBe(PAST_CACHE_CONTROL);
    expect(r.body).toMatchObject({
      date: addDays(TODAY, -1),
      gameNumber: 83,
      closesAt: "2027-03-28T00:00:00.000Z",
    });
  });

  it("today behaves like /api/daily", async () => {
    expect(await getDaily(repo(), NOON, TODAY, silent)).toEqual(
      await getDaily(repo(), NOON, undefined, silent),
    );
  });

  it("future dates: 404 even when a set exists (no peeking), without reading the DB", async () => {
    const r1 = repo();
    const r = await getDaily(r1, NOON, addDays(TODAY, 1), silent);
    expect(r).toEqual({
      status: 404,
      body: { error: brand.strings.dayNotFound },
      cacheControl: "no-store",
    });
    expect(r1.calls).toEqual([]);
  });

  it("rolls over exactly at London midnight", async () => {
    const before = await getDaily(
      repo(),
      new Date("2027-03-28T22:59:59.999Z"),
      addDays(TODAY, 1),
      silent,
    );
    const after = await getDaily(
      repo(),
      new Date("2027-03-28T23:00:00.000Z"),
      addDays(TODAY, 1),
      silent,
    );
    expect(before.status).toBe(404);
    expect(after.status).toBe(200);
  });

  it.each(["2027-02-30", "today", "2027-3-1", "", "../../etc/passwd", "2027-03-28T00:00"])(
    "invalid date %j → 400",
    async (d) => {
      const r = await getDaily(repo(), NOON, d, silent);
      expect(r).toEqual({
        status: 400,
        body: { error: brand.strings.badDate },
        cacheControl: "no-store",
      });
    },
  );

  it("past dates with no set, or before launch → 404", async () => {
    expect((await getDaily(fakeRepo({}, ROWS), NOON, addDays(TODAY, -5), silent)).status).toBe(404);
    expect((await getDaily(repo(), NOON, addDays(LAUNCH_DATE, -1), silent)).status).toBe(404);
  });
});

describe("no answer leakage", () => {
  it("extra columns returned by a repo never reach the response", async () => {
    const leaky = ROWS.map((r) => ({
      ...r,
      answers: ["SECRET-ANSWER"],
      prior_p: 0.123456,
      aliases: ["secret alias"],
      status: "approved",
    }));
    const r = await getDaily(fakeRepo({ [TODAY]: published }, leaky), NOON, undefined, silent);
    expect(r.status).toBe(200);
    const body = await toResponse(r).text();
    for (const needle of [
      "SECRET-ANSWER",
      "0.123456",
      "secret alias",
      "prior",
      "alias",
      "answers",
      "status",
    ]) {
      expect(body).not.toContain(needle);
    }
  });

  it("the strict schema throws on unknown keys", () => {
    const ok = {
      date: TODAY,
      gameNumber: 1,
      closesAt: "2027-03-28T23:00:00.000Z",
      prompts: ids.map((id, i) => ({ id, text: "x", category: "sport", position: i + 1 })),
    };
    expect(() => dailyResponseSchema.parse(ok)).not.toThrow();
    expect(() => dailyResponseSchema.parse({ ...ok, answers: [] })).toThrow();
    expect(() =>
      dailyResponseSchema.parse({ ...ok, prompts: ok.prompts.map((p) => ({ ...p, prior: 0.1 })) }),
    ).toThrow();
  });

  it("the Supabase repo selects only the allowlisted columns", async () => {
    const selects: Array<[string, string]> = [];
    const chain = (table: string) => {
      const q = {
        select: (cols: string) => (selects.push([table, cols]), q),
        eq: () => q,
        in: () => q,
        maybeSingle: () => Promise.resolve({ data: { date: TODAY, ...published }, error: null }),
        returns: () => Promise.resolve({ data: ROWS, error: null }),
      };
      return q;
    };
    const client = { from: chain } as unknown as Parameters<typeof supabaseDailyRepo>[0];
    const r = await getDaily(supabaseDailyRepo(client), NOON, undefined, silent);
    expect(r.status).toBe(200);
    expect(selects).toEqual([
      ["daily_sets", "date,prompt_ids,published_at"],
      ["prompts", "id,text,category"],
    ]);
    expect(DAILY_SET_COLUMNS).not.toContain("*");
    expect(DAILY_PROMPT_COLUMNS).toBe("id,text,category");
  });
});

describe("toResponse", () => {
  it("sets status, JSON body and Cache-Control", async () => {
    const res = toResponse(await getDaily(repo(), NOON, undefined, silent));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60, stale-while-revalidate=0");
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Vary")).toBeNull();
  });
});

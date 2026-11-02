import { connection } from "next/server";
import { getDaily, supabaseDailyRepo, toResponse } from "@/lib/server/daily";

/** GET /api/daily/YYYY-MM-DD: past (long cache), today, future (404), invalid (400). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ date: string }> },
): Promise<Response> {
  await connection();
  const { date } = await ctx.params;
  return toResponse(await getDaily(supabaseDailyRepo(), new Date(), date));
}

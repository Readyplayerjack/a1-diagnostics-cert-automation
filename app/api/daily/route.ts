import { connection } from "next/server";
import { getDaily, supabaseDailyRepo, toResponse } from "@/lib/server/daily";

/** GET /api/daily: today's (Europe/London) prompts. Logic: lib/server/daily.ts. */
export async function GET(): Promise<Response> {
  await connection(); // request-time only: the result depends on the clock
  return toResponse(await getDaily(supabaseDailyRepo(), new Date()));
}

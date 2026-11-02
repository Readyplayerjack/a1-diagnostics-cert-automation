/**
 * Public shape of GET /api/daily and /api/daily/[date]. Client-safe.
 * Strict: unknown keys throw, so nothing extra (answers, aliases, priors,
 * counts, judge data) can ride along by accident.
 */
import { z } from "zod";
import { CATEGORY_KEYS, PROMPTS_PER_DAY } from "@/config/game";

export const dailyPromptSchema = z.strictObject({
  id: z.uuid(),
  text: z.string().min(1),
  category: z.enum(CATEGORY_KEYS),
  position: z.number().int().min(1).max(PROMPTS_PER_DAY),
});

export const dailyResponseSchema = z.strictObject({
  date: z.iso.date(),
  gameNumber: z.number().int().min(1),
  closesAt: z.iso.datetime(),
  prompts: z.array(dailyPromptSchema).length(PROMPTS_PER_DAY),
});

export type DailyResponse = z.infer<typeof dailyResponseSchema>;

export const dailyErrorSchema = z.strictObject({ error: z.string().min(1) });
export type DailyError = z.infer<typeof dailyErrorSchema>;

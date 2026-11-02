import { CATEGORY_KEYS } from "@/config/game";
import { uuidV5 } from "@/lib/content/ids";
import type { SchedulablePrompt } from "@/lib/daily-schedule";

/** 42 fake approved prompts: 7 in each of the 6 categories. Not real content. */
export function fakeApprovedPrompts(perCategory = 7): SchedulablePrompt[] {
  return CATEGORY_KEYS.flatMap((category) =>
    Array.from({ length: perCategory }, (_, i) => ({
      id: uuidV5(`fixture-prompt:${category}:${i}`),
      category,
    })),
  );
}

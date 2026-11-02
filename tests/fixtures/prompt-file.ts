import type { PromptFile } from "@/lib/content/schema";

/** A synthetic, schema-valid prompt file. Not real content. */
export function makePromptFile(overrides: Partial<PromptFile> = {}): PromptFile {
  // 22 × 0.03 + 3 long shots × 0.005 = 0.675 (≤ 0.9)
  const answers = Array.from({ length: 25 }, (_, i) => ({
    label: `Fixture answer ${i + 1}`,
    prior: i < 22 ? 0.03 : 0.005,
    prior_source: "manual" as const,
    aliases: [] as string[],
  }));
  return {
    slug: "fixture-prompt",
    text: "Name a fixture used only in tests",
    category: "everyday_britain",
    region: "GB",
    status: "draft",
    sources: [
      {
        name: "Wikidata",
        url: "https://www.wikidata.org/",
        licence: "CC0-1.0",
        retrieved: "2026-11-02",
      },
    ],
    answers,
    ...overrides,
  };
}

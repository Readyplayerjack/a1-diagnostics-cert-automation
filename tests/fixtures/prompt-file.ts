import type { PromptFile } from "@/lib/content/schema";

/** A synthetic, schema-valid prompt file. Not real content. */
export function makePromptFile(overrides: Partial<PromptFile> = {}): PromptFile {
  const answers = Array.from({ length: 20 }, (_, i) => ({
    label: `Fixture answer ${i + 1}`,
    prior: 0.04,
    aliases: [] as string[],
  }));
  return {
    slug: "fixture-prompt",
    text: "Name a fixture used only in tests",
    category: "test",
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

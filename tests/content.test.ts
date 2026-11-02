import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { answerId, promptId, uuidV5 } from "@/lib/content/ids";
import { CONTENT_RULES, validatePromptFile } from "@/lib/content/schema";
import { buildSeedPlan } from "@/lib/content/seed-plan";
import { loadPromptFiles } from "../scripts/content-files";
import { makePromptFile } from "./fixtures/prompt-file";

describe("uuidV5", () => {
  it("matches the RFC reference vector (DNS namespace, www.example.com)", () => {
    expect(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });

  it("is deterministic and distinguishes prompts and answers", () => {
    expect(promptId("a")).toBe(promptId("a"));
    expect(promptId("a")).not.toBe(promptId("b"));
    expect(answerId("a", "X")).not.toBe(answerId("b", "X"));
    expect(promptId("a")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("validatePromptFile", () => {
  it("accepts the fixture", () => {
    expect(validatePromptFile(makePromptFile())).toMatchObject({ ok: true });
  });

  const reject = (file: unknown, pattern: RegExp) => {
    const r = validatePromptFile(file);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(pattern);
  };

  it("rejects too few answers", () => {
    reject(
      makePromptFile({ answers: makePromptFile().answers.slice(0, 5) }),
      /at least 20 answers/,
    );
  });

  it("rejects one obvious answer (hard rule 9)", () => {
    const answers = makePromptFile().answers.map((a, i) =>
      i === 0 ? { ...a, prior: 0.5 } : { ...a, prior: 0.01 },
    );
    reject(makePromptFile({ answers }), /one obvious answer/);
  });

  it("rejects priors summing above 1", () => {
    const answers = makePromptFile().answers.map((a) => ({ ...a, prior: 0.06 }));
    reject(makePromptFile({ answers }), /priors sum to 1\.2/);
  });

  it("rejects aliases that collide after normalisation, across answers", () => {
    const answers = makePromptFile().answers.map((a, i) =>
      i === 1 ? { ...a, aliases: ["FIXTURE-ANSWER 1"] } : a,
    );
    reject(makePromptFile({ answers }), /already used by answer #0/);
  });

  it("allows an answer's own aliases to normalise to its label", () => {
    const answers = makePromptFile().answers.map((a, i) =>
      i === 0 ? { ...a, aliases: ["fixture answer 1!", "Fixture Answers 1"] } : a,
    );
    expect(validatePromptFile(makePromptFile({ answers })).ok).toBe(true);
  });

  it("rejects duplicate labels and empty normal forms", () => {
    const dup = makePromptFile().answers.map((a, i) =>
      i === 1 ? { ...a, label: "Fixture answer 1" } : a,
    );
    reject(makePromptFile({ answers: dup }), /duplicate label/);
    const empty = makePromptFile().answers.map((a, i) =>
      i === 0 ? { ...a, aliases: ["!!!"] } : a,
    );
    reject(makePromptFile({ answers: empty }), /normalises to nothing/);
  });

  it("requires a review record for approved prompts", () => {
    reject(makePromptFile({ status: "approved" }), /must record a review/);
    expect(
      validatePromptFile(
        makePromptFile({ status: "approved", review: { reviewer: "owner", date: "2026-11-02" } }),
      ).ok,
    ).toBe(true);
  });

  it("requires attribution for CC BY-SA sources", () => {
    reject(
      makePromptFile({
        sources: [
          {
            name: "Wikipedia",
            url: "https://en.wikipedia.org/",
            licence: "CC-BY-SA-4.0",
            retrieved: "2026-11-02",
          },
        ],
      }),
      /attribution/,
    );
  });

  it("rejects bad slugs, long prompt text, unknown licences and bad QIDs", () => {
    reject(makePromptFile({ slug: "Bad Slug" }), /kebab-case/);
    reject(makePromptFile({ text: "x".repeat(CONTENT_RULES.maxPromptChars + 1) }), /text/);
    reject(
      {
        ...makePromptFile(),
        sources: [{ name: "x", url: "https://x.test", licence: "MIT", retrieved: "2026-11-02" }],
      },
      /licence/,
    );
    const answers = makePromptFile().answers.map((a, i) =>
      i === 0 ? { ...a, wikidata_qid: "42" } : a,
    );
    reject(makePromptFile({ answers }), /wikidata_qid/);
  });
});

describe("buildSeedPlan", () => {
  it("produces deterministic rows with normalised, de-duplicated aliases", () => {
    const answers = makePromptFile().answers.map((a, i) =>
      i === 0 ? { ...a, aliases: ["FIXTURE ANSWER 1", "Fixture-Answers 1"] } : a,
    );
    const file = makePromptFile({ answers });
    const plan = buildSeedPlan([file]);
    expect(plan.prompts).toEqual([
      {
        id: promptId("fixture-prompt"),
        text: file.text,
        category: "test",
        region: "GB",
        status: "draft",
      },
    ]);
    expect(plan.answers).toHaveLength(20);
    expect(plan.answers[0]).toEqual({
      id: answerId("fixture-prompt", "Fixture answer 1"),
      prompt_id: promptId("fixture-prompt"),
      label: "Fixture answer 1",
      wikidata_qid: null,
      prior_p: 0.04,
    });
    // label + 2 aliases all normalise to "fixture answer 1" → one alias row
    expect(plan.aliases.filter((a) => a.answer_id === plan.answers[0]?.id)).toEqual([
      {
        answer_id: plan.answers[0]?.id,
        prompt_id: promptId("fixture-prompt"),
        alias_norm: "fixture answer 1",
      },
    ]);
    expect(buildSeedPlan([file])).toEqual(plan);
  });

  it("rejects duplicate slugs", () => {
    expect(() => buildSeedPlan([makePromptFile(), makePromptFile()])).toThrow(
      /duplicate prompt slug/,
    );
  });
});

describe("content files in /content/prompts", () => {
  it("are all valid", () => {
    expect(loadPromptFiles().errors).toEqual([]);
  });
});

describe("answer-leak guard (hard rule 2)", () => {
  const ROOT = join(__dirname, "..");
  const walk = (dir: string): string[] => {
    try {
      return readdirSync(dir).flatMap((e) => {
        const full = join(dir, e);
        return statSync(full).isDirectory()
          ? walk(full)
          : /\.(ts|tsx|js|jsx|mjs)$/.test(e)
            ? [full]
            : [];
      });
    } catch {
      return [];
    }
  };

  it("client-facing code never imports /content or lib/content", () => {
    const offenders = ["app", "components"]
      .flatMap((d) => walk(join(ROOT, d)))
      .filter((f) =>
        /from\s+["'](?:@\/|\.\.?\/)+(?:\.\.\/)*(?:content|lib\/content)\b/.test(
          readFileSync(f, "utf8"),
        ),
      )
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});

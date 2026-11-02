/**
 * Prompt content file format (/content/prompts/<slug>.json) and its rules.
 * PROVISIONAL: thresholds below await the PM's content brief (PLAN item 3).
 *
 * This module holds no answer data itself, but the files it validates do:
 * never import /content from /app or /components (enforced by a test).
 */
import { z } from "zod";
import { normalise } from "../normalise";

export const CONTENT_RULES = {
  /** A prompt needs many plausible answers (hard rule 9). */
  minAnswers: 20,
  /** No single "obvious" answer may dominate (hard rule 9). */
  maxSinglePrior: 0.35,
  maxPromptChars: 120,
} as const;

export const LICENCES = ["CC0-1.0", "OGL-UK-3.0", "CC-BY-SA-4.0"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const sourceSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  licence: z.enum(LICENCES),
  retrieved: isoDate,
  /** Required for CC BY-SA (checked below); credited wording for OGL. */
  attribution: z.string().min(1).optional(),
});

const answerSchema = z.object({
  label: z.string().trim().min(1),
  wikidata_qid: z
    .string()
    .regex(/^Q[0-9]+$/)
    .optional(),
  prior: z.number().gt(0).lte(1),
  /** Extra spellings; normalised by the seeder. The label is always an alias. */
  aliases: z.array(z.string().trim().min(1)).default([]),
});

export const promptFileSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case slug"),
    text: z.string().trim().min(10).max(CONTENT_RULES.maxPromptChars),
    category: z.string().trim().min(1),
    region: z.string().default("GB"),
    status: z.enum(["draft", "approved", "retired"]),
    review: z
      .object({ reviewer: z.string().min(1), date: isoDate, notes: z.string().optional() })
      .optional(),
    sources: z.array(sourceSchema).min(1),
    answers: z.array(answerSchema),
  })
  .superRefine((file, ctx) => {
    const issue = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: "custom", message, path });

    if (file.answers.length < CONTENT_RULES.minAnswers) {
      issue(`needs at least ${CONTENT_RULES.minAnswers} answers, has ${file.answers.length}`, [
        "answers",
      ]);
    }
    if (file.status === "approved" && !file.review) {
      issue("approved prompts must record a review (reviewer + date)", ["review"]);
    }
    file.sources.forEach((s, i) => {
      if (s.licence === "CC-BY-SA-4.0" && !s.attribution) {
        issue("CC BY-SA sources need attribution text", ["sources", i, "attribution"]);
      }
    });

    const priorSum = file.answers.reduce((sum, a) => sum + a.prior, 0);
    if (priorSum > 1 + 1e-9) issue(`priors sum to ${priorSum.toFixed(4)} (> 1)`, ["answers"]);

    const seenLabels = new Map<string, number>();
    const seenAliases = new Map<string, number>();
    file.answers.forEach((a, i) => {
      if (a.prior > CONTENT_RULES.maxSinglePrior) {
        issue(
          `prior ${a.prior} > ${CONTENT_RULES.maxSinglePrior}: one obvious answer (hard rule 9)`,
          ["answers", i, "prior"],
        );
      }
      const labelKey = a.label.toLocaleLowerCase("en-GB");
      if (seenLabels.has(labelKey)) issue(`duplicate label "${a.label}"`, ["answers", i, "label"]);
      seenLabels.set(labelKey, i);

      for (const raw of [a.label, ...a.aliases]) {
        const norm = normalise(raw);
        if (norm === "") {
          issue(`"${raw}" normalises to nothing`, ["answers", i]);
          continue;
        }
        const owner = seenAliases.get(norm);
        if (owner !== undefined && owner !== i) {
          issue(
            `"${raw}" normalises to "${norm}", already used by answer #${owner} ("${file.answers[owner]?.label}")`,
            ["answers", i, "aliases"],
          );
        }
        seenAliases.set(norm, i);
      }
    });
  });

export type PromptFile = z.infer<typeof promptFileSchema>;

export type ValidationResult = { ok: true; file: PromptFile } | { ok: false; errors: string[] };

/** Validate parsed JSON; errors are human-readable "path: message" lines. */
export function validatePromptFile(json: unknown): ValidationResult {
  const r = promptFileSchema.safeParse(json);
  if (r.success) return { ok: true, file: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

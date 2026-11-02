/**
 * Turn validated prompt files into database rows. Pure: no I/O, so the plan
 * can be unit-tested and diffed before anything touches the database.
 */
import { normalise } from "../normalise";
import { answerId, promptId } from "./ids";
import type { PromptFile } from "./schema";

export type PromptRow = {
  id: string;
  text: string;
  category: string;
  region: string;
  status: PromptFile["status"];
};
export type AnswerRow = {
  id: string;
  prompt_id: string;
  label: string;
  wikidata_qid: string | null;
  prior_p: number;
};
export type AliasRow = { answer_id: string; prompt_id: string; alias_norm: string };

export type SeedPlan = { prompts: PromptRow[]; answers: AnswerRow[]; aliases: AliasRow[] };

export function buildSeedPlan(files: readonly PromptFile[]): SeedPlan {
  const slugs = new Set<string>();
  const plan: SeedPlan = { prompts: [], answers: [], aliases: [] };

  for (const f of files) {
    if (slugs.has(f.slug)) throw new Error(`duplicate prompt slug "${f.slug}"`);
    slugs.add(f.slug);
    const pid = promptId(f.slug);
    plan.prompts.push({
      id: pid,
      text: f.text,
      category: f.category,
      region: f.region,
      status: f.status,
    });

    for (const a of f.answers) {
      const aid = answerId(f.slug, a.label);
      plan.answers.push({
        id: aid,
        prompt_id: pid,
        label: a.label,
        wikidata_qid: a.wikidata_qid ?? null,
        prior_p: a.prior,
      });
      const norms = new Set([a.label, ...a.aliases].map(normalise).filter((n) => n !== ""));
      for (const alias_norm of norms)
        plan.aliases.push({ answer_id: aid, prompt_id: pid, alias_norm });
    }
  }
  return plan;
}

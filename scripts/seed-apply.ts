/**
 * Apply a SeedPlan to Postgres in ONE transaction as service_role.
 * Idempotent: rows have deterministic ids and are upserted.
 *  - prompts: insert or update text/category/region/status
 *  - canonical_answers: insert or update label/wikidata_qid/prior_p; never
 *    touches status/merged_into, so admin merges and rejections survive reseeds
 *  - aliases: insert new ones (aliasesInserted counts only rows added by this run); an alias already owned by a DIFFERENT answer (e.g. an
 *    admin-added alias) is left alone and reported as a conflict
 * Never deletes: answers removed from a file are reported as orphans.
 */
import type pg from "pg";
import type { SeedPlan } from "../lib/content/seed-plan";

export type SeedReport = {
  prompts: number;
  answers: number;
  aliasesInserted: number;
  aliasConflicts: string[];
  orphanAnswers: string[];
};

type Queryable = Pick<pg.Client, "query">;

export async function applySeedPlan(db: Queryable, plan: SeedPlan): Promise<SeedReport> {
  const report: SeedReport = {
    prompts: plan.prompts.length,
    answers: plan.answers.length,
    aliasesInserted: 0,
    aliasConflicts: [],
    orphanAnswers: [],
  };
  await db.query("begin");
  try {
    await db.query("set local role service_role");

    for (const p of plan.prompts) {
      await db.query(
        `insert into public.prompts (id, text, category, region, status)
         values ($1, $2, $3, $4, $5)
         on conflict (id) do update set text = excluded.text, category = excluded.category,
           region = excluded.region, status = excluded.status`,
        [p.id, p.text, p.category, p.region, p.status],
      );
    }

    for (const a of plan.answers) {
      await db.query(
        `insert into public.canonical_answers (id, prompt_id, label, wikidata_qid, prior_p)
         values ($1, $2, $3, $4, $5)
         on conflict (id) do update set label = excluded.label,
           wikidata_qid = excluded.wikidata_qid, prior_p = excluded.prior_p`,
        [a.id, a.prompt_id, a.label, a.wikidata_qid, a.prior_p],
      );
    }

    for (const al of plan.aliases) {
      const ins = await db.query(
        `insert into public.aliases (answer_id, prompt_id, alias_norm, source)
         values ($1, $2, $3, 'seed')
         on conflict (prompt_id, alias_norm) do nothing`,
        [al.answer_id, al.prompt_id, al.alias_norm],
      );
      if (ins.rowCount === 1) {
        report.aliasesInserted += 1;
        continue;
      }
      const existing = await db.query<{ answer_id: string }>(
        `select answer_id from public.aliases where prompt_id = $1 and alias_norm = $2`,
        [al.prompt_id, al.alias_norm],
      );
      const owner = existing.rows[0]?.answer_id;
      if (owner && owner !== al.answer_id) {
        report.aliasConflicts.push(`"${al.alias_norm}" (prompt ${al.prompt_id}) owned by ${owner}`);
      }
    }

    const planned = plan.answers.map((a) => a.id);
    const orphans = await db.query<{ label: string; id: string }>(
      `select label, id from public.canonical_answers
       where prompt_id = any($1::uuid[]) and not (id = any($2::uuid[]))`,
      [plan.prompts.map((p) => p.id), planned],
    );
    report.orphanAnswers = orphans.rows.map((o) => `${o.label} (${o.id})`);

    await db.query("commit");
    return report;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

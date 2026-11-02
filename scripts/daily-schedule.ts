/**
 * Fill daily_sets for dates that have none.
 *
 *   pnpm daily:schedule --from YYYY-MM-DD --days N [--seed S] [--reuse-days 60] [--dry-run]
 *
 * --from defaults to London today. Existing dates are never altered.
 * Fails (exit 1) naming the date and reason if a day can't be filled.
 */
import { parseArgs } from "node:util";
import { DAILY_REUSE_DAYS } from "../config/game";
import { planSchedule, ScheduleError } from "../lib/daily-schedule";
import { gameDate } from "../lib/time";
import { asServiceRole, connect } from "./db";
import { insertPlannedSets, loadApprovedPrompts, loadSetsAround } from "./daily-store";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      days: { type: "string", default: "7" },
      seed: { type: "string", default: "daily-v1" },
      "reuse-days": { type: "string", default: String(DAILY_REUSE_DAYS) },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const today = gameDate(new Date());
  const from = values.from ?? today;
  const days = Number(values.days);
  const reuseDays = Number(values["reuse-days"]);

  const client = await connect();
  try {
    await asServiceRole(client, async () => {
      const prompts = await loadApprovedPrompts(client);
      const existing = await loadSetsAround(client, from, days, reuseDays);
      const categoryOf = new Map(prompts.map((p) => [p.id, p.category]));
      const plan = planSchedule(prompts, existing, {
        from,
        days,
        today,
        seed: values.seed,
        reuseDays,
      });

      console.log(
        `London today ${today}. ${prompts.length} approved prompts. Window ${from} +${days}d, reuse ${reuseDays}d, seed "${values.seed}".`,
      );
      for (const d of plan.alreadySet) console.log(`  ${d}  (already set — left unchanged)`);
      for (const s of plan.planned) {
        console.log(
          `  ${s.date}  ${s.promptIds.map((id) => `${categoryOf.get(id)}:${id.slice(0, 8)}`).join("  ")}`,
        );
      }
      if (values["dry-run"]) {
        console.log(`Dry run: ${plan.planned.length} set(s) planned, nothing written.`);
        throw new DryRun();
      }
      await insertPlannedSets(client, plan.planned);
      console.log(`Inserted ${plan.planned.length} set(s).`);
    });
  } catch (e) {
    if (e instanceof DryRun) return;
    if (e instanceof ScheduleError) {
      console.error(`ERROR: ${e.message}`);
      process.exitCode = 1;
      return;
    }
    throw e;
  } finally {
    await client.end();
  }
}

/** Thrown to roll back the transaction after a dry run. */
class DryRun extends Error {}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

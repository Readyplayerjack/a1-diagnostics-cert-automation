/**
 * Exit non-zero if any of the next DAILY_CHECK_DAYS London days (starting
 * today) has no published daily set. For CI / cron.   pnpm daily:check
 */
import { DAILY_CHECK_DAYS } from "../config/game";
import { missingDates } from "../lib/daily-schedule";
import { addDays, gameDate } from "../lib/time";
import { asServiceRole, connect } from "./db";
import { publishedDates } from "./daily-store";

async function main(): Promise<void> {
  const today = gameDate(new Date());
  const client = await connect();
  try {
    const published = await asServiceRole(client, () =>
      publishedDates(client, today, addDays(today, DAILY_CHECK_DAYS - 1)),
    );
    const missing = missingDates(published, today, DAILY_CHECK_DAYS);
    if (missing.length > 0) {
      console.error(
        `daily:check FAILED: no published set for ${missing.length} of the next ${DAILY_CHECK_DAYS} London days: ${missing.join(", ")}`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `daily:check OK: ${today} to ${addDays(today, DAILY_CHECK_DAYS - 1)} all have published sets.`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

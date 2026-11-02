import { defineConfig } from "vitest/config";

/** Database tests (RLS + seeder). Require a running database: pnpm db:start, or SUPABASE_DB_URL. */
export default defineConfig({
  test: {
    include: ["supabase/tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});

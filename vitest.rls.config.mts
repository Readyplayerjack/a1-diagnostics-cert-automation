import { defineConfig } from "vitest/config";

/** RLS tests only. Requires a running local Supabase (pnpm db:start). */
export default defineConfig({
  test: {
    include: ["supabase/tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Database tests (RLS, seeder, daily endpoints). Require a running database: pnpm db:start, or SUPABASE_DB_URL. */
export default defineConfig({
  resolve: {
    alias: {
      "@/": root,
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["supabase/tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});

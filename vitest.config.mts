import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Unit/integration tests. RLS tests (need a running database) use vitest.rls.config.mts. */
export default defineConfig({
  resolve: {
    alias: {
      "@/": root,
      // `server-only` throws outside a React Server Components bundle; it is a
      // build-time guard, so stub it for tests that exercise server modules.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "supabase/**", "tests/e2e/**"],
    environment: "node",
  },
});

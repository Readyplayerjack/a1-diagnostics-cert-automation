import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** HMAC secret for per-prompt play tokens: 32+ random bytes (base64 ≥ 43 chars). */
  PLAY_TOKEN_SECRET: z.string().min(32, "must be at least 32 characters (use 32+ random bytes)"),
  /** Placeholder; real admin auth arrives with PLAN item 10. */
  ADMIN_PASSWORD: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvError extends Error {
  override name = "EnvError";
}

/**
 * Validate a raw env source. Throws EnvError naming every missing or invalid
 * variable, e.g. "Missing required environment variable: PLAY_TOKEN_SECRET".
 * Empty strings count as missing.
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const cleaned = Object.fromEntries(
    Object.keys(serverEnvSchema.shape).map((key) => {
      const value = source[key];
      return [key, value === "" ? undefined : value];
    }),
  );
  const result = serverEnvSchema.safeParse(cleaned);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const key = String(issue.path[0] ?? "(unknown)");
    return cleaned[key] === undefined
      ? `Missing required environment variable: ${key}`
      : `Invalid environment variable ${key}: ${issue.message}`;
  });
  throw new EnvError(
    `${[...new Set(problems)].join("\n")}\nSee .env.example for the full list of variables.`,
  );
}

let cached: ServerEnv | undefined;

/** Validated server env, read once from process.env. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

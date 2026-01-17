import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment variable schema for validation.
 * All fields are required strings.
 */
const envSchema = z.object({
  JIFELINE_API_BASE_URL: z.string().url(),
  JIFELINE_CLIENT_ID: z.string().min(1),
  JIFELINE_CLIENT_SECRET: z.string().min(1),
  JIFELINE_TOKEN_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().url().optional(),
  USE_SIMPLE_PDF: z
    .string()
    .optional()
    .transform((val) => val === 'true' || val === '1'),
});

/**
 * Validated configuration object.
 * Throws an error if any required environment variables are missing or invalid.
 */
export type Config = z.infer<typeof envSchema>;

/**
 * Loads and validates environment variables.
 * @returns A typed Config object with all validated environment variables.
 * @throws {Error} If any required environment variables are missing or invalid.
 */
export function loadConfig(): Config {
  const rawEnv = {
    JIFELINE_API_BASE_URL: process.env.JIFELINE_API_BASE_URL,
    JIFELINE_CLIENT_ID: process.env.JIFELINE_CLIENT_ID,
    JIFELINE_CLIENT_SECRET: process.env.JIFELINE_CLIENT_SECRET,
    JIFELINE_TOKEN_URL: process.env.JIFELINE_TOKEN_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    USE_SIMPLE_PDF: process.env.USE_SIMPLE_PDF,
  };

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errors = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${errors}`);
  }

  return result.data;
}


/**
 * Environment variable validation on startup.
 *
 * Validates all required environment variables and fails fast if any are missing.
 * This prevents runtime errors from missing configuration.
 */

import { z } from 'zod';
import { error } from '../services/logger.js';

/**
 * Environment variable schema with validation.
 */
const envSchema = z.object({
  // Jifeline API
  JIFELINE_API_BASE_URL: z.string().url('JIFELINE_API_BASE_URL must be a valid URL'),
  JIFELINE_CLIENT_ID: z.string().min(1, 'JIFELINE_CLIENT_ID is required'),
  JIFELINE_CLIENT_SECRET: z.string().min(1, 'JIFELINE_CLIENT_SECRET is required'),
  JIFELINE_TOKEN_URL: z.string().url('JIFELINE_TOKEN_URL must be a valid URL'),

  // Supabase
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_KEY: z.string().min(1, 'SUPABASE_SERVICE_KEY is required'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_BASE_URL: z.string().url('OPENAI_BASE_URL must be a valid URL').optional(),

  // Optional
  USE_SIMPLE_PDF: z
    .string()
    .optional()
    .transform((val) => val === 'true' || val === '1'),

  // Environment
  NODE_ENV: z.enum(['development', 'staging', 'production']).optional().default('development'),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * Validates all environment variables on startup.
 * Throws an error if any required variables are missing or invalid.
 */
export function validateEnvironment(): ValidatedEnv {
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
    NODE_ENV: process.env.NODE_ENV,
  };

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errors = result.error.errors
      .map((err) => {
        const path = err.path.join('.');
        return `  ${path}: ${err.message}`;
      })
      .join('\n');

    const errorMessage = `Environment validation failed:\n${errors}\n\nPlease check your .env file and ensure all required variables are set.`;
    error('Environment validation failed', {
      errors: result.error.errors,
      missingVars: result.error.errors.filter((e) => e.code === 'invalid_type' && e.received === 'undefined').map((e) => e.path.join('.')),
    });
    throw new Error(errorMessage);
  }

  return result.data;
}

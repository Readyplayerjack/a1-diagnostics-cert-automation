import { Pool, PoolClient } from 'pg';
import { loadConfig } from '../config/index.js';
import { withTimeout, TimeoutError } from '../utils/with-timeout.js';
import { retryWithBackoff, isRetryableError } from '../utils/retry.js';

let pool: Pool | null = null;

/**
 * Gets or creates a PostgreSQL connection pool.
 * Uses the DATABASE_URL from environment configuration.
 * @returns A PostgreSQL connection pool instance.
 */
export function getPool(): Pool {
  if (pool === null) {
    const config = loadConfig();
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      // Connection pool settings for serverless environments
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

/**
 * Executes a query using a connection from the pool.
 * Protected with timeout and retry logic.
 * @param query SQL query string
 * @param params Query parameters
 * @returns Query result
 * @throws {TimeoutError} If query exceeds 10 second timeout
 */
export async function query<T = unknown>(
  query: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  // Flatten promise chain: define async function separately
  const executeWithTimeout = async (): Promise<{ rows: T[]; rowCount: number }> => {
    // Create promise and await withTimeout on same logical flow
    const queryPromise = executeQuery<T>(query, params);
    return await withTimeout(
      queryPromise,
      10000, // 10 second timeout for database operations
      `Database query: ${query.substring(0, 50)}...`
    );
  };

  return await retryWithBackoff(executeWithTimeout, {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    operation: `Database query: ${query.substring(0, 50)}...`,
    isRetryable: (err) => {
      // Don't retry syntax errors or constraint violations
      if (err instanceof DatabaseError && err.cause) {
        const cause = err.cause as { code?: string };
        // Retry on connection errors, timeouts, deadlocks
        if (
          cause.code === 'ECONNREFUSED' ||
          cause.code === 'ETIMEDOUT' ||
          cause.code === '40P01' || // deadlock_detected
          cause.code === '57P01' || // admin_shutdown
          cause.code === '57P02' || // crash_shutdown
          cause.code === '57P03' // cannot_connect_now
        ) {
          return true;
        }
        // Don't retry syntax errors, constraint violations, etc.
        if (
          cause.code === '42601' || // syntax_error
          cause.code === '23505' || // unique_violation
          cause.code === '23503' || // foreign_key_violation
          cause.code === '23502' // not_null_violation
        ) {
          return false;
        }
      }
      return isRetryableError(err);
    },
  });
}

/**
 * Executes the actual database query (internal, used by query()).
 */
async function executeQuery<T>(
  query: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getPool();
  try {
    const result = await pool.query(query, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount ?? 0,
    };
  } catch (error) {
    // Re-throw with context for better error handling
    throw new DatabaseError('Database query failed', error);
  }
}

/**
 * Gets a client from the pool for transaction management.
 * Protected with timeout and retry logic.
 * Remember to release the client when done.
 * @returns A PostgreSQL client
 * @throws {TimeoutError} If client acquisition exceeds 10 second timeout
 */
export async function getClient(): Promise<PoolClient> {
  // Flatten promise chain: define async function separately
  const acquireWithTimeout = async (): Promise<PoolClient> => {
    const result = await withTimeout(
      acquireClient(),
      10000, // 10 second timeout for client acquisition
      'Database client acquisition'
    );
    return result;
  };

  return await retryWithBackoff(acquireWithTimeout, {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    operation: 'Database client acquisition',
    isRetryable: isRetryableError,
  });
}

/**
 * Acquires a client from the pool (internal, used by getClient()).
 */
async function acquireClient(): Promise<PoolClient> {
  const pool = getPool();
  try {
    return await pool.connect();
  } catch (error) {
    throw new DatabaseError('Failed to acquire database client', error);
  }
}

/**
 * Closes the connection pool.
 * Should be called during application shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool !== null) {
    try {
      await pool.end();
      pool = null;
    } catch (error) {
      // Log error but don't throw - pool closure errors shouldn't crash the app
      try {
        const { error: logError } = await import('../services/logger.js');
        logError('Failed to close database pool', { 
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } catch (importError) {
        // Fallback to console if logger import fails
        console.error('Failed to close database pool:', error);
        console.error('Logger import also failed:', importError);
      }
      pool = null; // Still set to null to prevent further use
    }
  }
}

/**
 * Custom error class for database operations.
 * Wraps underlying database errors with additional context.
 */
export class DatabaseError extends Error {
  public readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'DatabaseError';
    this.cause = cause;
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatabaseError);
    }
  }
}


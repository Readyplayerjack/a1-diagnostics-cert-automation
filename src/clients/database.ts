import { Pool, PoolClient } from 'pg';
import { loadConfig } from '../config/index.js';

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
 * @param query SQL query string
 * @param params Query parameters
 * @returns Query result
 */
export async function query<T = unknown>(
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
 * Remember to release the client when done.
 * @returns A PostgreSQL client
 */
export async function getClient(): Promise<PoolClient> {
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
    await pool.end();
    pool = null;
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


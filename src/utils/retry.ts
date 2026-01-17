/**
 * Retry utility with exponential backoff.
 *
 * Automatically retries failed operations with exponential backoff,
 * only retrying on transient failures (429, 5xx, network errors).
 */

import { warn } from '../services/logger.js';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay cap in milliseconds (default: 10000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Custom function to determine if error is retryable (default: isRetryableError) */
  isRetryable?: (error: unknown) => boolean;
  /** Operation name for logging (optional) */
  operation?: string;
}

/**
 * Determines if an error is retryable (transient failure).
 *
 * Retries on:
 * - 429 (rate limit)
 * - 5xx (server errors)
 * - Network errors (ECONNRESET, ETIMEDOUT)
 * - TimeoutError
 *
 * Does NOT retry on:
 * - 4xx client errors (except 429)
 * - Successful responses
 */
export function isRetryableError(error: unknown): boolean {
  // Check for timeout errors
  if (error instanceof Error && error.name === 'TimeoutError') {
    return true;
  }

  // Check for network errors
  if (error instanceof Error) {
    const errorCode = (error as { code?: string }).code;
    if (errorCode === 'ECONNRESET' || errorCode === 'ETIMEDOUT') {
      return true;
    }
  }

  // Check for HTTP status codes
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode: number }).statusCode;
    // Retry on 429 (rate limit) and 5xx (server errors)
    if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
      return true;
    }
    // Don't retry on other 4xx errors (client errors)
    if (statusCode >= 400 && statusCode < 500) {
      return false;
    }
  }

  // Check for fetch/network errors (TypeError from fetch)
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    if (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('timeout')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Retries an async operation with exponential backoff.
 *
 * @param fn The async function to retry
 * @param options Retry configuration options
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    isRetryable = isRetryableError,
    operation = 'operation',
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if error is not retryable
      if (!isRetryable(error)) {
        warn('Error is not retryable, aborting retries', {
          operation,
          attempt: attempt + 1,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        warn('Max retries exhausted', {
          operation,
          attempts: attempt + 1,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        break;
      }

      // Log retry attempt
      warn('Retrying operation after error', {
        operation,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        delayMs: delay,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  // All retries exhausted
  throw lastError;
}

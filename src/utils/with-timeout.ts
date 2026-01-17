/**
 * Timeout utility for async operations.
 *
 * Wraps a promise with a timeout, throwing TimeoutError if the operation
 * exceeds the specified duration.
 */

export class TimeoutError extends Error {
  public readonly timeoutMs: number;
  public readonly operation: string;

  constructor(timeoutMs: number, operation: string) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    this.operation = operation;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }
}

/**
 * Wraps a promise with a timeout.
 *
 * @param promise The promise to wrap
 * @param timeoutMs Timeout duration in milliseconds
 * @param operation Description of the operation (for error messages)
 * @returns The result of the promise if it completes within the timeout
 * @throws {TimeoutError} If the operation exceeds the timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  // Ensure the promise is handled even if it rejects before the race
  const handledPromise = promise.catch((error) => {
    // Re-throw with context for better error messages
    if (error instanceof TimeoutError) {
      throw error;
    }
    throw new Error(
      `Operation "${operation}" failed: ${error instanceof Error ? error.message : String(error)}`
    );
  });

  try {
    return await Promise.race([
      handledPromise,
      new Promise<T>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new TimeoutError(timeoutMs, operation));
        }, timeoutMs);
        // Clean up timeout if promise resolves first
        handledPromise.finally(() => {
          clearTimeout(timeoutId);
        }).catch(() => {
          // Ignore errors from finally
        });
      }),
    ]);
  } catch (error) {
    // Re-throw timeout errors as-is
    if (error instanceof TimeoutError) {
      throw error;
    }
    // Re-throw other errors (already wrapped by handledPromise)
    throw error;
  }
}

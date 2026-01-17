/**
 * Graceful shutdown handler for production deployments.
 *
 * Handles SIGTERM and SIGINT signals to ensure:
 * - In-flight requests complete
 * - Database connections close properly
 * - Resources are cleaned up
 */

import { info, warn, error } from '../services/logger.js';
import { closePool } from '../clients/database.js';

let isShuttingDown = false;
let inFlightRequests = 0;
const maxShutdownTime = 30000; // 30 seconds max shutdown time

/**
 * Increments the in-flight request counter.
 * Call this when a request starts.
 */
export function incrementInFlightRequests(): void {
  if (isShuttingDown) {
    throw new Error('Server is shutting down, rejecting new requests');
  }
  inFlightRequests++;
}

/**
 * Decrements the in-flight request counter.
 * Call this when a request completes.
 */
export function decrementInFlightRequests(): void {
  inFlightRequests = Math.max(0, inFlightRequests - 1);
}

/**
 * Waits for all in-flight requests to complete.
 * Times out after maxShutdownTime.
 */
async function waitForInflightRequests(): Promise<void> {
  const startTime = Date.now();
  
  while (inFlightRequests > 0 && Date.now() - startTime < maxShutdownTime) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (inFlightRequests > 0) {
    warn('Shutdown timeout: some requests did not complete', {
      remainingRequests: inFlightRequests,
      shutdownTimeMs: Date.now() - startTime,
    });
  } else {
    info('All in-flight requests completed', {
      shutdownTimeMs: Date.now() - startTime,
    });
  }
}

/**
 * Sets up graceful shutdown handlers.
 * Call this during application startup.
 */
export function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      warn('Shutdown already in progress, ignoring signal', { signal });
      return;
    }

    isShuttingDown = true;
    info('Graceful shutdown initiated', { signal });

    try {
      // Wait for in-flight requests
      await waitForInflightRequests();

      // Close database connections
      try {
        await closePool();
        info('Database connections closed');
      } catch (dbError) {
        error('Error closing database connections', {
          error: dbError instanceof Error ? dbError.message : String(dbError),
        });
      }

      info('Graceful shutdown completed');
      process.exit(0);
    } catch (shutdownError) {
      error('Error during graceful shutdown', {
        error: shutdownError instanceof Error ? shutdownError.message : String(shutdownError),
      });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    error('Uncaught exception', {
      error: err.message,
      stack: err.stack,
    });
    shutdown('uncaughtException').catch(() => {
      process.exit(1);
    });
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    shutdown('unhandledRejection').catch(() => {
      process.exit(1);
    });
  });

  info('Graceful shutdown handlers registered');
}

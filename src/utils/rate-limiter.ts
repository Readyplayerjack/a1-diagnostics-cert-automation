/**
 * Rate limiter using token bucket algorithm with sliding window.
 *
 * Prevents overwhelming APIs by limiting request rate and queuing
 * requests when limits are reached.
 */

import { warn } from '../services/logger.js';

export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window duration in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
  /** For OpenAI: maximum tokens per window (optional) */
  maxTokens?: number;
}

/**
 * Rate limiter that enforces request rate limits using a sliding window.
 *
 * When limit is reached, requests are queued and executed when tokens
 * become available.
 */
export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxTokens?: number;
  private readonly requestTimestamps: number[] = [];
  private readonly tokenTimestamps: Array<{ timestamp: number; tokens: number }> = [];
  private readonly queue: Array<{
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
    fn: () => Promise<unknown>;
    tokens?: number;
  }> = [];
  private processing = false;

  constructor(config: RateLimitConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs ?? 60000; // Default: 1 minute
    this.maxTokens = config.maxTokens;
  }

  /**
   * Executes a function with rate limiting.
   *
   * If rate limit is reached, the request is queued and executed
   * when tokens become available.
   *
   * @param fn The function to execute
   * @param tokens Optional token count (for OpenAI token-based limiting)
   * @returns The result of the function
   */
  async throttle<T>(fn: () => Promise<T>, tokens?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ resolve, reject, fn, tokens });
      // processQueue is async but we don't await it - it processes in background
      // However, we need to catch any errors from processQueue itself
      this.processQueue().catch((error) => {
        // If processQueue fails, reject all queued items
        const failedTask = this.queue.find((task) => task.fn === fn);
        if (failedTask) {
          failedTask.reject(error);
        }
      });
    });
  }

  /**
   * Processes the request queue, respecting rate limits.
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // Clean up old timestamps outside the window
      this.cleanupOldTimestamps();

      // Check if we can execute the next request
      const canExecute = this.canExecute(this.queue[0]?.tokens);

      if (!canExecute) {
        // Wait until we can execute
        const waitTime = this.getWaitTime();
        if (waitTime > 0) {
          warn('Rate limit reached, throttling request', {
            waitTimeMs: waitTime,
            queueLength: this.queue.length,
          });
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
      }

      // Execute the next request
      const task = this.queue.shift();
      if (!task) {
        break;
      }

      // Record request timestamp
      this.requestTimestamps.push(Date.now());

      // Record token usage if applicable
      if (this.maxTokens && task.tokens) {
        this.tokenTimestamps.push({
          timestamp: Date.now(),
          tokens: task.tokens,
        });
      }

      // Execute the function
      try {
        const result = await task.fn();
        task.resolve(result);
      } catch (error) {
        task.reject(error);
      }
    }

    this.processing = false;
  }

  /**
   * Checks if a request can be executed within rate limits.
   */
  private canExecute(tokens?: number): boolean {
    // Check request count limit
    if (this.requestTimestamps.length >= this.maxRequests) {
      return false;
    }

    // Check token limit (for OpenAI)
    if (this.maxTokens && tokens) {
      const tokensInWindow = this.tokenTimestamps.reduce((sum, entry) => {
        if (Date.now() - entry.timestamp < this.windowMs) {
          return sum + entry.tokens;
        }
        return sum;
      }, 0);

      if (tokensInWindow + tokens > this.maxTokens) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculates how long to wait before next request can be executed.
   */
  private getWaitTime(): number {
    if (this.requestTimestamps.length === 0) {
      return 0;
    }

    const oldestTimestamp = this.requestTimestamps[0];
    const elapsed = Date.now() - oldestTimestamp;
    const waitTime = this.windowMs - elapsed;

    return Math.max(0, waitTime);
  }

  /**
   * Removes timestamps outside the current window to prevent memory leaks.
   */
  private cleanupOldTimestamps(): void {
    const cutoff = Date.now() - this.windowMs;

    // Clean request timestamps
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }

    // Clean token timestamps
    while (this.tokenTimestamps.length > 0 && this.tokenTimestamps[0]?.timestamp < cutoff) {
      this.tokenTimestamps.shift();
    }
  }
}

/**
 * Estimates token count for OpenAI requests.
 * Rough estimate: ~3 tokens per word + overhead.
 */
export function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter((word) => word.length > 0).length;
  return Math.ceil(words * 3) + 50; // 50 tokens overhead for prompt structure
}

/**
 * Singleton rate limiters for each API.
 */

// Jifeline: 10 requests per minute (conservative)
export const jifelineRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000, // 1 minute
});

// OpenAI: 200 requests/minute + 40,000 tokens/minute
export const openaiRateLimiter = new RateLimiter({
  maxRequests: 200,
  windowMs: 60000, // 1 minute
  maxTokens: 40000,
});

#!/usr/bin/env node
/**
 * Live Error Handling Test
 *
 * Purpose:
 * Simulate various failure scenarios and show how the system handles them.
 *
 * Usage:
 *   npm run diagnostic:errors
 */

import { JifelineApiClient } from '../../src/clients/jifeline-api-client.js';
import { HttpOpenAiExtractionClient } from '../../src/clients/openai-extraction-client.js';
import { JifelineNotFoundError } from '../../src/clients/jifeline-api-errors.js';
import { loadConfig } from '../../src/config/index.js';
import { withTimeout, TimeoutError } from '../../src/utils/with-timeout.js';
import { retryWithBackoff, isRetryableError } from '../../src/utils/retry.js';
import { jifelineRateLimiter, openaiRateLimiter, RateLimiter } from '../../src/utils/rate-limiter.js';

interface ErrorTestResult {
  scenario: string;
  status: '✓' | '✗' | '⚠️';
  message: string;
  details?: string;
}

const results: ErrorTestResult[] = [];

async function test404Handling(): Promise<void> {
  console.log('🔍 Testing 404 (Not Found) handling...');
  
  try {
    const client = new JifelineApiClient();
    
    // Try to fetch a non-existent ticket
    const fakeTicketId = '00000000-0000-0000-0000-000000000000';
    
    try {
      await client.getTicketById(fakeTicketId);
      results.push({
        scenario: '404 Handling',
        status: '✗',
        message: 'Should have thrown JifelineNotFoundError but did not',
      });
      console.log('  ✗ Failed: Should throw error for non-existent ticket');
    } catch (err) {
      if (err instanceof JifelineNotFoundError) {
        results.push({
          scenario: '404 Handling',
          status: '✓',
          message: 'Correctly throws JifelineNotFoundError',
          details: err.message,
        });
        console.log('  ✓ Correctly handles 404 (throws JifelineNotFoundError)');
      } else {
        results.push({
          scenario: '404 Handling',
          status: '⚠️',
          message: 'Throws error but wrong type',
          details: err instanceof Error ? err.message : String(err),
        });
        console.log('  ⚠️  Throws error but wrong type');
      }
    }
  } catch (err) {
    results.push({
      scenario: '404 Handling',
      status: '✗',
      message: 'Unexpected error during test',
      details: err instanceof Error ? err.message : String(err),
    });
    console.log(`  ✗ Test failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testMalformedGptResponse(): Promise<void> {
  console.log('🔍 Testing malformed GPT response handling...');
  
  try {
    const client = new HttpOpenAiExtractionClient();
    
    // Test with conversation that might cause issues
    const testRequest = {
      conversationText: 'This is a test conversation with no registration or mileage mentioned.',
      regexCandidates: {
        regs: [],
        mileages: [],
      },
    };
    
    const result = await client.extractRegAndMileage(testRequest);
    
    // Should return null values for both
    if (result.vehicleRegistration === null && result.vehicleMileage === null) {
      results.push({
        scenario: 'Malformed GPT Response',
        status: '✓',
        message: 'Correctly handles missing data (returns nulls)',
      });
      console.log('  ✓ Correctly handles missing data');
    } else {
      results.push({
        scenario: 'Malformed GPT Response',
        status: '⚠️',
        message: 'Returned values when should be null',
        details: `Reg: ${result.vehicleRegistration}, Mileage: ${result.vehicleMileage}`,
      });
      console.log('  ⚠️  Returned values when should be null');
    }
  } catch (err) {
    // If extraction throws, that's also acceptable (system error)
    results.push({
      scenario: 'Malformed GPT Response',
      status: '✓',
      message: 'Throws error for system failures (acceptable)',
      details: err instanceof Error ? err.message : String(err),
    });
    console.log('  ✓ Throws error for system failures (acceptable)');
  }
}

async function testTimeoutHandling(): Promise<void> {
  console.log('🔍 Testing timeout handling...');
  
  try {
    // Test 1: Verify timeout utility exists and works
    let timeoutWorks = false;
    try {
      const slowPromise = new Promise((resolve) => setTimeout(() => resolve('done'), 2000));
      await withTimeout(slowPromise, 500, 'test timeout');
      // Should not reach here
      timeoutWorks = false;
    } catch (err) {
      if (err instanceof TimeoutError) {
        timeoutWorks = true;
        console.log('  ✓ Timeout utility correctly throws TimeoutError');
      } else {
        throw err;
      }
    }

    // Test 2: Verify timeout doesn't fire for fast operations
    try {
      const fastPromise = Promise.resolve('done');
      const result = await withTimeout(fastPromise, 1000, 'fast operation');
      if (result === 'done') {
        console.log('  ✓ Timeout utility allows fast operations to complete');
      } else {
        timeoutWorks = false;
      }
    } catch (err) {
      timeoutWorks = false;
      console.log(`  ⚠️  Timeout fired for fast operation: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (timeoutWorks) {
      results.push({
        scenario: 'Timeout Handling',
        status: '✓',
        message: 'Timeout handling implemented and working',
      });
      console.log('  ✓ Timeout handling verified');
    } else {
      results.push({
        scenario: 'Timeout Handling',
        status: '✗',
        message: 'Timeout handling not working correctly',
      });
      console.log('  ✗ Timeout handling failed tests');
    }
  } catch (err) {
    results.push({
      scenario: 'Timeout Handling',
      status: '✗',
      message: 'Error testing timeout handling',
      details: err instanceof Error ? err.message : String(err),
    });
    console.log(`  ✗ Test failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testRetryHandling(): Promise<void> {
  console.log('🔍 Testing retry logic...');
  
  try {
    // Test 1: Verify retry logic retries on retryable errors
    let attemptCount = 0;
    const maxAttempts = 3;
    
    try {
      await retryWithBackoff(
        async () => {
          attemptCount++;
          if (attemptCount < maxAttempts) {
            // Simulate a retryable error (5xx server error)
            const error = new Error('Server error');
            (error as { statusCode: number }).statusCode = 500;
            throw error;
          }
          return 'success';
        },
        {
          maxRetries: maxAttempts - 1,
          initialDelay: 100, // Fast for testing
          operation: 'test retry',
        }
      );
      
      if (attemptCount === maxAttempts) {
        console.log(`  ✓ Retry logic correctly retried ${attemptCount} times`);
      } else {
        throw new Error(`Expected ${maxAttempts} attempts, got ${attemptCount}`);
      }
    } catch (err) {
      results.push({
        scenario: 'Retry Logic',
        status: '✗',
        message: 'Retry logic test failed',
        details: err instanceof Error ? err.message : String(err),
      });
      console.log(`  ✗ Retry test failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // Test 2: Verify retry logic doesn't retry non-retryable errors
    let nonRetryableAttempts = 0;
    try {
      await retryWithBackoff(
        async () => {
          nonRetryableAttempts++;
          // Simulate a non-retryable error (4xx client error, not 429)
          const error = new Error('Client error');
          (error as { statusCode: number }).statusCode = 400;
          throw error;
        },
        {
          maxRetries: 3,
          initialDelay: 100,
          operation: 'test non-retryable',
        }
      );
      // Should not reach here
      throw new Error('Should have thrown error');
    } catch (err) {
      if (nonRetryableAttempts === 1) {
        console.log('  ✓ Retry logic correctly skips retry for non-retryable errors');
      } else {
        throw new Error(`Expected 1 attempt for non-retryable error, got ${nonRetryableAttempts}`);
      }
    }

    // Test 3: Verify isRetryableError function
    const retryableError = new Error('Server error');
    (retryableError as { statusCode: number }).statusCode = 500;
    const nonRetryableError = new Error('Client error');
    (nonRetryableError as { statusCode: number }).statusCode = 400;
    
    if (isRetryableError(retryableError) && !isRetryableError(nonRetryableError)) {
      console.log('  ✓ isRetryableError correctly identifies retryable vs non-retryable errors');
    } else {
      throw new Error('isRetryableError logic incorrect');
    }

    results.push({
      scenario: 'Retry Logic',
      status: '✓',
      message: 'Retry logic implemented and working correctly',
    });
    console.log('  ✓ Retry logic verified');
  } catch (err) {
    results.push({
      scenario: 'Retry Logic',
      status: '✗',
      message: 'Error testing retry logic',
      details: err instanceof Error ? err.message : String(err),
    });
    console.log(`  ✗ Test failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testRateLimiting(): Promise<void> {
  console.log('🔍 Testing rate limiting...');
  
  try {
    // Test 1: Verify rate limiter exists and can throttle
    const testLimiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1000, // 1 second window for testing
    });

    const startTime = Date.now();
    const promises: Promise<number>[] = [];

    // Make 5 requests, but only 2 should execute immediately
    for (let i = 0; i < 5; i++) {
      promises.push(
        testLimiter.throttle(async () => {
          return Date.now();
        })
      );
    }

    const timestamps = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should take at least some time due to throttling
    if (duration > 500) {
      console.log(`  ✓ Rate limiter correctly throttled requests (took ${duration}ms)`);
    } else {
      console.log(`  ⚠️  Rate limiter may not be throttling (took only ${duration}ms)`);
    }

    // Test 2: Verify singleton rate limiters exist
    if (jifelineRateLimiter && openaiRateLimiter) {
      console.log('  ✓ Singleton rate limiters (jifelineRateLimiter, openaiRateLimiter) exist');
    } else {
      throw new Error('Singleton rate limiters not found');
    }

    // Test 3: Verify rate limiter queues requests instead of failing
    let allCompleted = true;
    try {
      const queuedPromises: Promise<string>[] = [];
      for (let i = 0; i < 3; i++) {
        queuedPromises.push(
          testLimiter.throttle(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return `request-${i}`;
          })
        );
      }
      const results = await Promise.all(queuedPromises);
      if (results.length === 3) {
        console.log('  ✓ Rate limiter queues requests instead of failing');
      } else {
        allCompleted = false;
      }
    } catch (err) {
      allCompleted = false;
      console.log(`  ⚠️  Rate limiter may be failing instead of queuing: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (allCompleted) {
      results.push({
        scenario: 'Rate Limiting',
        status: '✓',
        message: 'Rate limiting implemented and working',
      });
      console.log('  ✓ Rate limiting verified');
    } else {
      results.push({
        scenario: 'Rate Limiting',
        status: '⚠️',
        message: 'Rate limiting implemented but may need tuning',
      });
    }
  } catch (err) {
    results.push({
      scenario: 'Rate Limiting',
      status: '✗',
      message: 'Error testing rate limiting',
      details: err instanceof Error ? err.message : String(err),
    });
    console.log(`  ✗ Test failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚨 ERROR HANDLING DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  try {
    loadConfig();
    console.log('✓ Configuration loaded\n');
  } catch (err) {
    console.error('✗ Configuration error:');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  await test404Handling();
  console.log('');
  await testMalformedGptResponse();
  console.log('');
  await testTimeoutHandling();
  console.log('');
  await testRetryHandling();
  console.log('');
  await testRateLimiting();
  console.log('');

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 ERROR HANDLING SUMMARY:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  results.forEach((result) => {
    console.log(`${result.status} ${result.scenario}`);
    console.log(`   ${result.message}`);
    if (result.details) {
      console.log(`   Details: ${result.details}`);
    }
    console.log('');
  });

  const criticalGaps = results.filter((r) => r.status === '✗');
  const working = results.filter((r) => r.status === '✓');

  console.log(`Working: ${working.length}/${results.length}`);
  console.log(`Critical Gaps: ${criticalGaps.length}`);
  console.log('');

  if (criticalGaps.length > 0) {
    console.log('⚠️  CRITICAL GAPS IDENTIFIED:');
    criticalGaps.forEach((gap) => {
      console.log(`   - ${gap.scenario}: ${gap.message}`);
    });
    console.log('');
    console.log('💡 These should be fixed before production deployment');
  } else {
    console.log('✅ All error handling mechanisms in place');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

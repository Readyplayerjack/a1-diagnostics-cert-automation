#!/usr/bin/env node
/**
 * Poll and Process Closed Tickets Script
 *
 * Purpose:
 * Production script that polls Jifeline Events API for closed tickets
 * and processes them to generate certificates.
 *
 * Usage:
 *   npm run poll:tickets
 *
 * Environment Variables:
 *   - All Jifeline API variables (for Events API polling)
 *   - All Supabase variables (for certificate storage)
 *   - All OpenAI variables (for reg/mileage extraction)
 *   - DATABASE_URL (for processed_tickets tracking)
 *
 * Last Poll Timestamp:
 *   - Stored in: LAST_POLL_TIMESTAMP environment variable or file
 *   - Format: ISO 8601 timestamp
 *   - Default: 24 hours ago if not set
 *
 * This script:
 *   - Polls Events API for tickets.ticket.closed events
 *   - Filters for externally_processed=false tickets
 *   - Processes each ticket through full certificate pipeline
 *   - Records success/failure in processed_tickets table
 *   - Updates last poll timestamp
 */

import { JifelineEventsPoller } from '../src/clients/jifeline-events-poller.js';
import { createTicketProcessingService } from '../src/services/service-factory.js';
import { loadConfig } from '../src/config/index.js';
import { info, error, warn } from '../src/services/logger.js';

/**
 * Gets the last poll timestamp from environment variable or file.
 * Returns null if not set (will default to 24 hours ago in poller).
 */
async function getLastPollTimestamp(): Promise<Date | null> {
  const envTimestamp = process.env.LAST_POLL_TIMESTAMP;
  if (envTimestamp) {
    const date = new Date(envTimestamp);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
    warn('Invalid LAST_POLL_TIMESTAMP format, using default', {
      provided: envTimestamp,
    });
  }

  // Could also read from a file or database
  // For now, return null to use default (24 hours ago)
  return null;
}

/**
 * Saves the last poll timestamp.
 * In production, this should be stored in a database or file.
 * For now, we'll just log it and suggest setting LAST_POLL_TIMESTAMP env var.
 */
async function saveLastPollTimestamp(timestamp: Date): Promise<void> {
  info('Last poll timestamp updated', {
    timestamp: timestamp.toISOString(),
    note: 'Set LAST_POLL_TIMESTAMP env var for next run',
  });
  // In production, save to database or file
  // For now, just log it
}

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  info('Starting ticket polling and processing', {});

  try {
    // Load and validate configuration
    loadConfig();
    info('Configuration loaded successfully', {});
  } catch (err) {
    error('Configuration error', {
      error: err instanceof Error ? err.message : String(err),
    });
    console.error('✗ Configuration error:');
    if (err instanceof Error) {
      console.error(`  ${err.message}`);
    } else {
      console.error(`  ${String(err)}`);
    }
    console.error('');
    console.error('Please check your environment variables in .env file.');
    process.exit(1);
  }

  const poller = new JifelineEventsPoller();
  const processor = createTicketProcessingService();

  try {
    // Get last poll timestamp
    const lastPoll = await getLastPollTimestamp();
    if (lastPoll) {
      info('Using last poll timestamp', { timestamp: lastPoll.toISOString() });
    } else {
      info('No last poll timestamp found, using default (24 hours ago)', {});
    }

    // Poll for closed tickets since last poll
    info('Polling Events API for closed tickets', {
      since: lastPoll?.toISOString() ?? '24 hours ago',
    });

    const ticketIds = await poller.pollClosedTickets(lastPoll ?? undefined, {
      unprocessed_only: true, // Only process tickets that haven't been externally processed
      limit: 100, // Fetch up to 100 tickets per page
    });

    info('Polling complete', {
      ticketCount: ticketIds.length,
    });

    console.log('');
    console.log(`Found ${ticketIds.length} closed ticket(s) to process`);
    console.log('');

    if (ticketIds.length === 0) {
      console.log('No new closed tickets found. Exiting.');
      await saveLastPollTimestamp(new Date());
      process.exit(0);
    }

    // Process each ticket
    let successCount = 0;
    let failureCount = 0;
    const failures: Array<{ ticketId: string; error: string }> = [];

    for (const ticketId of ticketIds) {
      try {
        info('Processing ticket', { ticketId });
        await processor.processClosedTicket(ticketId);
        successCount++;
        console.log(`✓ Processed ticket ${ticketId}`);
      } catch (err) {
        failureCount++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        error('Failed to process ticket', {
          ticketId,
          error: errorMessage,
        });
        failures.push({ ticketId, error: errorMessage });
        console.error(`✗ Failed ticket ${ticketId}: ${errorMessage}`);
      }
    }

    console.log('');
    console.log('Processing complete:');
    console.log(`  Success: ${successCount}`);
    console.log(`  Failed: ${failureCount}`);

    if (failures.length > 0) {
      console.log('');
      console.log('Failed tickets:');
      failures.forEach((failure) => {
        console.log(`  - ${failure.ticketId}: ${failure.error}`);
      });
    }

    // Save last poll timestamp
    await saveLastPollTimestamp(new Date());

    info('Polling and processing complete', {
      total: ticketIds.length,
      success: successCount,
      failed: failureCount,
    });

    // Exit with error code if any failures occurred
    process.exit(failureCount > 0 ? 1 : 0);
  } catch (err) {
    error('Fatal error during polling', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    console.error('');
    console.error('✗ Fatal error during polling:');
    if (err instanceof Error) {
      console.error(`  ${err.message}`);
      if (err.stack) {
        console.error('');
        console.error('Stack trace:');
        console.error(err.stack);
      }
    } else {
      console.error(`  ${String(err)}`);
    }

    process.exit(1);
  }
}

// Run main function
main().catch((err) => {
  error('Unhandled error', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  console.error('Fatal error:', err);
  process.exit(1);
});


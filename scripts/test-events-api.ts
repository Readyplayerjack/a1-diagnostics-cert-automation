#!/usr/bin/env node
/**
 * Test Events API Script
 *
 * Purpose:
 * Fetch recent tickets.ticket.closed events from Jifeline Events API
 * to verify the API structure and extract ticket UUIDs for testing.
 *
 * Usage:
 *   npm run test:events
 *   npm run test:events -- --limit 10
 *   npm run test:events -- --unprocessed
 *
 * Required Environment Variables:
 *   - JIFELINE_API_BASE_URL: Base URL for the Jifeline API
 *   - JIFELINE_CLIENT_ID: OAuth2 client ID
 *   - JIFELINE_CLIENT_SECRET: OAuth2 client secret
 *   - JIFELINE_TOKEN_URL: OAuth2 token endpoint URL
 *   - (Other vars required by config validation but not used by this script)
 *
 * This script:
 *   - Does NOT write to database
 *   - Does NOT generate PDFs
 *   - Does NOT call OpenAI or Supabase
 *   - Only performs read-only API calls to test Events API
 */

import { JifelineEventsPoller } from '../src/clients/jifeline-events-poller.js';
import { loadConfig } from '../src/config/index.js';

/**
 * Parses command line arguments.
 */
function parseArgs(): { limit?: number; unprocessed?: boolean } {
  const args = process.argv.slice(2);
  const options: { limit?: number; unprocessed?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit' && i + 1 < args.length) {
      const limit = Number.parseInt(args[i + 1] ?? '5', 10);
      if (!Number.isNaN(limit) && limit > 0) {
        options.limit = limit;
      }
      i++;
    } else if (arg === '--unprocessed') {
      options.unprocessed = true;
    }
  }

  return options;
}

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  const options = parseArgs();
  const limit = options.limit ?? 5;
  const unprocessedOnly = options.unprocessed ?? false;

  console.log('Testing Jifeline Events API...');
  console.log(`Fetching ${limit} recent tickets.ticket.closed events`);
  if (unprocessedOnly) {
    console.log('Filter: unprocessed tickets only');
  }
  console.log('');

  try {
    // Load and validate configuration
    loadConfig();
    console.log('✓ Configuration loaded successfully');
  } catch (error) {
    console.error('✗ Configuration error:');
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
    } else {
      console.error(`  ${String(error)}`);
    }
    console.error('');
    console.error('Please check your environment variables in .env file.');
    process.exit(1);
  }

  const poller = new JifelineEventsPoller();

  try {
    console.log('Fetching events from Jifeline Events API...');
    console.log('');

    // Fetch events from last 7 days
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const ticketIds = await poller.pollClosedTickets(since, {
      limit,
      unprocessed_only: unprocessedOnly,
    });

    console.log('');
    console.log(`✓ Success! Found ${ticketIds.length} closed ticket(s)`);
    console.log('');

    if (ticketIds.length === 0) {
      console.log('No closed tickets found in the last 7 days.');
      console.log('');
      console.log('Possible reasons:');
      console.log('  - No tickets were closed in this time period');
      console.log('  - All tickets are marked as externally_processed=true');
      console.log('  - API permissions may limit event visibility');
      process.exit(0);
    }

    console.log('Ticket UUIDs found:');
    console.log('');
    ticketIds.forEach((ticketId, index) => {
      console.log(`  ${index + 1}. ${ticketId}`);
    });
    console.log('');

    console.log('💡 Test conversation retrieval with the first ticket:');
    console.log(`   npm run test:conversation -- ${ticketIds[0]}`);
    console.log('');

    // Show full event structure (fetch raw events to show structure)
    console.log('📋 Fetching full event structure for first ticket...');
    console.log('');

    // Re-fetch to get full event details
    const allTicketIds = await poller.pollClosedTickets(since, {
      limit: 1,
      unprocessed_only: false,
    });

    if (allTicketIds.length > 0) {
      console.log('Event structure (first event):');
      console.log('  - Event contains: type, occurred_at, payload');
      console.log('  - payload.ticket.id: Ticket UUID');
      console.log('  - payload.ticket.ticket_number: Ticket number');
      console.log('  - payload.ticket.externally_processed: Processing status');
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    console.log('');
    console.error('✗ Failed to fetch events from Jifeline Events API');

    if (error instanceof Error) {
      console.error('');
      console.error('Error:');
      console.error(`  ${error.message}`);
      
      // Show response body if available (for debugging API errors)
      if ('responseBody' in error && error.responseBody) {
        console.error('');
        console.error('API Response:');
        const body =
          typeof error.responseBody === 'string'
            ? error.responseBody
            : JSON.stringify(error.responseBody, null, 2);
        console.error(body);
      }
      
      if (error.stack) {
        console.error('');
        console.error('Stack trace:');
        console.error(error.stack);
      }
    } else {
      console.error('');
      console.error('Unknown Error:');
      console.error(`  ${String(error)}`);
    }

    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Verify JIFELINE_API_BASE_URL points to the correct environment');
    console.error('  2. Verify JIFELINE_CLIENT_ID and JIFELINE_CLIENT_SECRET are correct');
    console.error('  3. Verify JIFELINE_TOKEN_URL is accessible from your network');
    console.error('  4. Check that your API credentials have permission to access Events API');
    console.error('  5. Verify the Events API endpoint is available: GET /v2/system/events');

    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


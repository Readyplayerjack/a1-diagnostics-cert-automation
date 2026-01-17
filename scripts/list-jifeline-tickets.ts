#!/usr/bin/env node
/**
 * Jifeline Tickets List Utility
 *
 * Purpose:
 * Fetch a list of recent tickets from Jifeline API to discover ticket UUIDs
 * for testing and development purposes.
 *
 * Usage:
 *   npm run list:tickets                    # Default: --state closed --limit 20
 *   npm run list:tickets -- --limit 10      # Override limit, keep state=closed
 *   npm run list:tickets -- --state in_progress  # Override state, keep limit=20
 *   npm run list:tickets -- --limit 10 --state closed  # Explicit both
 *   npm run list:tickets -- --unprocessed   # Filter for unprocessed closed tickets (externally_processed=false)
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
 *   - Only performs read-only API calls to list tickets
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import {
  JifelineApiError,
  JifelineClientError,
  JifelineServerError,
  JifelineAuthError,
} from '../src/clients/jifeline-api-errors.js';
import { loadConfig } from '../src/config/index.js';
import type { Ticket } from '../src/models/ticket.js';

/**
 * Parses command line arguments for limit, state, and externally_processed filters.
 * Defaults: state = 'closed', limit = 20
 */
function parseArgs(): {
  limit: number;
  state?: Ticket['state'];
  externally_processed?: boolean;
} {
  const args = process.argv.slice(2);
  const options: {
    limit?: number;
    state?: Ticket['state'];
    externally_processed?: boolean;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit' && i + 1 < args.length) {
      const limit = Number.parseInt(args[i + 1] ?? '20', 10);
      if (!Number.isNaN(limit) && limit > 0) {
        options.limit = limit;
      }
      i++;
    } else if (arg === '--state' && i + 1 < args.length) {
      const state = args[i + 1] as Ticket['state'];
      if (
        state === 'prepared' ||
        state === 'pending' ||
        state === 'in_progress' ||
        state === 'outsourced' ||
        state === 'closed' ||
        state === 'cancelled'
      ) {
        options.state = state;
      }
      i++;
    } else if (arg === '--unprocessed') {
      // --unprocessed flag sets externally_processed=false for closed tickets
      options.externally_processed = false;
    }
  }

  return {
    limit: options.limit ?? 20,
    state: options.state, // Don't default to 'closed' - let API return all states if not specified
    externally_processed: options.externally_processed,
  };
}

/**
 * Formats a ticket row for table display.
 */
function formatTicketRow(ticket: Ticket, index: number): string {
  const ticketNumber = String(ticket.ticket_number).padEnd(10);
  const id = ticket.id; // Full UUID
  const state = ticket.state.padEnd(12);
  const finishedAt = ticket.finished_at
    ? new Date(ticket.finished_at).toISOString().split('T')[0]
    : 'N/A';
  const externallyProcessed = ticket.externally_processed ? 'Yes' : 'No';

  return `${String(index + 1).padStart(3)} | ${ticketNumber} | ${id} | ${state} | ${finishedAt.padEnd(10)} | ${externallyProcessed.padEnd(3)}`;
}

/**
 * Formats tickets as a readable table.
 */
function formatTicketsTable(tickets: Ticket[]): string {
  if (tickets.length === 0) {
    return 'No tickets found.';
  }

  const header =
    ' # | Ticket #   | ID                                      | State        | Finished   | Ext';
  const separator = '-'.repeat(header.length);

  const rows = tickets.map((ticket, index) => formatTicketRow(ticket, index));

  return [header, separator, ...rows].join('\n');
}

/**
 * Formats tickets as JSON.
 */
function formatTicketsJson(tickets: Ticket[]): string {
  const summary = tickets.map((ticket) => ({
    ticket_number: ticket.ticket_number,
    id: ticket.id,
    state: ticket.state,
    finished_at: ticket.finished_at,
    customer_id: ticket.customer_id,
    created_at: ticket.created_at,
  }));

  return JSON.stringify(summary, null, 2);
}

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  const options = parseArgs();
  const limit = options.limit;
  const state = options.state;
  const externallyProcessed = options.externally_processed;

  console.log('Fetching tickets from Jifeline API...');
  console.log(`Limit: ${limit}`);
  if (state) {
    console.log(`State filter: ${state}`);
  } else {
    console.log('State filter: (none - all states)');
  }
  if (externallyProcessed !== undefined) {
    console.log(`Externally processed filter: ${externallyProcessed}`);
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

  const client = new JifelineApiClient();

  try {
    console.log('Fetching tickets...');
    const tickets = await client.listTickets({
      limit,
      ...(state && { state }), // Only include state if it's defined
      externally_processed: externallyProcessed,
    });

    console.log('');
    console.log(`✓ Success! Found ${tickets.length} ticket(s)`);
    console.log('');

    // Display as table
    console.log('Tickets Table:');
    console.log('');
    console.log(formatTicketsTable(tickets));
    console.log('');

    // Also provide JSON format for easy copying
    console.log('Tickets JSON (for easy copying):');
    console.log('');
    console.log(formatTicketsJson(tickets));
    console.log('');

    if (tickets.length > 0) {
      console.log('💡 Tip: Use the ticket ID (UUID) with the connectivity check:');
      console.log(`   npm run check:jifeline -- ${tickets[0]?.id}`);
    }

    process.exit(0);
  } catch (error) {
    console.log('');
    console.error('✗ Failed to fetch tickets from Jifeline API');

    if (error instanceof JifelineAuthError) {
      console.error('');
      console.error('Authentication Error:');
      console.error(`  ${error.message}`);
      if (error.cause) {
        console.error(`  Cause: ${String(error.cause)}`);
      }
      console.error('');
      console.error('Please check:');
      console.error('  - JIFELINE_CLIENT_ID is correct');
      console.error('  - JIFELINE_CLIENT_SECRET is correct');
      console.error('  - JIFELINE_TOKEN_URL is correct and accessible');
    } else if (error instanceof JifelineClientError) {
      console.error('');
      console.error(`Client Error (${error.statusCode}):`);
      console.error(`  ${error.message}`);
      console.error('');
      if (error.responseBody) {
        const body =
          typeof error.responseBody === 'string'
            ? error.responseBody
            : JSON.stringify(error.responseBody, null, 2);
        console.error('Response details:');
        console.error(body);
        console.error('');
      }
      console.error('Please check:');
      console.error('  - Your API credentials are correct');
      console.error('  - Your API credentials have the required permissions');
      console.error('  - The query parameters are valid');
    } else if (error instanceof JifelineServerError) {
      console.error('');
      console.error(`Server Error (${error.statusCode}):`);
      console.error(`  ${error.message}`);
      console.error('');
      if (error.responseBody) {
        const body =
          typeof error.responseBody === 'string'
            ? error.responseBody
            : JSON.stringify(error.responseBody, null, 2);
        console.error('Response details:');
        console.error(body);
        console.error('');
      }
      console.error('This appears to be a server-side issue. Please try again later.');
    } else if (error instanceof JifelineApiError) {
      console.error('');
      console.error(`API Error (${error.statusCode}):`);
      console.error(`  ${error.message}`);
      console.error('');
      if (error.responseBody) {
        const body =
          typeof error.responseBody === 'string'
            ? error.responseBody
            : JSON.stringify(error.responseBody, null, 2);
        console.error('Response details:');
        console.error(body);
        console.error('');
      }
    } else if (error instanceof Error) {
      console.error('');
      console.error('Unexpected Error:');
      console.error(`  ${error.message}`);
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
    console.error('  4. Check that your API credentials have permission to list tickets');

    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


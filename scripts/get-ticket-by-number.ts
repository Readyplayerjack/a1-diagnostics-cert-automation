#!/usr/bin/env node
/**
 * Get Ticket by Number Script
 *
 * Purpose:
 * Fetch a ticket by ticket number to get its UUID for testing.
 * Useful when the list endpoint returns 0 results due to permissions.
 *
 * Usage:
 *   npx tsx scripts/get-ticket-by-number.ts 9111450
 *   # OR
 *   npm run get:ticket-by-number -- 9111450
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
 *   - Only performs read-only API calls
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import {
  JifelineApiError,
  JifelineNotFoundError,
  JifelineClientError,
  JifelineServerError,
  JifelineAuthError,
} from '../src/clients/jifeline-api-errors.js';
import { loadConfig } from '../src/config/index.js';

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  const ticketNumberArg = process.argv[2];
  const ticketNumber = ticketNumberArg ? Number.parseInt(ticketNumberArg, 10) : 9111450;

  if (Number.isNaN(ticketNumber) || ticketNumber <= 0) {
    console.error('Error: Invalid ticket number.');
    console.error('');
    console.error('Usage:');
    console.error('  npx tsx scripts/get-ticket-by-number.ts <ticket-number>');
    console.error('  # Example:');
    console.error('  npx tsx scripts/get-ticket-by-number.ts 9111450');
    console.error('');
    process.exit(1);
  }

  console.log('Fetching ticket by number...');
  console.log(`Ticket Number: ${ticketNumber}`);
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
    console.log('Fetching ticket from Jifeline API...');
    console.log(`Endpoint: GET /v2/tickets/tickets?ticket_number=${ticketNumber}&limit=1`);
    console.log('');

    let tickets: Awaited<ReturnType<typeof client.listTickets>>;
    try {
      tickets = await client.listTickets({
        limit: 1,
        ticket_number: ticketNumber,
      });
    } catch (listError) {
      // If listTickets throws an error, try getTicketById as fallback
      // But we need the UUID first, so this won't work
      console.log('');
      console.error('Error from listTickets:');
      throw listError;
    }

    console.log('');

    if (tickets.length === 0) {
      console.log('✗ No ticket found');
      console.log('');
      console.log('Possible reasons:');
      console.log(`  - Ticket number ${ticketNumber} does not exist`);
      console.log('  - Your API credentials do not have permission to access this ticket');
      console.log('  - Ticket may be in a different state or environment');
      console.log('  - API may require different query parameter format');
      console.log('');
      console.log('💡 Try checking the ticket in Jifeline UI to get the UUID directly');
      process.exit(1);
    }

    const ticket = tickets[0];
    if (!ticket) {
      console.log('✗ No ticket found');
      process.exit(1);
    }

    console.log('✓ Found ticket:');
    console.log('');
    console.log(`  Number: ${ticket.ticket_number}`);
    console.log(`  UUID: ${ticket.id}`);
    console.log(`  State: ${ticket.state}`);
    console.log(`  Customer ID: ${ticket.customer_id ?? 'N/A'}`);
    console.log(`  Finished At: ${ticket.finished_at ?? 'N/A'}`);
    console.log(`  Externally Processed: ${ticket.externally_processed ? 'Yes' : 'No'}`);
    console.log(`  Customer Channel ID: ${ticket.customer_channel_id ?? 'N/A'}`);
    console.log('');

    console.log('💡 Use this UUID to test conversation retrieval:');
    console.log(`   npm run test:conversation -- ${ticket.id}`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.log('');
    console.error('✗ Failed to fetch ticket from Jifeline API');

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
    } else if (error instanceof JifelineNotFoundError) {
      console.error('');
      console.error('Not Found (404):');
      console.error(`  ${error.message}`);
      console.error('');
      console.error(`Ticket number ${ticketNumber} may not exist or is not accessible.`);
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
    } else if (error instanceof JifelineServerError) {
      console.error('');
      console.error(`Server Error (${error.statusCode}):`);
      console.error(`  ${error.message}`);
      console.error('');
      console.error('This appears to be a server-side issue. Please try again later.');
    } else if (error instanceof JifelineApiError) {
      console.error('');
      console.error(`API Error (${error.statusCode}):`);
      console.error(`  ${error.message}`);
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
    console.error(`  4. Verify ticket number ${ticketNumber} exists in the Jifeline system`);

    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


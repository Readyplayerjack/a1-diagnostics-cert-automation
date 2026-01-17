#!/usr/bin/env node
/**
 * Test Conversation by Ticket Number Script
 *
 * Purpose:
 * Test conversation extraction using ticket number (e.g., 9111450) instead of UUID.
 * Automatically resolves ticket number to UUID and tests conversation retrieval.
 *
 * Usage:
 *   npm run test:conversation:number -- 9111450
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
 *   - Only performs read-only API calls to test conversation extraction
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
 * Extracts ticket number from command line arguments.
 */
function getTicketNumber(): number | null {
  const args = process.argv.slice(2);
  if (args.length === 0 || !args[0]?.trim()) {
    return null;
  }

  const ticketNumber = Number.parseInt(args[0].trim(), 10);
  if (Number.isNaN(ticketNumber) || ticketNumber <= 0) {
    return null;
  }

  return ticketNumber;
}

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  const ticketNumber = getTicketNumber();

  if (!ticketNumber) {
    console.error('Error: Ticket number is required.');
    console.error('');
    console.error('Usage:');
    console.error('  npm run test:conversation:number -- <ticket-number>');
    console.error('  # Example:');
    console.error('  npm run test:conversation:number -- 9111450');
    console.error('');
    process.exit(1);
  }

  console.log(`🔍 Looking up ticket #${ticketNumber}...`);
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
    // Search for ticket by number
    console.log(`Searching for ticket #${ticketNumber} in recent closed tickets...`);
    console.log('');

    // Fetch up to 100 recent closed tickets
    const tickets = await client.listTickets({
      limit: 100,
      state: 'closed',
    });

    // Find ticket with matching ticket_number
    const ticket = tickets.find((t) => t.ticket_number === ticketNumber);

    if (!ticket) {
      console.error('✗ Ticket not found');
      console.error('');
      console.error('Possible reasons:');
      console.error(`  - Ticket #${ticketNumber} does not exist`);
      console.error('  - Ticket is not in "closed" state');
      console.error('  - Ticket is not in the most recent 100 closed tickets');
      console.error('');
      console.error('Suggestions:');
      console.error('  - Verify the ticket number is correct');
      console.error('  - Check if the ticket is closed in Jifeline UI');
      console.error('  - Try using the ticket UUID directly:');
      console.error('    npm run test:conversation -- <ticket-uuid>');
      process.exit(1);
    }

    // Display ticket details
    console.log('✓ Found ticket:');
    console.log(`  UUID: ${ticket.id}`);
    console.log(`  State: ${ticket.state}`);
    console.log(`  Customer ID: ${ticket.customer_id ?? 'N/A'}`);
    console.log(`  Finished: ${ticket.finished_at ?? 'N/A'}`);
    console.log('');

    // Test conversation extraction
    console.log('📥 Fetching conversation text...');
    console.log('');

    const conversationText = await client.getTicketConversationText(ticket.id);

    if (conversationText === null) {
      console.log('○ No conversation text available');
      console.log('');
      console.log('Possible reasons:');
      console.log('  - Ticket has no customer_channel_id');
      console.log('  - Channel has no text messages');
      console.log('  - All messages are redacted or non-text type');
      process.exit(0);
    }

    // Display conversation text
    console.log('✓ Success! Conversation text retrieved:');
    console.log('');
    console.log('─'.repeat(60));
    console.log(conversationText);
    console.log('─'.repeat(60));
    console.log('');

    // Display statistics
    const characterCount = conversationText.length;
    const lineCount = conversationText.split('\n').filter((line) => line.trim().length > 0)
      .length;
    const wordCount = conversationText.split(/\s+/).filter((word) => word.length > 0).length;

    console.log('📊 Conversation Statistics:');
    console.log(`  Length: ${characterCount} characters`);
    console.log(`  Lines: ${lineCount}`);
    console.log(`  Words: ${wordCount}`);
    console.log('');

    console.log('✅ Conversation extraction test passed');
    process.exit(0);
  } catch (error) {
    console.log('');
    console.error('✗ Failed to test conversation extraction');

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
    } else if (error instanceof JifelineClientError) {
      console.error('');
      console.error(`Client Error (${error.statusCode}):`);
      console.error(`  ${error.message}`);
      if (error.responseBody) {
        const body =
          typeof error.responseBody === 'string'
            ? error.responseBody
            : JSON.stringify(error.responseBody, null, 2);
        console.error('');
        console.error('Response details:');
        console.error(body);
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
    console.error('  4. Check that your API credentials have permission to access tickets');

    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


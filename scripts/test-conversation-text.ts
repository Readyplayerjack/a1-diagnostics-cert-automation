#!/usr/bin/env node
/**
 * Test Conversation Text Retrieval Script
 *
 * Purpose:
 * Diagnostic tool to test getTicketConversationText() implementation
 * and verify conversation text can be retrieved from Jifeline API.
 *
 * Usage:
 *   npm run test:conversation -- <ticket-id>
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
 *   - Only tests conversation text retrieval
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
 * Extracts ticket ID from command line arguments or environment variable.
 */
function getTicketId(): string | null {
  // Check CLI arguments (skip 'node' and script path)
  const args = process.argv.slice(2);
  if (args.length > 0 && args[0]?.trim()) {
    return args[0].trim();
  }

  // Fall back to environment variable
  const envTicketId = process.env.TEST_JIFELINE_TICKET_ID;
  if (envTicketId?.trim()) {
    return envTicketId.trim();
  }

  return null;
}

/**
 * Redacts potentially sensitive content from text preview.
 * Replaces alphanumeric sequences with placeholder characters.
 */
function redactPreview(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const preview = text.substring(0, maxLength);
  // Simple redaction: replace alphanumeric sequences with X
  return preview.replace(/[A-Za-z0-9]{4,}/g, (match) => 'X'.repeat(Math.min(match.length, 8)));
}

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  const ticketId = getTicketId();

  if (!ticketId) {
    console.error('Error: Ticket ID is required.');
    console.error('');
    console.error('Usage:');
    console.error('  npm run test:conversation -- <ticket-id>');
    console.error('  # OR');
    console.error('  TEST_JIFELINE_TICKET_ID=<ticket-id> npm run test:conversation');
    console.error('');
    process.exit(1);
  }

  console.log('Testing conversation text retrieval...');
  console.log(`Ticket ID: ${ticketId}`);
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
    console.log('Fetching conversation text from Jifeline API...');
    console.log('');

    const conversationText = await client.getTicketConversationText(ticketId);

    console.log('✓ Success! Conversation text retrieved');
    console.log('');

    if (conversationText === null) {
      console.log('Result: No conversation text available');
      console.log('');
      console.log('Possible reasons:');
      console.log('  - Ticket has no customer_channel_id');
      console.log('  - Channel has no text messages');
      console.log('  - All messages are redacted or non-text type');
      console.log('');
      process.exit(0);
    }

    // Log summary statistics
    const characterCount = conversationText.length;
    const lineCount = conversationText.split('\n').length;
    const wordCount = conversationText.split(/\s+/).filter((word) => word.length > 0).length;

    console.log('Conversation Text Summary:');
    console.log(`  Character count: ${characterCount}`);
    console.log(`  Line count: ${lineCount}`);
    console.log(`  Word count: ${wordCount}`);
    console.log('');

    // Show first 200 characters (redacted)
    const preview = redactPreview(conversationText, 200);
    console.log('First 200 characters (redacted):');
    console.log('─'.repeat(50));
    console.log(preview);
    if (conversationText.length > 200) {
      console.log('...');
    }
    console.log('─'.repeat(50));
    console.log('');

    console.log('✓ Conversation text retrieval test passed');
    console.log('');
    console.log('💡 This conversation text can now be used by RealRegMileageExtractor');
    console.log('   for vehicle registration and mileage extraction.');

    process.exit(0);
  } catch (error) {
    console.log('');
    console.error('✗ Failed to fetch conversation text from Jifeline API');

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
      console.error('Possible reasons:');
      console.error(`  - Ticket ID "${ticketId}" does not exist`);
      console.error('  - Messenger channel not found');
      console.error('  - Your API credentials do not have permission to access this ticket');
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
      console.error('  - The ticket ID format is correct');
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
    console.error('  4. Check that your API credentials have permission to access tickets and messenger channels');
    console.error('  5. Verify the ticket ID exists and has a customer_channel_id');

    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


#!/usr/bin/env node
/**
 * Jifeline API Connectivity Check Script
 *
 * Purpose:
 * Simple command-line tool to verify Jifeline API access by fetching a single ticket.
 * Useful for validating credentials, base URL, and OAuth2 flow without running the full pipeline.
 *
 * Usage:
 *   npm run check:jifeline -- <ticket-id>
 *   # OR
 *   TEST_JIFELINE_TICKET_ID=<ticket-id> npm run check:jifeline
 *
 * Required Environment Variables:
 *   - JIFELINE_API_BASE_URL: Base URL for the Jifeline API (e.g., https://api.jifeline.com)
 *   - JIFELINE_CLIENT_ID: OAuth2 client ID
 *   - JIFELINE_CLIENT_SECRET: OAuth2 client secret
 *   - JIFELINE_TOKEN_URL: OAuth2 token endpoint URL (e.g., https://api.jifeline.com/oauth/token)
 *
 * This script:
 *   - Does NOT write to database
 *   - Does NOT generate PDFs
 *   - Does NOT call OpenAI or Supabase
 *   - Only performs a single read-only API call to verify connectivity
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
 * Formats a ticket summary for display.
 */
function formatTicketSummary(ticket: {
  id: string;
  ticket_number: number;
  state: string;
  customer_id: string | null;
  finished_at: string | null;
}): string {
  return JSON.stringify(
    {
      ticketId: ticket.id,
      ticket_number: ticket.ticket_number,
      status: ticket.state,
      customer_id: ticket.customer_id,
      finished_at: ticket.finished_at,
    },
    null,
    2
  );
}

/**
 * Formats error response body for display.
 */
function formatErrorBody(responseBody: unknown): string {
  if (typeof responseBody === 'string') {
    return responseBody;
  }
  if (typeof responseBody === 'object' && responseBody !== null) {
    // Try to extract common error fields
    const body = responseBody as Record<string, unknown>;
    const parts: string[] = [];

    if (body.type) {
      parts.push(`Type: ${String(body.type)}`);
    }
    if (body.title) {
      parts.push(`Title: ${String(body.title)}`);
    }
    if (body.detail) {
      parts.push(`Detail: ${String(body.detail)}`);
    }
    if (body.message) {
      parts.push(`Message: ${String(body.message)}`);
    }

    if (parts.length > 0) {
      return parts.join('\n');
    }

    // Fall back to JSON stringify
    return JSON.stringify(responseBody, null, 2);
  }
  return String(responseBody);
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
    console.error('  npm run check:jifeline -- <ticket-id>');
    console.error('  # OR');
    console.error('  TEST_JIFELINE_TICKET_ID=<ticket-id> npm run check:jifeline');
    console.error('');
    process.exit(1);
  }

  console.log('Checking Jifeline API connectivity...');
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
    console.error('Please check your environment variables:');
    console.error('  - JIFELINE_API_BASE_URL');
    console.error('  - JIFELINE_CLIENT_ID');
    console.error('  - JIFELINE_CLIENT_SECRET');
    console.error('  - JIFELINE_TOKEN_URL');
    process.exit(1);
  }

  const client = new JifelineApiClient();

  try {
    console.log('Fetching ticket from Jifeline API...');
    const ticket = await client.getTicketById(ticketId);

    console.log('');
    console.log('✓ Success! Ticket retrieved:');
    console.log(formatTicketSummary(ticket));
    console.log('');
    console.log('Jifeline API connectivity check passed.');
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
      if (error.responseBody) {
        console.error('Response details:');
        console.error(formatErrorBody(error.responseBody));
        console.error('');
      }
      console.error('Please check:');
      console.error(`  - Ticket ID "${ticketId}" exists in the Jifeline system`);
      console.error('  - Your API credentials have permission to access this ticket');
    } else if (error instanceof JifelineClientError) {
      console.error('');
      console.error(`Client Error (${error.statusCode}):`);
      console.error(`  ${error.message}`);
      console.error('');
      if (error.responseBody) {
        console.error('Response details:');
        console.error(formatErrorBody(error.responseBody));
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
        console.error('Response details:');
        console.error(formatErrorBody(error.responseBody));
        console.error('');
      }
      console.error('This appears to be a server-side issue. Please try again later.');
    } else if (error instanceof JifelineApiError) {
      console.error('');
      console.error(`API Error (${error.statusCode}):`);
      console.error(`  ${error.message}`);
      console.error('');
      if (error.responseBody) {
        console.error('Response details:');
        console.error(formatErrorBody(error.responseBody));
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
    console.error('  4. Check that your API credentials have permission to read tickets');
    console.error('  5. Verify the ticket ID exists and is accessible');

    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


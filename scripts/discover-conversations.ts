#!/usr/bin/env node
/**
 * Automated Conversation Discovery Script
 *
 * Purpose:
 * Automatically discover and test multiple tickets for conversation data.
 * Finds tickets with conversations and generates a test data set.
 *
 * Usage:
 *   npm run discover:conversations
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
 *   - Only performs read-only API calls to discover conversations
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import { loadConfig } from '../src/config/index.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Result for a single ticket conversation test.
 */
interface ConversationTestResult {
  ticket_number: number;
  ticket_id: string;
  state: string;
  finished_at: string | null;
  has_conversation: boolean;
  conversation_length: number | null;
  error: string | null;
}

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  console.log('🔍 Discovering tickets with conversations...');
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
    // Fetch recent closed tickets
    console.log('Fetching 50 recent closed tickets...');
    const tickets = await client.listTickets({
      limit: 50,
      state: 'closed',
    });

    console.log(`Found ${tickets.length} closed tickets. Testing conversations...`);
    console.log('');

    if (tickets.length === 0) {
      console.log('No closed tickets found. Exiting.');
      process.exit(0);
    }

    const results: ConversationTestResult[] = [];
    let successCount = 0;
    let noConversationCount = 0;
    let errorCount = 0;

    // Test each ticket
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const progress = `[${i + 1}/${tickets.length}]`;

      try {
        const conversationText = await client.getTicketConversationText(ticket.id);

        if (conversationText === null) {
          console.log(`○ ${progress} Ticket #${ticket.ticket_number}: No conversation`);
          results.push({
            ticket_number: ticket.ticket_number,
            ticket_id: ticket.id,
            state: ticket.state,
            finished_at: ticket.finished_at,
            has_conversation: false,
            conversation_length: null,
            error: null,
          });
          noConversationCount++;
        } else {
          const length = conversationText.length;
          console.log(
            `✓ ${progress} Ticket #${ticket.ticket_number}: ${length} chars`
          );
          results.push({
            ticket_number: ticket.ticket_number,
            ticket_id: ticket.id,
            state: ticket.state,
            finished_at: ticket.finished_at,
            has_conversation: true,
            conversation_length: length,
            error: null,
          });
          successCount++;
        }

        // Small delay to avoid rate limiting (50ms between requests)
        if (i < tickets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(
          `✗ ${progress} Ticket #${ticket.ticket_number}: Error: ${errorMessage}`
        );
        results.push({
          ticket_number: ticket.ticket_number,
          ticket_id: ticket.id,
          state: ticket.state,
          finished_at: ticket.finished_at,
          has_conversation: false,
          conversation_length: null,
          error: errorMessage,
        });
        errorCount++;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 DISCOVERY SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total tickets tested: ${tickets.length}`);
    console.log(`✓ With conversations: ${successCount}`);
    console.log(`○ Without conversations: ${noConversationCount}`);
    console.log(`✗ Errors: ${errorCount}`);
    console.log('');

    // List tickets with conversations
    const ticketsWithConversations = results.filter((r) => r.has_conversation);
    if (ticketsWithConversations.length > 0) {
      console.log('📝 TICKETS WITH CONVERSATIONS:');
      ticketsWithConversations.forEach((result) => {
        console.log(
          `  #${result.ticket_number} (${result.conversation_length} chars) - UUID: ${result.ticket_id}`
        );
      });
      console.log('');
    }

    // Export results to JSON
    const outputPath = join(process.cwd(), 'discovery-results.json');
    writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`📄 Full results exported to discovery-results.json`);
    console.log('');

    // Display usage tip
    if (ticketsWithConversations.length > 0) {
      const firstTicket = ticketsWithConversations[0];
      console.log('💡 TIP: Test a specific ticket with:');
      console.log(`   npm run test:conversation:number -- ${firstTicket.ticket_number}`);
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    console.log('');
    console.error('✗ Failed to discover conversations');

    if (error instanceof Error) {
      console.error('');
      console.error('Error:');
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


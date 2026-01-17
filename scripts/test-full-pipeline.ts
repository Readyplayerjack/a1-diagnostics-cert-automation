#!/usr/bin/env node
/**
 * Full Pipeline Test Script
 *
 * Purpose:
 * Test the complete end-to-end flow from ticket number to PDF generation.
 * Validates the entire certificate automation pipeline.
 *
 * Usage:
 *   npm run test:pipeline -- 9111450
 *
 * Required Environment Variables:
 *   - All Jifeline API variables (for ticket fetching)
 *   - All Supabase variables (for certificate storage)
 *   - All OpenAI variables (for reg/mileage extraction)
 *   - DATABASE_URL (for processed_tickets tracking)
 *
 * This script:
 *   - Tests the full certificate generation pipeline
 *   - Generates real PDFs
 *   - Uploads to Supabase storage
 *   - Records in database
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import { createTicketProcessingService } from '../src/services/service-factory.js';
import { loadConfig } from '../src/config/index.js';
import {
  JifelineApiError,
  JifelineNotFoundError,
  JifelineClientError,
  JifelineServerError,
  JifelineAuthError,
} from '../src/clients/jifeline-api-errors.js';

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
    console.error('  npm run test:pipeline -- <ticket-number>');
    console.error('  # Example:');
    console.error('  npm run test:pipeline -- 9111450');
    console.error('');
    process.exit(1);
  }

  console.log(`🚀 Testing full pipeline for ticket #${ticketNumber}...`);
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

  const apiClient = new JifelineApiClient();

  try {
    // Step 0: Resolve ticket number to UUID
    console.log(`🔍 Looking up ticket #${ticketNumber}...`);
    console.log('');

    const tickets = await apiClient.listTickets({
      limit: 100,
      state: 'closed',
    });

    const ticket = tickets.find((t) => t.ticket_number === ticketNumber);

    if (!ticket) {
      console.error('✗ Ticket not found');
      console.error('');
      console.error('Possible reasons:');
      console.error(`  - Ticket #${ticketNumber} does not exist`);
      console.error('  - Ticket is not in "closed" state');
      console.error('  - Ticket is not in the most recent 100 closed tickets');
      process.exit(1);
    }

    console.log(`✓ Found ticket UUID: ${ticket.id}`);
    console.log(`  State: ${ticket.state}`);
    console.log(`  Customer ID: ${ticket.customer_id ?? 'N/A'}`);
    console.log(`  Finished: ${ticket.finished_at ?? 'N/A'}`);
    console.log('');

    // Create processing service
    const processingService = createTicketProcessingService();

    // Track extracted data (we'll need to access it from the service)
    // For now, we'll just process and check the result
    console.log('📋 Step 1: Fetching ticket details...');
    console.log('📥 Step 2: Extracting conversation...');
    console.log('🔍 Step 3: Extracting reg/mileage...');
    console.log('📄 Step 4: Generating PDF...');
    console.log('☁️  Step 5: Uploading to storage...');
    console.log('💾 Step 6: Recording in database...');
    console.log('');

    // Process the ticket
    await processingService.processClosedTicket(ticket.id);

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ PIPELINE TEST COMPLETE');
    console.log('='.repeat(60));
    console.log('Status: SUCCESS');
    console.log('');
    console.log('Note: Check the processed_tickets table for full details:');
    console.log(`  - Ticket ID: ${ticket.id}`);
    console.log(`  - Ticket Number: ${ticket.ticket_number}`);
    console.log('');
    console.log('💡 To view the certificate, check Supabase Storage:');
    console.log(`   certificates/${ticket.ticket_number}-${ticket.id}.pdf`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.log('');
    console.error('✗ Pipeline test failed');

    if (error instanceof JifelineAuthError) {
      console.error('');
      console.error('Authentication Error:');
      console.error(`  ${error.message}`);
    } else if (error instanceof JifelineNotFoundError) {
      console.error('');
      console.error('Not Found (404):');
      console.error(`  ${error.message}`);
    } else if (error instanceof JifelineClientError) {
      console.error('');
      console.error(`Client Error (${error.statusCode}):`);
      console.error(`  ${error.message}`);
    } else if (error instanceof JifelineServerError) {
      console.error('');
      console.error(`Server Error (${error.statusCode}):`);
      console.error(`  ${error.message}`);
    } else if (error instanceof JifelineApiError) {
      console.error('');
      console.error(`API Error (${error.statusCode}):`);
      console.error(`  ${error.message}`);
    } else if (error instanceof Error) {
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
    console.error('  1. Verify all environment variables are set correctly');
    console.error('  2. Check that the ticket exists and is closed');
    console.error('  3. Verify API credentials have required permissions');
    console.error('  4. Check database connection and Supabase storage access');

    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


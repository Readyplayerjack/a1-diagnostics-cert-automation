#!/usr/bin/env node
/**
 * Live Real Ticket Diagnostic
 *
 * Purpose:
 * Test the FULL pipeline with a real ticket ID.
 * Fetches ticket, conversation, runs GPT extraction, validates data.
 *
 * Usage:
 *   npm run diagnostic:ticket <TICKET_ID>
 *
 * Example:
 *   npm run diagnostic:ticket abc12345-def6-7890-ghij-klmnopqrstuv
 */

import { JifelineApiClient } from '../../src/clients/jifeline-api-client.js';
import { RealRegMileageExtractor } from '../../src/services/reg-mileage-extractor.js';
import { HttpOpenAiExtractionClient } from '../../src/clients/openai-extraction-client.js';
import { loadConfig } from '../../src/config/index.js';

function getTicketId(): string | null {
  const args = process.argv.slice(2);
  if (args.length > 0 && args[0]?.trim()) {
    return args[0].trim();
  }
  return null;
}

async function main(): Promise<void> {
  const ticketId = getTicketId();

  if (!ticketId) {
    console.error('Error: Ticket ID is required.');
    console.error('');
    console.error('Usage:');
    console.error('  npm run diagnostic:ticket <TICKET_ID>');
    console.error('');
    console.error('Example:');
    console.error('  npm run diagnostic:ticket abc12345-def6-7890-ghij-klmnopqrstuv');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎫 REAL TICKET DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Ticket ID: ${ticketId}`);
  console.log('');

  try {
    loadConfig();
    console.log('✓ Configuration loaded\n');
  } catch (err) {
    console.error('✗ Configuration error:');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const apiClient = new JifelineApiClient();
  const openAiClient = new HttpOpenAiExtractionClient();
  const extractor = new RealRegMileageExtractor(apiClient, openAiClient);

  try {
    // Step 1: Fetch ticket
    console.log('📋 Step 1: Fetching ticket from Jifeline...');
    const ticket = await apiClient.getTicketById(ticketId);
    console.log(`✓ Ticket found: #${ticket.ticket_number}`);
    console.log(`  State: ${ticket.state}`);
    console.log(`  Customer ID: ${ticket.customer_id || 'N/A'}`);
    console.log(`  Finished: ${ticket.finished_at || 'N/A'}`);
    console.log('');

    // Step 2: Fetch conversation
    console.log('💬 Step 2: Fetching conversation...');
    const conversationText = await apiClient.getTicketConversationText(ticketId);
    
    if (!conversationText) {
      console.log('⚠️  No conversation text available');
      console.log('  (This is expected for tickets without messenger conversations)');
      console.log('');
      console.log('📊 Extraction Result:');
      console.log('  Registration: null (no conversation)');
      console.log('  Mileage: null (no conversation)');
      process.exit(0);
    }

    console.log(`✓ Conversation retrieved (${conversationText.length} characters)`);
    console.log('');
    console.log('First 200 characters:');
    console.log('─'.repeat(50));
    console.log(conversationText.substring(0, 200) + (conversationText.length > 200 ? '...' : ''));
    console.log('─'.repeat(50));
    console.log('');

    // Step 3: Run extraction
    console.log('🔍 Step 3: Running GPT extraction...');
    const extractionResult = await extractor.extract({
      ticketId,
      ticketNumber: ticket.ticket_number,
      conversationText,
    });

    console.log('✓ Extraction complete');
    console.log('');

    // Step 4: Validate and display results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 EXTRACTION RESULTS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    console.log('Vehicle Registration:');
    console.log(`  Value: ${extractionResult.vehicleRegistration || 'null'}`);
    console.log(`  Confidence: ${extractionResult.registrationConfidence.toFixed(2)}`);
    
    if (extractionResult.vehicleRegistration) {
      const isValid = /^[A-Z]{2}\d{2}\s?[A-Z]{3}$/.test(
        extractionResult.vehicleRegistration.replace(/\s+/g, '')
      );
      console.log(`  Format Valid: ${isValid ? '✓' : '✗'}`);
    }
    console.log('');

    console.log('Vehicle Mileage:');
    console.log(`  Value: ${extractionResult.vehicleMileage || 'null'}`);
    console.log(`  Confidence: ${extractionResult.mileageConfidence.toFixed(2)}`);
    
    if (extractionResult.vehicleMileage) {
      const mileageNum = Number.parseFloat(extractionResult.vehicleMileage.replace(/,/g, ''));
      const isValid = !Number.isNaN(mileageNum) && mileageNum >= 0 && mileageNum <= 500000;
      console.log(`  Range Valid: ${isValid ? '✓' : '✗'} (0-500,000)`);
    }
    console.log('');

    if (extractionResult.errors.length > 0) {
      console.log('⚠️  Extraction Warnings/Errors:');
      extractionResult.errors.forEach((err) => {
        console.log(`  - [${err.severity}] ${err.code}: ${err.message}`);
      });
      console.log('');
    }

    if (extractionResult.sourceSnippets) {
      console.log('📍 Source Snippets:');
      if (extractionResult.sourceSnippets.registration) {
        console.log(`  Registration: "${extractionResult.sourceSnippets.registration.substring(0, 100)}..."`);
      }
      if (extractionResult.sourceSnippets.mileage) {
        console.log(`  Mileage: "${extractionResult.sourceSnippets.mileage.substring(0, 100)}..."`);
      }
      console.log('');
    }

    // Data quality assessment
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ DATA QUALITY ASSESSMENT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    const hasReg = !!extractionResult.vehicleRegistration;
    const hasMileage = !!extractionResult.vehicleMileage;
    const regConfident = extractionResult.registrationConfidence >= 0.5;
    const mileageConfident = extractionResult.mileageConfidence >= 0.5;

    console.log(`Registration: ${hasReg ? '✓ Extracted' : '✗ Missing'}`);
    if (hasReg) {
      console.log(`  Confidence: ${regConfident ? '✓ High' : '⚠️  Low (< 0.5)'}`);
    }

    console.log(`Mileage: ${hasMileage ? '✓ Extracted' : '✗ Missing'}`);
    if (hasMileage) {
      console.log(`  Confidence: ${mileageConfident ? '✓ High' : '⚠️  Low (< 0.5)'}`);
    }

    console.log('');

    if (hasReg && hasMileage && regConfident && mileageConfident) {
      console.log('✅ EXCELLENT: Both values extracted with high confidence');
    } else if (hasReg && hasMileage) {
      console.log('⚠️  PARTIAL: Values extracted but confidence is low');
    } else if (hasReg || hasMileage) {
      console.log('⚠️  INCOMPLETE: Only one value extracted');
    } else {
      console.log('✗ FAILED: No values extracted');
    }

    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('✗ Diagnostic failed:');
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

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

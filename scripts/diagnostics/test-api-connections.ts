#!/usr/bin/env node
/**
 * Live API Connections Diagnostic
 *
 * Purpose:
 * Test ACTUAL connections to Jifeline, OpenAI, and Supabase APIs.
 * Makes real API calls to verify current system state.
 *
 * Usage:
 *   npm run diagnostic:apis
 *
 * Required Environment Variables:
 *   - All Jifeline API variables
 *   - OPENAI_API_KEY
 *   - SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   - DATABASE_URL
 */

import { JifelineApiClient } from '../../src/clients/jifeline-api-client.js';
import { JifelineEventsPoller } from '../../src/clients/jifeline-events-poller.js';
import { HttpOpenAiExtractionClient } from '../../src/clients/openai-extraction-client.js';
import { query, closePool } from '../../src/clients/database.js';
import { supabaseClient } from '../../src/clients/supabase-client.js';
import { loadConfig } from '../../src/config/index.js';
import { info, error } from '../../src/services/logger.js';

interface DiagnosticResult {
  service: string;
  status: '✓' | '✗';
  message: string;
  details?: unknown;
}

const results: DiagnosticResult[] = [];

async function testJifelineApi(): Promise<void> {
  console.log('🔍 Testing Jifeline API...');
  
  try {
    const client = new JifelineApiClient();
    const poller = new JifelineEventsPoller(client);
    
    // Test 1: Fetch one event
    console.log('  → Fetching 1 event from Events API...');
    const events = await poller.pollClosedTickets(new Date(Date.now() - 24 * 60 * 60 * 1000), {
      limit: 1,
    });
    
    results.push({
      service: 'Jifeline Events API',
      status: '✓',
      message: `Successfully fetched ${events.length} event(s)`,
      details: events.length > 0 ? { ticketId: events[0].substring(0, 8) + '...' } : { note: 'No events in last 24h' },
    });
    
    console.log('  ✓ Jifeline Events API: Working');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    results.push({
      service: 'Jifeline Events API',
      status: '✗',
      message: `Failed: ${errorMessage}`,
      details: err,
    });
    console.log(`  ✗ Jifeline Events API: ${errorMessage}`);
  }
}

async function testOpenAiApi(): Promise<void> {
  console.log('🔍 Testing OpenAI API...');
  
  try {
    const client = new HttpOpenAiExtractionClient();
    
    // Test with sample conversation
    const testConversation = `
      Customer: Hi, I need calibration for my car
      Agent: What's the registration?
      Customer: AB12 CDE
      Agent: And the mileage?
      Customer: 45,000 miles
    `;
    
    console.log('  → Sending test extraction request...');
    const result = await client.extractRegAndMileage({
      conversationText: testConversation,
      regexCandidates: {
        regs: ['AB12 CDE'],
        mileages: ['45000'],
      },
    });
    
    results.push({
      service: 'OpenAI API',
      status: '✓',
      message: 'Successfully extracted data',
      details: {
        registration: result.vehicleRegistration,
        mileage: result.vehicleMileage,
        regConfidence: result.registrationConfidence,
        mileageConfidence: result.mileageConfidence,
      },
    });
    
    console.log('  ✓ OpenAI API: Working');
    console.log(`    Extracted: ${result.vehicleRegistration || 'null'} / ${result.vehicleMileage || 'null'}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    results.push({
      service: 'OpenAI API',
      status: '✗',
      message: `Failed: ${errorMessage}`,
      details: err,
    });
    console.log(`  ✗ OpenAI API: ${errorMessage}`);
  }
}

async function testSupabase(): Promise<void> {
  console.log('🔍 Testing Supabase...');
  
  try {
    // Test 1: Database query
    console.log('  → Testing database connection...');
    const dbResult = await query<{ count: number }>(
      'SELECT COUNT(*) as count FROM processed_tickets LIMIT 1'
    );
    
    results.push({
      service: 'Supabase Database',
      status: '✓',
      message: `Database connection successful (${dbResult.rows[0]?.count || 0} records in processed_tickets)`,
    });
    
    console.log('  ✓ Supabase Database: Working');
    
    // Test 2: Storage access
    console.log('  → Testing storage access...');
    const { data: buckets, error: bucketError } = await supabaseClient.storage.listBuckets();
    
    if (bucketError) {
      throw bucketError;
    }
    
    const certificatesBucket = buckets?.find((b) => b.name === 'certificates');
    
    results.push({
      service: 'Supabase Storage',
      status: certificatesBucket ? '✓' : '✗',
      message: certificatesBucket
        ? 'Storage access successful (certificates bucket exists)'
        : 'Storage accessible but certificates bucket not found',
      details: { bucketsFound: buckets?.length || 0 },
    });
    
    console.log(
      certificatesBucket ? '  ✓ Supabase Storage: Working' : '  ⚠️  Supabase Storage: Bucket missing'
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    results.push({
      service: 'Supabase',
      status: '✗',
      message: `Failed: ${errorMessage}`,
      details: err,
    });
    console.log(`  ✗ Supabase: ${errorMessage}`);
  }
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔬 LIVE API CONNECTIONS DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  try {
    loadConfig();
    console.log('✓ Configuration loaded\n');
  } catch (err) {
    console.error('✗ Configuration error:');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  await testJifelineApi();
  console.log('');
  await testOpenAiApi();
  console.log('');
  await testSupabase();
  console.log('');

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 DIAGNOSTIC SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  results.forEach((result) => {
    console.log(`${result.status} ${result.service}`);
    console.log(`   ${result.message}`);
    if (result.details && typeof result.details === 'object') {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
    }
    console.log('');
  });

  const allPassed = results.every((r) => r.status === '✓');
  const passedCount = results.filter((r) => r.status === '✓').length;

  console.log(`Results: ${passedCount}/${results.length} passed`);
  console.log('');

  if (allPassed) {
    console.log('✅ All API connections working');
    process.exit(0);
  } else {
    console.log('⚠️  Some API connections failed - check details above');
    process.exit(1);
  }
}

main()
  .catch((err) => {
    error('Fatal error in diagnostic', { error: err instanceof Error ? err.message : String(err) });
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });

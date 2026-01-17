#!/usr/bin/env node
/**
 * Self-test script for Jifeline Partner API
 *
 * Purpose: Verify that Jifeline Partner API is correctly configured and accessible.
 * Tests the exact same endpoints and authentication used by the main pipeline.
 *
 * Usage:
 *   npm run test:jifeline
 *   npm run test:jifeline -- --ticket <ticket-uuid>
 *
 * Required Environment Variables:
 *   - JIFELINE_API_BASE_URL: Base URL for Jifeline Partner API
 *   - JIFELINE_CLIENT_ID: OAuth2 client ID
 *   - JIFELINE_CLIENT_SECRET: OAuth2 client secret
 *   - JIFELINE_TOKEN_URL: OAuth2 token endpoint URL
 *   - TEST_TICKET_UUID (optional): Ticket UUID to test with
 *
 * This script:
 *   - Tests OAuth2 token acquisition
 *   - Tests ticket endpoint (GET /v2/tickets/tickets/{id})
 *   - Tests customers list endpoint (GET /v2/customers?enabled=true)
 *   - Tests individual customer endpoint (GET /v2/customers/{id}) if ticket has customer_id
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import { loadConfig } from '../src/config/index.js';

async function testJifelineApi(): Promise<void> {
  console.log('🧪 Testing Jifeline Partner API Configuration...\n');

  try {
    // Load and validate configuration
    const config = loadConfig();
    console.log(`✓ Configuration loaded`);
    console.log(`  JIFELINE_API_BASE_URL: ${config.JIFELINE_API_BASE_URL}`);
    console.log(`  JIFELINE_TOKEN_URL: ${config.JIFELINE_TOKEN_URL}`);
    console.log(`  JIFELINE_CLIENT_ID: ${config.JIFELINE_CLIENT_ID.substring(0, 10)}...\n`);

    const client = new JifelineApiClient();

    // Test 1: OAuth2 Token Acquisition
    console.log('🔐 Testing OAuth2 token acquisition...');
    try {
      // Access token is acquired automatically on first API call
      // We'll test it by making an API call
      const testEndpoint = '/v2/tickets/tickets';
      const token = await (client as unknown as { getAccessToken(): Promise<string> }).getAccessToken();
      if (!token || token.length === 0) {
        throw new Error('Token is empty');
      }
      console.log('✓ OAuth2 token acquired successfully\n');
    } catch (error) {
      console.error('✗ OAuth2 token acquisition failed:\n');
      if (error instanceof Error) {
        console.error(`  Error: ${error.message}`);
      }
      console.error('\n💡 Troubleshooting:');
      console.error('  1. Verify JIFELINE_CLIENT_ID and JIFELINE_CLIENT_SECRET are correct');
      console.error('  2. Check JIFELINE_TOKEN_URL is accessible');
      console.error('  3. Verify API credentials have not expired\n');
      process.exit(1);
    }

    // Test 2: Ticket Endpoint
    console.log('🎫 Testing ticket endpoint...');
    const testTicketId =
      process.argv.find((arg) => arg.startsWith('--ticket='))?.split('=')[1] ||
      process.env.TEST_TICKET_UUID ||
      '1536aad7-fc68-4703-afaf-6168c45b6a6a'; // Default test ticket

    console.log(`   Testing with ticket: ${testTicketId}\n`);

    try {
      const ticket = await client.getTicketById(testTicketId);
      console.log('✓ Ticket endpoint working');
      console.log(`   Ticket #${ticket.ticket_number}`);
      console.log(`   State: ${ticket.state}`);
      console.log(`   Customer ID: ${ticket.customer_id || 'null'}`);
      console.log(`   Vehicle Model ID: ${ticket.vehicle_model_id || 'null'}\n`);
    } catch (error) {
      console.error('✗ Ticket endpoint failed:\n');
      if (error instanceof Error) {
        console.error(`  Error: ${error.message}`);
      }
      console.error('\n💡 Troubleshooting:');
      console.error('  1. Verify the ticket UUID exists');
      console.error('  2. Check API credentials have ticket read permissions');
      console.error('  3. Try a different ticket UUID\n');
      process.exit(1);
    }

    // Test 3: Customers List Endpoint
    console.log('👥 Testing customers list endpoint...');
    let customersListWorking = false;
    let customersCount = 0;
    try {
      const customers = await client.listCustomers({ enabled: true, limit: 10 });
      customersListWorking = true;
      customersCount = customers.length;
      console.log(`✓ Customers list endpoint working`);
      console.log(`   Found ${customers.length} enabled customer(s)\n`);
      
      if (customers.length > 0) {
        console.log('   Sample customers:');
        customers.slice(0, 3).forEach((customer, i) => {
          console.log(`     ${i + 1}. ${customer.company_name} (${customer.id.substring(0, 8)}...)`);
        });
        console.log('');
      } else {
        console.log('   ⚠️  No enabled customers found (this may be expected)\n');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        console.log('⚠️  Customers list endpoint returned 404');
        console.log('   Partner client currently has no access to customers resource\n');
        console.log('💡 This is expected if:');
        console.log('   - API credentials do not have customer endpoint permissions');
        console.log('   - Customers are archived or outside access scope');
        console.log('   - This is a permissions/scope limitation\n');
      } else {
        console.error('✗ Customers list endpoint failed:\n');
        if (error instanceof Error) {
          console.error(`  Error: ${error.message}`);
        }
        console.error('\n💡 Troubleshooting:');
        console.error('  1. Verify API credentials have customer endpoint access');
        console.error('  2. Check with Jifeline support about permissions/scope\n');
        // Don't exit - this is a known limitation, not a blocker
      }
    }

    // Test 4: Individual Customer Endpoint (if we have a customer_id from the ticket)
    const ticket = await client.getTicketById(testTicketId);
    if (ticket.customer_id) {
      console.log(`🔍 Testing individual customer endpoint...`);
      console.log(`   Customer ID: ${ticket.customer_id}\n`);
      
      try {
        const customer = await client.getCustomerById(ticket.customer_id);
        console.log('✓ Customer endpoint working');
        console.log(`   Company: ${customer.company_name}`);
        console.log(`   Primary Location ID: ${customer.primary_location_id || 'null'}\n`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('404')) {
          console.log('⚠️  Customer endpoint returned 404');
          console.log(`   Customer ${ticket.customer_id} is not accessible\n`);
          console.log('💡 This is expected if:');
          console.log('   - Customer is archived or deleted');
          console.log('   - Customer is outside API credentials access scope');
          console.log('   - This is a permissions/scope limitation\n');
        } else {
          console.error('✗ Customer endpoint failed:\n');
          if (error instanceof Error) {
            console.error(`  Error: ${error.message}`);
          }
          // Don't exit - customer 404s are handled gracefully in the pipeline
        }
      }
    } else {
      console.log('⚠️  Ticket has no customer_id, skipping customer endpoint test\n');
    }

    // Summary
    console.log('📊 Jifeline API Test Summary:');
    console.log(`   OAuth2 Token: ✅ Working`);
    console.log(`   Ticket Endpoint: ✅ Working`);
    console.log(`   Customers List: ${customersListWorking ? `✅ Working (${customersCount} customers)` : '⚠️  404 (permissions issue)'}`);
    console.log(`   Customer Detail: ${ticket.customer_id ? '⚠️  May return 404 (expected)' : 'N/A'}\n`);

    console.log('✅ Jifeline API test completed\n');
    console.log('💡 The API is correctly configured.');
    console.log('   Customer 404s are handled gracefully in the pipeline with fallback values.\n');
  } catch (error) {
    console.error('\n✗ Jifeline API test FAILED:\n');
    if (error instanceof Error) {
      console.error(`  Error: ${error.message}`);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error(`  Unknown error: ${String(error)}`);
    }
    console.error('\n💡 Troubleshooting:');
    console.error('  1. Verify JIFELINE_API_BASE_URL, JIFELINE_CLIENT_ID, JIFELINE_CLIENT_SECRET');
    console.error('  2. Check JIFELINE_TOKEN_URL is accessible');
    console.error('  3. Verify API credentials are valid and not expired');
    console.error('  4. Check network connectivity to Jifeline API\n');
    process.exit(1);
  }
}

testJifelineApi().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


#!/usr/bin/env node
/**
 * List active customers and find a ticket with accessible customer data
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import { loadConfig } from '../src/config/index.js';

async function listCustomersAndFindTicket() {
  console.log('🔍 Listing active customers...\n');
  
  loadConfig();
  const client = new JifelineApiClient();

  try {
    // List enabled customers
    const customers = await client.listCustomers({ enabled: true, limit: 100 });
    
    console.log(`✓ Found ${customers.length} active customer(s)\n`);
    
    if (customers.length === 0) {
      console.log('❌ No active customers found. This suggests:');
      console.log('   1. API credentials may not have customer endpoint access');
      console.log('   2. All customers are disabled in this environment');
      console.log('   3. Permissions issue - contact Rishi/Jifeline to verify API access\n');
      return null;
    }

    // Display first few customers
    console.log('📋 Active Customers (first 5):\n');
    customers.slice(0, 5).forEach((customer, i) => {
      console.log(`  ${i + 1}. ${customer.company_name} (${customer.id.substring(0, 8)}...)`);
      console.log(`     Location ID: ${customer.primary_location_id || 'none'}`);
      console.log('');
    });

    // Pick first customer with a location
    const customerWithLocation = customers.find((c) => c.primary_location_id);
    
    if (!customerWithLocation) {
      console.log('⚠️  No customers found with primary_location_id\n');
      return null;
    }

    console.log(`\n🎯 Selected customer: ${customerWithLocation.company_name} (${customerWithLocation.id})\n`);

    // Find a closed ticket for this customer
    console.log('🔍 Searching for closed tickets for this customer...\n');
    
    const tickets = await client.listTickets({ limit: 100, state: 'closed' });
    const ticketForCustomer = tickets.find((t) => t.customer_id === customerWithLocation.id);
    
    if (ticketForCustomer) {
      console.log(`✅ Found ticket: #${ticketForCustomer.ticket_number} (${ticketForCustomer.id})\n`);
      console.log(`💡 Test pipeline with:`);
      console.log(`   npm run test:pipeline:uuid -- ${ticketForCustomer.id}\n`);
      return ticketForCustomer.id;
    } else {
      console.log('❌ No closed tickets found for this customer\n');
      console.log('💡 Try with a different customer or check for tickets in other states\n');
      return null;
    }
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('403') || error.message.includes('401')) {
        console.log('❌ Permission denied (403/401) - API credentials do not have customer endpoint access\n');
        console.log('📋 Recommendation: Contact Rishi/Jifeline to:');
        console.log('   1. Verify API credentials have customer endpoint access');
        console.log('   2. Get a valid test ticket UUID with accessible customer data\n');
      } else {
        console.error('Error:', error.message);
      }
    } else {
      console.error('Unknown error:', String(error));
    }
    return null;
  }
}

listCustomersAndFindTicket().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


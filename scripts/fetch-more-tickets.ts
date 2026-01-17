#!/usr/bin/env node
/**
 * Fetch more recent closed tickets to find one with complete data
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import { loadConfig } from '../src/config/index.js';

async function fetchMoreTickets() {
  console.log('🔍 Fetching more recent closed tickets...\n');
  
  loadConfig();
  const client = new JifelineApiClient();

  // Try to get tickets via listTickets
  try {
    console.log('📋 Fetching closed tickets via listTickets...\n');
    const tickets = await client.listTickets({ limit: 20, state: 'closed' });
    
    console.log(`✓ Found ${tickets.length} closed ticket(s)\n`);
    
    if (tickets.length === 0) {
      console.log('❌ No closed tickets found via listTickets\n');
      return;
    }

    // Check first few tickets for customer data
    console.log('🔍 Checking customer data for first 5 tickets...\n');
    const ticketsToCheck = tickets.slice(0, 5);
    
    for (const ticket of ticketsToCheck) {
      const customerId = ticket.customer_id;
      if (!customerId) {
        console.log(`○ Ticket #${ticket.ticket_number} (${ticket.id.substring(0, 8)}...): No customer_id`);
        continue;
      }

      try {
        await client.getCustomerById(customerId);
        console.log(`✓ Ticket #${ticket.ticket_number} (${ticket.id.substring(0, 8)}...): Customer exists!`);
        console.log(`  💡 Test with: npm run test:pipeline:uuid -- ${ticket.id}\n`);
        return ticket.id;
      } catch (err) {
        console.log(`✗ Ticket #${ticket.ticket_number} (${ticket.id.substring(0, 8)}...): Customer not found`);
      }
      
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    
    console.log('\n❌ No tickets found with valid customer data in first 5 results\n');
  } catch (error) {
    console.error('Error fetching tickets:', error instanceof Error ? error.message : String(error));
  }
}

fetchMoreTickets().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


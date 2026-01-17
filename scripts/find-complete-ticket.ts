#!/usr/bin/env node
/**
 * Find a closed ticket with complete data (customer, vehicle) for pipeline testing
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import { loadConfig } from '../src/config/index.js';

const ticketIds = [
  'fc2a1717-b5f2-4e28-a4d7-6c5085430073',
  'fd823e53-c49e-4263-af1c-305e69ba95b6',
  'cf2d79eb-2864-4410-ab71-57564190a2e3',
  '1536aad7-fc68-4703-afaf-6168c45b6a6a',
  'c4580577-20a1-45f7-b477-6378813d72c1',
];

async function checkTicket(client: JifelineApiClient, ticketId: string) {
  try {
    const ticket = await client.getTicketById(ticketId);
    const customerId = ticket.customer_id;
    
    if (!customerId) {
      return { ticketId, ticketNumber: ticket.ticket_number, status: 'no_customer_id' };
    }

    // Check customer exists
    try {
      await client.getCustomerById(customerId);
    } catch (err) {
      return { ticketId, ticketNumber: ticket.ticket_number, status: 'customer_not_found', customerId };
    }

    // Check vehicle data
    const hasVehicle = ticket.vehicle_model_id !== null && ticket.vehicle_model_id !== undefined;

    return {
      ticketId,
      ticketNumber: ticket.ticket_number,
      status: 'complete',
      customerId,
      hasVehicle,
    };
  } catch (error) {
    return {
      ticketId,
      ticketNumber: null,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function findCompleteTicket() {
  console.log('🔍 Checking tickets for complete data...\n');
  
  loadConfig();
  const client = new JifelineApiClient();

  const results = [];
  for (const ticketId of ticketIds) {
    const result = await checkTicket(client, ticketId);
    results.push(result);
    
    const statusIcon = result.status === 'complete' ? '✓' : result.status === 'customer_not_found' ? '✗' : '○';
    console.log(`${statusIcon} Ticket ${result.ticketId.substring(0, 8)}... (${result.ticketNumber || 'N/A'}): ${result.status}`);
    
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log('\n📊 Results:\n');
  
  const completeTickets = results.filter((r) => r.status === 'complete');
  if (completeTickets.length > 0) {
    console.log(`✅ Found ${completeTickets.length} ticket(s) with complete data:\n`);
    completeTickets.forEach((ticket) => {
      console.log(`  Ticket #${ticket.ticketNumber} (${ticket.ticketId})`);
      console.log(`    Customer: ${ticket.customerId}`);
      console.log(`    Vehicle: ${ticket.hasVehicle ? 'Yes' : 'No'}\n`);
    });
    
    const bestTicket = completeTickets[0];
    console.log(`\n💡 Test pipeline with:`);
    console.log(`   npm run test:pipeline:uuid -- ${bestTicket.ticketId}\n`);
    
    return bestTicket.ticketId;
  } else {
    console.log('❌ No tickets found with complete customer data\n');
    console.log('Status breakdown:');
    const statusCounts = results.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
    return null;
  }
}

findCompleteTicket().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});


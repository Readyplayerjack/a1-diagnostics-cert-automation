#!/usr/bin/env node
/**
 * Debug script to check ticket customer_channel_id
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import { loadConfig } from '../src/config/index.js';

async function main() {
  const ticketId = process.argv[2] || '1536aad7-fc68-4703-afaf-6168c45b6a6a';
  
  loadConfig();
  const client = new JifelineApiClient();
  
  const ticket = await client.getTicketById(ticketId);
  
  console.log('Ticket Details:');
  console.log(`  Ticket Number: ${ticket.ticket_number}`);
  console.log(`  Ticket ID: ${ticket.id}`);
  console.log(`  Customer Channel ID: ${ticket.customer_channel_id ?? 'NULL'}`);
  console.log(`  Operator Channel ID: ${ticket.operator_channel_id ?? 'NULL'}`);
  console.log(`  State: ${ticket.state}`);
  console.log('');
  
  if (ticket.customer_channel_id) {
    console.log(`Customer Channel ID is: ${ticket.customer_channel_id}`);
    console.log(`Ticket ID is: ${ticket.id}`);
    console.log(`Are they the same? ${ticket.customer_channel_id === ticket.id}`);
  } else {
    console.log('No customer_channel_id found in ticket');
  }
}

main().catch(console.error);


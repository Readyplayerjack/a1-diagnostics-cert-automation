#!/usr/bin/env node
/**
 * Examine ticket structure to find relationship fields for business/garage data
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import { loadConfig } from '../src/config/index.js';

const ticketId = process.argv[2] || '1536aad7-fc68-4703-afaf-6168c45b6a6a';

async function examineTicket() {
  console.log(`🔍 Examining ticket structure for: ${ticketId}\n`);
  
  loadConfig();
  const client = new JifelineApiClient();

  try {
    const ticket = await client.getTicketById(ticketId);
    
    console.log('📋 Full Ticket Structure:\n');
    console.log(JSON.stringify(ticket, null, 2));
    
    console.log('\n\n🔗 Relationship Fields Found:\n');
    
    const relationshipFields: string[] = [];
    const ticketObj = ticket as Record<string, unknown>;
    
    for (const [key, value] of Object.entries(ticketObj)) {
      if (key.toLowerCase().includes('id') && value !== null && value !== undefined) {
        const keyLower = key.toLowerCase();
        if (
          keyLower.includes('partner') ||
          keyLower.includes('business') ||
          keyLower.includes('organization') ||
          keyLower.includes('owner') ||
          keyLower.includes('garage') ||
          keyLower.includes('workshop') ||
          keyLower.includes('company') ||
          (keyLower.includes('customer') && !keyLower.includes('channel'))
        ) {
          relationshipFields.push(key);
          console.log(`  ${key}: ${value}`);
        }
      }
    }
    
    console.log('\n\n💡 Potential Endpoints to Test:\n');
    relationshipFields.forEach((field) => {
      const id = ticketObj[field];
      if (typeof id === 'string' && id.length > 0) {
        const entityName = field.replace(/_id$/, '').replace(/Id$/, '').toLowerCase();
        console.log(`  GET /v2/${entityName}s/${id}`);
        console.log(`  GET /v2/${entityName}/${id}`);
      }
    });
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

examineTicket();


#!/usr/bin/env node
/**
 * Check processed_tickets table for recent records
 */

import { query, closePool } from '../src/clients/database.js';
import { loadConfig } from '../src/config/index.js';

async function checkRecords() {
  try {
    loadConfig();
    const result = await query<{
      id: string;
      ticket_id: string;
      ticket_number: number;
      status: string;
      certificate_url: string | null;
      processed_at: string;
    }>(
      `SELECT id, ticket_id, ticket_number, status, certificate_url, processed_at 
       FROM processed_tickets 
       ORDER BY processed_at DESC 
       LIMIT 5`
    );

    console.log(`\n📊 Found ${result.rows.length} recent record(s) in processed_tickets:\n`);
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. Ticket #${row.ticket_number} (${row.ticket_id.substring(0, 8)}...)`);
      console.log(`   Status: ${row.status}`);
      console.log(`   Certificate URL: ${row.certificate_url || 'null'}`);
      console.log(`   Processed: ${row.processed_at}\n`);
    });
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await closePool();
  }
}

checkRecords();


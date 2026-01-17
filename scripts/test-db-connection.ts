#!/usr/bin/env node
/**
 * Self-test script for Database Connection
 *
 * Purpose: Verify that PostgreSQL database connection is correctly configured
 * and the processed_tickets table exists and is accessible.
 *
 * Usage:
 *   npm run test:db
 *
 * Required Environment Variables:
 *   - DATABASE_URL: PostgreSQL connection string
 *
 * This script:
 *   - Connects to the database using the same client as the main app
 *   - Verifies connectivity with SELECT 1
 *   - Checks that processed_tickets table exists
 *   - Optionally inserts and deletes a test row
 *   - Exits with code 0 on success, 1 on failure
 */

import { query, closePool } from '../src/clients/database.js';
import { loadConfig } from '../src/config/index.js';

async function testDatabaseConnection(): Promise<void> {
  console.log('🧪 Testing Database Connection...\n');

  try {
    // Load and validate configuration
    const config = loadConfig();
    const dbUrl = config.DATABASE_URL;
    
    // Mask password in display
    const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':***@');
    console.log(`✓ Configuration loaded`);
    console.log(`  DATABASE_URL: ${maskedUrl}\n`);

    // Test 1: Basic connectivity
    console.log('🔌 Testing database connectivity...');
    const connectivityResult = await query<{ one: number }>('SELECT 1 as one');
    
    if (connectivityResult.rows.length === 0 || connectivityResult.rows[0]?.one !== 1) {
      console.error('✗ Connectivity test failed: SELECT 1 did not return expected result\n');
      process.exit(1);
    }
    console.log('✓ Database connection successful\n');

    // Test 2: Check processed_tickets table exists
    console.log('📋 Checking processed_tickets table...');
    const tableCheckResult = await query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'processed_tickets'
      ) as exists
      `
    );

    if (!tableCheckResult.rows[0]?.exists) {
      console.error('✗ Table check failed: processed_tickets table does not exist\n');
      console.error('💡 Run the migration:');
      console.error('   npm run migrate\n');
      process.exit(1);
    }
    console.log('✓ processed_tickets table exists\n');

    // Test 3: Check table structure
    console.log('🔍 Verifying table structure...');
    const columnResult = await query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'processed_tickets'
      ORDER BY ordinal_position
      `
    );

    const requiredColumns = ['id', 'ticket_id', 'ticket_number', 'customer_id', 'status'];
    const existingColumns = columnResult.rows.map((row) => row.column_name);
    const missingColumns = requiredColumns.filter((col) => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.error(`✗ Table structure incomplete: Missing columns: ${missingColumns.join(', ')}\n`);
      console.error('💡 Run the migration:');
      console.error('   npm run migrate\n');
      process.exit(1);
    }
    console.log(`✓ Table structure verified (${columnResult.rows.length} columns)\n`);

    // Test 4: Insert and delete a test row
    console.log('✍️  Testing write access (insert/delete test row)...');
    const testTicketId = 'SELF_TEST_TICKET';
    
    try {
      // Insert test row
      await query(
        `
        INSERT INTO processed_tickets (
          ticket_id,
          ticket_number,
          customer_id,
          processed_at,
          status,
          error_message
        ) VALUES ($1, $2, $3, NOW(), $4, $5)
        `,
        [testTicketId, 999999, 'test-customer-id', 'failed', 'Self-test row - will be deleted']
      );
      console.log('  ✓ Insert successful');

      // Delete test row
      await query(
        `DELETE FROM processed_tickets WHERE ticket_id = $1`,
        [testTicketId]
      );
      console.log('  ✓ Delete successful\n');
    } catch (err) {
      console.error('✗ Write test failed:\n');
      if (err instanceof Error) {
        console.error(`  Error: ${err.message}`);
      } else {
        console.error(`  Unknown error: ${String(err)}`);
      }
      console.error('\n💡 Troubleshooting:');
      console.error('  1. Verify DATABASE_URL connection string is correct');
      console.error('  2. Check database user has INSERT/DELETE permissions');
      console.error('  3. Ensure processed_tickets table is not locked\n');
      process.exit(1);
    }

    // Summary
    console.log('📊 Database Test Summary:');
    console.log(`   Connection: ✅ Working`);
    console.log(`   Table exists: ✅ processed_tickets`);
    console.log(`   Table columns: ✅ ${columnResult.rows.length} columns`);
    console.log(`   Write access: ✅ INSERT/DELETE working\n`);

    console.log('✅ Database connection test PASSED\n');
    console.log('💡 The database is correctly configured.');
    console.log('   The main pipeline will use the same connection and table.\n');
  } catch (error) {
    console.error('\n✗ Database connection test FAILED:\n');
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
    console.error('  1. Verify DATABASE_URL in .env is correct');
    console.error('  2. Check database server is accessible from your network');
    console.error('  3. Verify database credentials are correct');
    console.error('  4. Ensure processed_tickets table exists (run: npm run migrate)\n');
    process.exit(1);
  } finally {
    // Close database connection pool
    await closePool();
  }
}

testDatabaseConnection().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


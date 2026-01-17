#!/usr/bin/env node
/**
 * One-time migration script to create the processed_tickets table.
 *
 * Usage:
 *   npm run migrate
 *
 * This script:
 * 1. Loads DATABASE_URL from .env
 * 2. Reads the SQL migration file
 * 3. Executes all SQL statements
 * 4. Logs success or failure
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPool, closePool, DatabaseError } from '../src/clients/database.js';
import { loadConfig } from '../src/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration(): Promise<void> {
  console.log('🔄 Running database migration...\n');

  try {
    // Load config to validate DATABASE_URL is set
    const config = loadConfig();
    console.log(`✓ Database URL configured (host: ${config.DATABASE_URL.split('@')[1]?.split(':')[0] || 'unknown'})\n`);

    // Read migration SQL file
    const migrationPath = join(__dirname, '..', 'migrations', '001_create_processed_tickets.sql');
    console.log(`📄 Reading migration file: ${migrationPath}`);
    const sql = readFileSync(migrationPath, 'utf-8');
    console.log(`✓ Migration file loaded (${sql.length} characters)\n`);

    // Get database pool
    const pool = getPool();
    console.log('🔌 Connected to database\n');

    // Execute migration SQL
    console.log('⚙️  Executing migration SQL...');
    await pool.query(sql);

    // Verify table was created
    console.log('✓ Migration SQL executed successfully\n');
    console.log('🔍 Verifying table creation...');

    const verifyResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'processed_tickets'
      ) as exists;
    `);

    if (verifyResult.rows[0]?.exists) {
      console.log('✓ Table "processed_tickets" exists\n');

      // Check indexes
      const indexResult = await pool.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'processed_tickets'
        ORDER BY indexname;
      `);

      const indexes = indexResult.rows.map((row) => row.indexname);
      console.log(`✓ Found ${indexes.length} index(es):`);
      indexes.forEach((idx) => console.log(`  - ${idx}`));
      console.log('');

      // Check columns
      const columnResult = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'processed_tickets'
        ORDER BY ordinal_position;
      `);

      console.log(`✓ Found ${columnResult.rows.length} column(s):`);
      columnResult.rows.forEach((col) => {
        const nullable = col.is_nullable === 'YES' ? 'nullable' : 'NOT NULL';
        console.log(`  - ${col.column_name} (${col.data_type}, ${nullable})`);
      });
      console.log('');

      console.log('✅ Migration completed successfully!\n');
      console.log('📋 Summary:');
      console.log('  - Table: processed_tickets');
      console.log(`  - Columns: ${columnResult.rows.length}`);
      console.log(`  - Indexes: ${indexes.length}`);
    } else {
      console.error('✗ Table "processed_tickets" was not created');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n✗ Migration failed:\n');

    if (error instanceof DatabaseError) {
      console.error(`Database Error: ${error.message}`);
      if (error.cause) {
        console.error(`Cause: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`);
      }
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error(`Unknown error: ${String(error)}`);
    }

    process.exit(1);
  } finally {
    // Close database pool
    await closePool();
    console.log('\n🔌 Database connection closed');
  }
}

// Run migration
runMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


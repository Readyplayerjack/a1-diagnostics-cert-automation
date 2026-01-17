-- Migration: Add garage_id for Multi-Tenancy
-- Purpose: Enable row-level security and multi-tenant data isolation
-- Date: 2025-01-17

-- Add garage_id column (nullable initially for backfill)
ALTER TABLE processed_tickets 
  ADD COLUMN IF NOT EXISTS garage_id TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN processed_tickets.garage_id IS 
  'Garage identifier for multi-tenant isolation. Extracted from Jifeline customer_id or ticket metadata.';

-- Create index for RLS performance (before making it NOT NULL)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_tickets_garage_id 
  ON processed_tickets(garage_id);

-- Note: Backfill existing tickets with garage_id extracted from customer_id
-- This should be done in a separate data migration script based on your customer_id pattern
-- Example: UPDATE processed_tickets SET garage_id = customer_id WHERE garage_id IS NULL;

-- After backfill, make it required:
-- ALTER TABLE processed_tickets ALTER COLUMN garage_id SET NOT NULL;

-- Migration: Enable Row Level Security (RLS)
-- Purpose: Multi-tenant data isolation and security
-- Date: 2025-01-17

-- Enable RLS on processed_tickets table
ALTER TABLE processed_tickets ENABLE ROW LEVEL SECURITY;

-- Policy: Service role (backend) has full access
-- This allows our serverless functions to access all data
CREATE POLICY "Service role full access" ON processed_tickets
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Policy: Future portal users can only see their own garage's data
-- This will be used when the customer portal is built
-- Uncomment when ready:
/*
CREATE POLICY "Users see own garage data" ON processed_tickets
  FOR SELECT
  USING (
    garage_id = (auth.jwt() ->> 'garage_id')::text
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users insert own garage data" ON processed_tickets
  FOR INSERT
  WITH CHECK (
    garage_id = (auth.jwt() ->> 'garage_id')::text
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users update own garage data" ON processed_tickets
  FOR UPDATE
  USING (
    garage_id = (auth.jwt() ->> 'garage_id')::text
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    garage_id = (auth.jwt() ->> 'garage_id')::text
    OR auth.role() = 'service_role'
  );
*/

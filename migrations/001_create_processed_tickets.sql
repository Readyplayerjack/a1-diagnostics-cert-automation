-- Migration: Create processed_tickets table
-- Purpose: Track which Jifeline tickets have been processed by our system
-- to ensure idempotency and prevent duplicate certificate generation.

-- The ticket_id is UNIQUE to ensure idempotency: if we attempt to process
-- the same ticket multiple times (e.g., due to retries or webhook duplicates),
-- we can check if it's already been successfully processed and skip it.

-- The status field will be used in later phases to:
-- - Skip tickets that are already 'success' when polling for new closed tickets
-- - Show a review queue for tickets with status 'needs_review'
-- - Track failed processing attempts for debugging and retry logic

CREATE TABLE IF NOT EXISTS processed_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL UNIQUE,
  ticket_number BIGINT NOT NULL,
  customer_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  certificate_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'needs_review')),
  error_message TEXT,
  raw_payload JSONB
);

-- Index on ticket_id for fast lookups (already unique, but explicit index helps with query planning)
CREATE INDEX IF NOT EXISTS idx_processed_tickets_ticket_id ON processed_tickets(ticket_id);

-- Index on customer_id for filtering by customer
CREATE INDEX IF NOT EXISTS idx_processed_tickets_customer_id ON processed_tickets(customer_id);

-- Index on status for filtering by status (e.g., finding all 'needs_review' tickets)
CREATE INDEX IF NOT EXISTS idx_processed_tickets_status ON processed_tickets(status);

-- Index on processed_at for time-based queries (e.g., finding recently processed tickets)
CREATE INDEX IF NOT EXISTS idx_processed_tickets_processed_at ON processed_tickets(processed_at);




-- Migration: Add Performance Indexes
-- Purpose: Improve query performance for processed_tickets table
-- Date: 2025-01-17

-- Index on ticket_id for fast lookups (already exists but ensure it's there)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_tickets_ticket_id 
  ON processed_tickets(ticket_id);

-- Partial index for active tickets (pending/processing status)
-- This is more efficient than a full index when querying active tickets
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_tickets_status_active 
  ON processed_tickets(status) 
  WHERE status IN ('pending', 'processing', 'needs_review');

-- Index on processed_at DESC for sorting recent tickets
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_tickets_processed_at_desc 
  ON processed_tickets(processed_at DESC);

-- Composite index for common query pattern: status + processed_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_tickets_status_processed_at 
  ON processed_tickets(status, processed_at DESC);

-- Index on customer_id for filtering by customer (if not already exists)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_tickets_customer_id 
  ON processed_tickets(customer_id);

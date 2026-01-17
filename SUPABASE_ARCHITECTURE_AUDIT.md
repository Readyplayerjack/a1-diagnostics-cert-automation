# Supabase Architecture Audit

**Date:** December 2025  
**Purpose:** Implementation-level map of Supabase (database + storage) usage in the codebase

---

## Supabase Usage Overview

### Modules Using Supabase

1. **`src/clients/supabase-client.ts`**
   - **Responsibility:** Singleton Supabase JS client configured with service role key for server-side operations
   - **Env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   - **Usage:** Exported `supabaseClient` used by storage operations

2. **`src/clients/database.ts`**
   - **Responsibility:** PostgreSQL connection pool manager using `pg` library (not Supabase JS client)
   - **Env vars:** `DATABASE_URL` (PostgreSQL connection string)
   - **Usage:** Direct PostgreSQL queries via connection pool, used by `ProcessedTicketsRepository`

3. **`src/services/certificate-storage.ts`**
   - **Responsibility:** Certificate PDF upload and public URL generation via Supabase Storage
   - **Env vars:** Indirect (via `supabaseClient`): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   - **Bucket:** `certificates`
   - **Path pattern:** `certificates/{ticketNumber}-{ticketId}.pdf`
   - **Access:** Public URLs via `getPublicUrl()`

4. **`src/services/processed-tickets-repository.ts`**
   - **Responsibility:** Idempotency tracking and success/failure recording in PostgreSQL
   - **Env vars:** Indirect (via `database.ts`): `DATABASE_URL`
   - **Table:** `processed_tickets`
   - **Operations:** `hasSuccessfulRecord()`, `recordSuccess()`, `recordFailure()`

5. **`src/services/ticket-processing-service.ts`**
   - **Responsibility:** Orchestrates full pipeline including storage and DB recording
   - **Env vars:** Indirect (via dependencies): All Supabase env vars
   - **Usage:** Calls `certificateStorage.saveCertificatePdf()` and `processedTicketsRepository` methods

6. **`src/handlers/process-ticket.ts`**
   - **Responsibility:** HTTP entry point for ticket processing (Vercel serverless function)
   - **Env vars:** Indirect (via service factory): All Supabase env vars
   - **Usage:** Creates `TicketProcessingService` and queries `processed_tickets` table for status checks

7. **`src/config/index.ts`**
   - **Responsibility:** Environment variable validation via Zod schema
   - **Env vars validated:** `SUPABASE_URL` (URL format), `SUPABASE_SERVICE_KEY` (non-empty string), `DATABASE_URL` (URL format)

---

## Database Expectations

### Table: `processed_tickets`

**Purpose:** Track which Jifeline tickets have been processed to ensure idempotency and prevent duplicate certificate generation.

**Schema Definition** (from `migrations/001_create_processed_tickets.sql`):

```sql
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
```

**Indexes:**
- `idx_processed_tickets_ticket_id` on `ticket_id` (unique constraint)
- `idx_processed_tickets_customer_id` on `customer_id`
- `idx_processed_tickets_status` on `status`
- `idx_processed_tickets_processed_at` on `processed_at`

**Key Columns:**
- `ticket_id` (TEXT, UNIQUE): Jifeline ticket UUID - primary idempotency key
- `ticket_number` (BIGINT): Human-readable ticket number from Jifeline
- `customer_id` (TEXT): Jifeline customer UUID
- `status` (TEXT, CHECK): One of `'success'`, `'failed'`, `'needs_review'`
- `certificate_url` (TEXT, nullable): Public URL to stored PDF certificate (populated on success)
- `processed_at` (TIMESTAMPTZ): Timestamp of processing attempt
- `error_message` (TEXT, nullable): Error details for failed/needs_review records
- `raw_payload` (JSONB, nullable): Snapshot of key certificate data for debugging/auditing

**Relationships:**
- No foreign keys defined (ticket_id, customer_id are opaque UUIDs from Jifeline API)
- `ticket_id` uniqueness enforced at database level for idempotency

**Query Patterns:**
- `SELECT EXISTS(...) WHERE ticket_id = $1 AND status = 'success'` (idempotency check)
- `INSERT INTO processed_tickets (...) VALUES (...)` (success/failure recording)
- `SELECT status FROM processed_tickets WHERE ticket_id = $1 ORDER BY processed_at DESC LIMIT 1` (status lookup)

---

## Storage Expectations

### Bucket: `certificates`

**Purpose:** Store generated PDF certificates for closed tickets.

**Bucket Configuration:**
- **Name:** `certificates` (hardcoded constant in `src/services/certificate-storage.ts:4`)
- **Access:** Public (uses `getPublicUrl()` - no signed URLs)
- **Content-Type:** `application/pdf` (set on upload)

**Object Key Pattern:**
```
certificates/{ticketNumber}-{ticketId}.pdf
```

**Examples:**
- `certificates/9111450-1536aad7-fc68-4703-afaf-6168c45b6a6a.pdf`
- `certificates/9111442-abc123-def456-ghi789.pdf`

**Upload Behavior:**
- Uses `upsert: true` (overwrites existing files with same key)
- Uploads via `supabaseClient.storage.from('certificates').upload(path, buffer, { contentType: 'application/pdf', upsert: true })`

**URL Generation:**
- Public URLs generated via `supabaseClient.storage.from('certificates').getPublicUrl(path)`
- Returns format: `https://{project-ref}.supabase.co/storage/v1/object/public/certificates/{ticketNumber}-{ticketId}.pdf`

**Error Handling:**
- `UPLOAD_FAILED`: Upload operation failed (network, auth, bucket missing)
- `URL_GENERATION_FAILED`: Public URL generation failed or returned null
- `UNKNOWN`: Unexpected errors during storage operations

---

## Runtime Flow

### Happy Path: Ticket Processing Flow

**Step 1: Idempotency Check** (`TicketProcessingService.processClosedTicket()`)
- Calls `ProcessedTicketsRepository.hasSuccessfulRecord(ticketId)`
- Queries: `SELECT EXISTS(SELECT 1 FROM processed_tickets WHERE ticket_id = $1 AND status = 'success')`
- If `true`, returns early (already processed)

**Step 2: Load Ticket** (`TicketProcessingService`)
- Calls `JifelineApiClient.getTicketById(ticketId)` (external API, not Supabase)
- Extracts `ticketNumber` and `customerId` for error handling

**Step 3: Build Certificate Data** (`CertificateDataBuilder`)
- Fetches conversation text, extracts reg/mileage, builds `CertificateData` object
- No Supabase operations at this step

**Step 4: Generate PDF** (`ChromiumCertificatePdfGenerator`)
- Generates PDF buffer from `CertificateData`
- No Supabase operations at this step

**Step 5: Upload to Storage** (`SupabaseCertificateStorage.saveCertificatePdf()`)
- Uploads PDF buffer to `certificates/{ticketNumber}-{ticketId}.pdf`
- Generates public URL via `getPublicUrl()`
- Returns certificate URL string

**Step 6: Record Success** (`ProcessedTicketsRepository.recordSuccess()`)
- Inserts row into `processed_tickets` table:
  ```sql
  INSERT INTO processed_tickets (
    ticket_id, ticket_number, customer_id, processed_at,
    certificate_url, status, raw_payload
  ) VALUES ($1, $2, $3, NOW(), $4, 'success', $5)
  ```
- Includes certificate URL and snapshot of certificate data in `raw_payload`

**Error Paths:**
- **Data/Validation Errors** (`CertificateDataError`): Records `status = 'needs_review'` with error message
- **System Errors** (PDF generation, storage failures): Records `status = 'failed'` with error message, re-throws for monitoring

---

## Unresolved / Missing Pieces

### Database Setup Required

1. **Migration Execution**
   - **File:** `migrations/001_create_processed_tickets.sql`
   - **Action:** Run migration to create `processed_tickets` table and indexes
   - **Method:** `psql $DATABASE_URL -f migrations/001_create_processed_tickets.sql` or Supabase Dashboard SQL editor
   - **Status:** Migration file exists, but must be executed in Supabase project

2. **Database Permissions**
   - **Requirement:** Service role key must have INSERT/SELECT permissions on `processed_tickets` table
   - **Note:** Using `DATABASE_URL` with direct PostgreSQL connection (not Supabase JS client for DB), so connection string user must have table access

3. **RLS Policies** (if applicable)
   - **Current:** Code uses service role key, bypasses RLS
   - **Recommendation:** If RLS is enabled, ensure service role bypasses RLS or has appropriate policies
   - **Note:** `ProcessedTicketsRepository` uses direct PostgreSQL queries, not Supabase JS client, so RLS may not apply

### Storage Setup Required

1. **Bucket Creation**
   - **Bucket Name:** `certificates`
   - **Action:** Create bucket in Supabase Dashboard → Storage
   - **Status:** TODO comment in code (`src/services/certificate-storage.ts:52-54`): "Ensure the 'certificates' bucket exists and has the desired access configuration"

2. **Bucket Access Configuration**
   - **Current Assumption:** Public bucket (uses `getPublicUrl()`)
   - **Action:** Configure bucket as public OR implement signed URL generation if private access needed
   - **Recommendation:** Consider security implications of public certificate URLs

3. **Storage Policies** (if applicable)
   - **Requirement:** Service role key must have INSERT/UPDATE permissions on `certificates` bucket
   - **Note:** Using `supabaseClient` with service role key, so should have full access unless policies restrict

### Environment Variables

**Required in `.env`:**
- `SUPABASE_URL`: Project URL (format: `https://{project-ref}.supabase.co`)
- `SUPABASE_SERVICE_KEY`: Service role key (long JWT-like string)
- `DATABASE_URL`: PostgreSQL connection string (format: `postgresql://user:password@host:port/database`)

**Validation:** All three validated by Zod schema in `src/config/index.ts`:
- `SUPABASE_URL`: `z.string().url()`
- `SUPABASE_SERVICE_KEY`: `z.string().min(1)`
- `DATABASE_URL`: `z.string().url()`

### Code Gaps / TODOs

1. **Bucket Existence Check**
   - **Location:** `src/services/certificate-storage.ts:52-54`
   - **TODO:** "Ensure the 'certificates' bucket exists and has the desired access configuration in the Supabase dashboard"
   - **Action:** Create bucket manually or add bucket creation code

2. **Public URL Security**
   - **Location:** `README.md:134`
   - **Note:** "URLs are currently public via `getPublicUrl`; consider signed URLs or a custom domain in a future hardening pass"
   - **Action:** Evaluate security requirements for certificate URLs

3. **Error Handling for Missing Bucket**
   - **Current:** `CertificateStorageError` with code `UPLOAD_FAILED` thrown if bucket doesn't exist
   - **Gap:** No explicit check for bucket existence before upload
   - **Recommendation:** Add bucket existence check or handle 404 errors gracefully

### Integration Points

**Supabase JS Client Usage:**
- Only used for Storage operations (`certificate-storage.ts`)
- Not used for database queries (uses direct PostgreSQL via `pg` library)

**PostgreSQL Direct Connection:**
- All database operations use `pg` Pool via `DATABASE_URL`
- No Supabase PostgREST API usage for database queries
- Migration must be run directly against PostgreSQL (not via Supabase JS client)

---

## Summary Checklist for Supabase Project Setup

- [ ] Run migration `migrations/001_create_processed_tickets.sql` to create table
- [ ] Verify `processed_tickets` table exists with correct schema and indexes
- [ ] Create `certificates` storage bucket in Supabase Dashboard
- [ ] Configure `certificates` bucket as public (or implement signed URLs if private)
- [ ] Verify service role key has storage INSERT/UPDATE permissions
- [ ] Verify `DATABASE_URL` connection string user has table INSERT/SELECT permissions
- [ ] Test certificate upload: `npm run test:pipeline -- <ticket-number>`
- [ ] Verify certificate URL is publicly accessible
- [ ] Test database recording: Check `processed_tickets` table after successful processing
- [ ] Monitor error logs for `UPLOAD_FAILED` or `DatabaseError` indicating missing resources

---

**End of Audit**


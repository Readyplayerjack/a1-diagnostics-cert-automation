# End-to-End Pipeline Setup Guide

**Date:** December 16, 2025  
**Purpose:** Complete guide for validating and running the ticket → certificate pipeline

---

## Overview

The pipeline performs these steps in sequence:
1. **Fetch ticket** from Jifeline Partner API
2. **Build certificate data** (with fallbacks for missing customer/employee data)
3. **Generate PDF** certificate (Simple or Chromium generator)
4. **Upload PDF** to Supabase Storage (`certificates` bucket)
5. **Record result** in `processed_tickets` table (PostgreSQL)

**No steps are skipped or bypassed.** All steps must succeed for a ticket to be marked as `status='success'`.

---

## Self-Test Scripts

Three self-test scripts validate each service independently before running the full pipeline.

### 1. Supabase Storage Test

**Command:**
```bash
npm run test:supabase:storage
```

**What it tests:**
- Supabase connection using `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- Upload to `certificates` bucket (same bucket as main pipeline)
- Public URL generation
- Uses exact same upload pattern as `SupabaseCertificateStorage`

**Expected output:**
- ✅ Upload successful
- ✅ Public URL generated
- Shows bucket name, file path, and public URL

**If it fails:**
- Check `certificates` bucket exists in Supabase Dashboard
- Verify `SUPABASE_SERVICE_KEY` has storage write permissions
- Ensure bucket is configured (public or proper RLS policies)

---

### 2. Database Connection Test

**Command:**
```bash
npm run test:db
```

**What it tests:**
- PostgreSQL connection using `DATABASE_URL`
- `processed_tickets` table exists
- Table structure (9 columns)
- Write access (INSERT/DELETE test row)

**Expected output:**
- ✅ Database connection successful
- ✅ Table exists and structure verified
- ✅ Write access confirmed

**If it fails:**
- Run migration: `npm run migrate`
- Verify `DATABASE_URL` connection string is correct
- Check database user has INSERT/DELETE permissions

---

### 3. Jifeline API Test

**Command:**
```bash
npm run test:jifeline
```

**Or with a specific ticket:**
```bash
npm run test:jifeline -- --ticket <ticket-uuid>
```

**What it tests:**
- OAuth2 token acquisition
- Ticket endpoint: `GET /v2/tickets/tickets/{id}`
- Customers list endpoint: `GET /v2/customers?enabled=true`
- Individual customer endpoint: `GET /v2/customers/{id}` (if ticket has customer_id)

**Expected output:**
- ✅ OAuth2 token acquired
- ✅ Ticket endpoint working
- ⚠️  Customers may return 404 (permissions issue - expected)
- ⚠️  Individual customer may return 404 (expected - handled with fallbacks)

**If it fails:**
- Verify Jifeline API credentials are correct
- Check `JIFELINE_TOKEN_URL` is accessible
- Customer 404s are handled gracefully in the pipeline

---

## Full Pipeline Test

**Command:**
```bash
npm run test:pipeline:uuid -- <ticket-uuid>
```

**Example:**
```bash
npm run test:pipeline:uuid -- 1536aad7-fc68-4703-afaf-6168c45b6a6a
```

**What it does:**
1. Fetches ticket from Jifeline API
2. Builds certificate data:
   - Uses real data when accessible
   - Uses fallbacks ("Unknown workshop", "Address not available", "Unknown Operator") when endpoints return 404
3. Generates PDF:
   - Uses `SimpleCertificatePdfGenerator` if `USE_SIMPLE_PDF=true`
   - Uses `ChromiumCertificatePdfGenerator` if `USE_SIMPLE_PDF=false` (default)
4. Uploads PDF to Supabase Storage (`certificates` bucket)
5. Records result in `processed_tickets` table:
   - `status='success'` if all steps succeed
   - `status='failed'` if PDF/storage fails
   - `status='needs_review'` if data validation fails

**Expected output on success:**
```
✅ Pipeline test PASSED

📋 Summary:
   ✓ Ticket fetched from Jifeline API
   ✓ Certificate data built (with fallbacks if needed)
   ✓ PDF generated
   ✓ PDF uploaded to Supabase Storage
   ✓ Record inserted in processed_tickets table

🔗 Certificate URL: https://...
```

**If it fails:**
- Error message indicates which step failed
- Troubleshooting suggestions provided
- Run individual tests to diagnose:
  - `npm run test:jifeline`
  - `npm run test:supabase:storage`
  - `npm run test:db`

---

## Environment Variables

### Required Variables

**Jifeline Partner API:**
- `JIFELINE_API_BASE_URL` - Base URL (e.g., `https://partner-api-001.prd.jifeline.cloud`)
- `JIFELINE_CLIENT_ID` - OAuth2 client ID
- `JIFELINE_CLIENT_SECRET` - OAuth2 client secret
- `JIFELINE_TOKEN_URL` - OAuth2 token endpoint (e.g., `https://partner-api-001.prd.jifeline.cloud/oauth2/token`)

**Supabase:**
- `SUPABASE_URL` - Project URL (e.g., `https://{project-ref}.supabase.co`)
- `SUPABASE_SERVICE_KEY` - Service role key (JWT string starting with `eyJ...`)

**Database:**
- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://postgres.{ref}:{password}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`)

**OpenAI (for reg/mileage extraction):**
- `OPENAI_API_KEY` - OpenAI API key
- `OPENAI_BASE_URL` - Optional (defaults to `https://api.openai.com/v1`)

### Optional Variables

**PDF Generation:**
- `USE_SIMPLE_PDF` - Set to `"true"` or `"1"` to use simple PDF generator (no Chromium required)
  - Default: `false` (uses Chromium)
  - Recommended for macOS development environments

---

## Validation Sequence

Run these commands in order to validate a fresh environment:

### Step 1: Test Database
```bash
npm run test:db
```
**Expected:** ✅ All checks pass  
**If fails:** Run `npm run migrate` to create `processed_tickets` table

### Step 2: Test Supabase Storage
```bash
npm run test:supabase:storage
```
**Expected:** ✅ Upload successful, public URL generated  
**If fails:** Create `certificates` bucket in Supabase Dashboard and configure permissions

### Step 3: Test Jifeline API
```bash
npm run test:jifeline
```
**Expected:** ✅ OAuth working, ticket endpoint working  
**Note:** Customer 404s are expected and handled gracefully

### Step 4: Run Full Pipeline
```bash
npm run test:pipeline:uuid -- <ticket-uuid>
```
**Expected:** ✅ All steps complete, PDF uploaded, database record created

---

## Files Created/Modified

### New Self-Test Scripts

1. **`scripts/test-supabase-storage.ts`**
   - Tests Supabase Storage upload
   - Uses same bucket and pattern as main pipeline
   - Validates public URL generation

2. **`scripts/test-db-connection.ts`**
   - Tests PostgreSQL connection
   - Verifies `processed_tickets` table exists
   - Tests INSERT/DELETE permissions

3. **`scripts/test-jifeline-api.ts`**
   - Tests Jifeline Partner API endpoints
   - Validates OAuth2 token acquisition
   - Tests ticket and customer endpoints

### Enhanced Scripts

4. **`scripts/test-pipeline-by-uuid.ts`** (enhanced)
   - Added step-by-step progress display
   - Enhanced error messages with troubleshooting
   - Verifies database record after processing
   - Shows certificate URL on success

### Code Changes

5. **`src/services/certificate-storage.ts`**
   - Fixed storage path (removed bucket name from file path)
   - Path format: `{ticketNumber}-{ticketId}.pdf` (not `certificates/{ticketNumber}-{ticketId}.pdf`)

6. **`src/services/certificate-data-builder.ts`**
   - Made customer data optional with fallbacks
   - Made location data optional with fallbacks
   - Made employee data optional with fallbacks

7. **`src/services/certificate-pdf-generator.ts`**
   - Added `SimpleCertificatePdfGenerator` class
   - Enhanced Chromium error logging

8. **`src/services/service-factory.ts`**
   - Added `USE_SIMPLE_PDF` env var support
   - Selects PDF generator based on configuration

9. **`src/config/index.ts`**
   - Added `USE_SIMPLE_PDF` optional boolean config

10. **`package.json`**
    - Added `test:supabase:storage` script
    - Added `test:db` script
    - Added `test:jifeline` script

11. **`.env.example`**
    - Added `USE_SIMPLE_PDF` documentation

---

## Pipeline Implementation Details

### Step 1: Fetch Ticket
- **Endpoint:** `GET /v2/tickets/tickets/{ticketId}`
- **Implementation:** `JifelineApiClient.getTicketById()`
- **Error handling:** Throws `JifelineNotFoundError` if ticket not found

### Step 2: Build Certificate Data
- **Implementation:** `CertificateDataBuilder.buildForTicket()`
- **Fallbacks:**
  - Customer 404 → `workshopName: "Unknown workshop"`
  - Location 404 → `workshopAddress: "Address not available"`
  - Employee 404 → `employeeName: "Unknown Operator"`
- **Error handling:** Throws `CertificateDataError` for critical missing data (vehicle_model_id, finished_at)

### Step 3: Generate PDF
- **Implementation:** `CertificatePdfGenerator.generate()`
- **Generator selection:**
  - `USE_SIMPLE_PDF=true` → `SimpleCertificatePdfGenerator` (no Chromium)
  - `USE_SIMPLE_PDF=false` → `ChromiumCertificatePdfGenerator` (requires Chromium)
- **Error handling:** Throws `CertificatePdfError` with clear error codes

### Step 4: Upload to Supabase Storage
- **Bucket:** `certificates`
- **Path:** `{ticketNumber}-{ticketId}.pdf`
- **Implementation:** `SupabaseCertificateStorage.saveCertificatePdf()`
- **Error handling:** Throws `CertificateStorageError` if upload fails

### Step 5: Record in Database
- **Table:** `processed_tickets`
- **Status values:**
  - `'success'` - All steps completed successfully
  - `'failed'` - System error (PDF generation, storage, database)
  - `'needs_review'` - Data validation issue (missing required fields)
- **Implementation:** `ProcessedTicketsRepository.recordSuccess()` or `recordFailure()`
- **Error handling:** Throws `DatabaseError` if database operation fails

---

## Troubleshooting

### Storage Upload Fails (403/404)
- Run: `npm run test:supabase:storage`
- Verify bucket exists: Supabase Dashboard → Storage → `certificates`
- Check bucket is public OR service role key has write permissions
- Verify `SUPABASE_SERVICE_KEY` is the service role key (not anon key)

### Database Write Fails
- Run: `npm run test:db`
- Verify table exists: Run `npm run migrate`
- Check `DATABASE_URL` connection string format
- Verify database user has INSERT permissions

### PDF Generation Fails (Chromium)
- Set `USE_SIMPLE_PDF=true` in `.env` for development
- Or fix Chromium installation (system-specific)

### Customer/Employee 404s
- This is expected behavior
- Pipeline uses fallback values ("Unknown workshop", "Unknown Operator")
- Certificate is still generated successfully

---

## Success Criteria

The pipeline is working correctly when:
- ✅ All self-tests pass (`test:db`, `test:supabase:storage`, `test:jifeline`)
- ✅ Full pipeline test completes with `status='success'`
- ✅ PDF is uploaded to Supabase Storage
- ✅ Certificate URL is returned and accessible
- ✅ Database record shows `status='success'` and `certificate_url` is populated

---

**End of Guide**


# Technical Audit: Calibration Certificate Automation Backend

**Date:** December 8, 2025  
**Scope:** Backend codebase for A1 Diagnostics automation platform  
**Purpose:** Assessment of current implementation state and production-readiness gaps

---

## 1. Inventory of Key Components

### `/src/config`

- **`index.ts`** - Environment variable validation and configuration loader using Zod schema. **Real implementation** - Production-ready with comprehensive validation for all required env vars (Jifeline API, Supabase, database).

### `/src/models`

- **`index.ts`** - Central export point for domain models. **Real implementation** - Simple re-export module.
- **`ticket.ts`** - TypeScript interface for Jifeline Ticket entity. **Real implementation** - Complete type definition matching Jifeline API schema.
- **`closed-ticket.ts`** - TypeScript interface for ClosedTicket entity. **Real implementation** - Complete type definition.
- **`customer.ts`** - TypeScript interface for Customer entity. **Real implementation** - Complete type definition.
- **`customer-location.ts`** - TypeScript interface for CustomerLocation entity. **Real implementation** - Complete type definition.
- **`employee.ts`** - TypeScript interface for Employee entity. **Real implementation** - Complete type definition.
- **`vehicle-make.ts`** - TypeScript interface for VehicleMake entity. **Real implementation** - Complete type definition.
- **`vehicle-model.ts`** - TypeScript interface for VehicleModel entity. **Real implementation** - Complete type definition.
- **`certificate-data.ts`** - Domain model interface for certificate generation data. **Real implementation** - Complete interface with some fields marked as optional/nullable for future phases (vehicleRegistration, vehicleMileage, calibrationToolUsed, systemName).

### `/src/clients`

- **`database.ts`** - PostgreSQL connection pool management and query utilities. **Real implementation** - Production-ready with proper error handling, connection pooling, and transaction support.
- **`jifeline-api-client.ts`** - HTTP client for Jifeline Networks Partner API with OAuth2 token management. **Real implementation** - Complete client with token caching, typed error handling, and all required endpoints.
- **`jifeline-api-errors.ts`** - Custom error classes for Jifeline API errors. **Real implementation** - Well-structured error hierarchy (NotFound, ClientError, ServerError, AuthError).
- **`supabase-client.ts`** - Shared Supabase client instance configured for server-side use. **Real implementation** - Properly configured with service role key, no session persistence.

### `/src/services`

- **`processed-tickets-repository.ts`** - Repository for tracking processed tickets in PostgreSQL. **Real implementation** - Complete CRUD operations with idempotency checks, status tracking, and proper error handling.
- **`certificate-data-builder.ts`** - Service that transforms Jifeline API data into CertificateData format. **Real implementation** - Complete implementation with parallel entity loading, comprehensive validation, and structured error codes. Some fields are hardcoded (calibrationResult: 'Calibration Successful', preScanNotes/postScanNotes: 'NO DTCs') as placeholders.
- **`certificate-pdf-generator.ts`** - Interface and stub implementation for PDF generation. **STUB** - Returns minimal valid PDF with placeholder text. TODO comment indicates need for HTML→PDF implementation (e.g., Puppeteer/Chromium).
- **`certificate-storage.ts`** - Interface, Supabase implementation, and stub for certificate file storage. **Mixed** - `SupabaseCertificateStorage` is a **real implementation** with proper error handling. `StubCertificateStorage` is a stub kept for tests. TODO comment notes need to ensure 'certificates' bucket exists in Supabase dashboard.
- **`ticket-processing-service.ts`** - Orchestration service that coordinates the entire ticket processing workflow. **Real implementation** - Complete orchestration logic with proper error categorization (needs_review vs failed), idempotency checks, and comprehensive error handling.
- **`service-factory.ts`** - Factory function for creating TicketProcessingService with production dependencies. **Real implementation** - Wires real Supabase storage but still uses stub PDF generator.

### `/migrations`

- **`001_create_processed_tickets.sql`** - Database migration for processed_tickets table. **Real implementation** - Complete schema with proper indexes, constraints, and status enum. Well-documented.

### `/src/**/__tests__`

- **`services/__tests__/certificate-storage.test.ts`** - Unit tests for SupabaseCertificateStorage. **Real implementation** - Comprehensive tests covering success path, upload failures, and URL generation failures. Uses mocked Supabase client.

---

## 2. Mapping to Intended Architecture

### Config / Env Validation

- **Implementation:** `src/config/index.ts` → `loadConfig()` function
- **Status:** ✅ **Complete** - Uses Zod for validation, throws clear errors, validates all required env vars (Jifeline API credentials, Supabase URL/key, database URL).

### External Clients

- **Jifeline API Client:** `src/clients/jifeline-api-client.ts` → `JifelineApiClient` class
  - **Status:** ✅ **Complete** - OAuth2 token management with caching, all required endpoints implemented (tickets, customers, locations, employees, vehicle makes/models), typed error handling.
  
- **Supabase Client:** `src/clients/supabase-client.ts` → `supabaseClient` constant
  - **Status:** ✅ **Complete** - Properly configured for server-side use with service role key.

### Persistence

- **Processed Tickets Repository:** `src/services/processed-tickets-repository.ts` → `ProcessedTicketsRepository` class
  - **Status:** ✅ **Complete** - Full CRUD with idempotency checks (`hasSuccessfulRecord`), success/failure recording, proper error handling, status tracking (success/failed/needs_review).

- **Database Connection:** `src/clients/database.ts` → `getPool()`, `query()`, `getClient()` functions
  - **Status:** ✅ **Complete** - Connection pooling, transaction support, proper error wrapping.

### Domain Models

- **Status:** ✅ **Complete** - All domain models are fully typed TypeScript interfaces:
  - Ticket, ClosedTicket, Customer, CustomerLocation, Employee, VehicleMake, VehicleModel (from Jifeline API)
  - CertificateData (domain model for certificate generation)

### CertificateData Building

- **Implementation:** `src/services/certificate-data-builder.ts` → `CertificateDataBuilder` class
- **Status:** ✅ **Complete** - Loads all required entities in parallel, validates critical fields, transforms data into CertificateData format. **Note:** Some fields are hardcoded placeholders (calibrationResult, preScanNotes, postScanNotes) and some are null (vehicleRegistration, vehicleMileage, calibrationToolUsed, systemName) for future phases.

### PDF Generation

- **Implementation:** `src/services/certificate-pdf-generator.ts` → `StubCertificatePdfGenerator` class
- **Status:** ❌ **STUB** - Returns minimal valid PDF with placeholder text "Certificate PDF - Job #{jobNumber} - STUB IMPLEMENTATION". TODO comment indicates need for HTML→PDF implementation (e.g., Puppeteer/Chromium).

### File Storage (for Certificates)

- **Implementation:** `src/services/certificate-storage.ts` → `SupabaseCertificateStorage` class
- **Status:** ✅ **Complete** - Real Supabase Storage implementation with proper error handling (`CertificateStorageError`), upload to `certificates` bucket, public URL generation. **Note:** TODO comment about ensuring bucket exists in Supabase dashboard. Path convention: `certificates/{ticketNumber}-{ticketId}.pdf`.

### Orchestration / Workflow

- **Implementation:** `src/services/ticket-processing-service.ts` → `TicketProcessingService` class
- **Status:** ✅ **Complete** - Full orchestration workflow:
  1. Idempotency check
  2. Ticket loading
  3. CertificateData building
  4. PDF generation (delegates to stub)
  5. Storage (delegates to real Supabase storage)
  6. Success/failure recording
  
  Proper error categorization (needs_review vs failed), comprehensive error handling.

- **Service Factory:** `src/services/service-factory.ts` → `createTicketProcessingService()` function
- **Status:** ✅ **Complete** - Wires all dependencies correctly. Uses real Supabase storage but stub PDF generator.

---

## 3. Trace the Ticket → Certificate Flow

### Entry Point

**`TicketProcessingService.processClosedTicket(ticketId: string)`** is the high-level entry point.

### Step-by-Step Flow

#### Step 1: Idempotency Check
- **Action:** Calls `processedTicketsRepository.hasSuccessfulRecord(ticketId)`
- **Implementation:** ✅ Real - Queries PostgreSQL `processed_tickets` table for existing success record
- **Behavior:** If ticket already processed successfully, returns early (no-op)

#### Step 2: Load Ticket
- **Action:** Calls `apiClient.getTicketById(ticketId)`
- **Implementation:** ✅ Real - HTTP GET to Jifeline API `/v2/tickets/{id}` with OAuth2 Bearer token
- **Error Handling:** 
  - If `JifelineNotFoundError` (404): Records failure with status `needs_review` and returns
  - Other errors: Re-throws for higher-level handling
- **Extracts:** `ticketNumber`, `customerId` for error handling context

#### Step 3: Build CertificateData
- **Action:** Calls `certificateDataBuilder.buildForTicket(ticketId)`
- **Implementation:** ✅ Real - Orchestrates loading of multiple entities:
  1. Loads ticket (already done, but builder loads it again)
  2. Validates ticket has `customer_id`, `vehicle_model_id`, `finished_at`
  3. Loads customer and vehicle model in parallel
  4. Validates customer has `primary_location_id`
  5. Loads location and vehicle make in parallel
  6. Validates ticket has `operator_id`
  7. Loads employee
  8. Transforms data into `CertificateData` format
- **Jifeline API Calls:** 
  - `GET /v2/tickets/{id}` (if not already loaded)
  - `GET /v2/customers/{id}`
  - `GET /v2/vehicles/models/{id}`
  - `GET /v2/customers/locations/{id}`
  - `GET /v2/vehicles/makes/{id}`
  - `GET /v2/customers/employees/{id}`
- **Error Handling:** 
  - If `CertificateDataError`: Records failure with status `needs_review` and returns
  - Other errors: Re-throws for higher-level handling
- **Hardcoded Values:** 
  - `calibrationResult: 'Calibration Successful'`
  - `preScanNotes: 'NO DTCs'`
  - `postScanNotes: 'NO DTCs'`
  - `vehicleRegistration: null`
  - `vehicleMileage: null`
  - `calibrationToolUsed: null`
  - `systemName: null`

#### Step 4: Generate PDF
- **Action:** Calls `certificatePdfGenerator.generate(certificateData)`
- **Implementation:** ❌ **STUB** - Returns minimal valid PDF buffer with placeholder text
- **Behavior:** PDF contains only "Certificate PDF - Job #{jobNumber} - STUB IMPLEMENTATION"
- **Risk:** Not production-ready - certificates will not contain actual certificate content

#### Step 5: Store PDF and Get URL
- **Action:** Calls `certificateStorage.saveCertificatePdf({ ticketId, ticketNumber, buffer })`
- **Implementation:** ✅ Real - `SupabaseCertificateStorage`:
  1. Constructs path: `certificates/{ticketNumber}-{ticketId}.pdf`
  2. Uploads PDF buffer to Supabase Storage bucket `certificates` with `upsert: true`
  3. Generates public URL via `getPublicUrl(path)`
  4. Returns public URL string
- **Error Handling:** Wraps Supabase errors in `CertificateStorageError` with codes (`UPLOAD_FAILED`, `URL_GENERATION_FAILED`, `UNKNOWN`)
- **Error Handling in Orchestrator:** If storage fails, records failure with status `failed` and re-throws error

#### Step 6: Record Success
- **Action:** Calls `processedTicketsRepository.recordSuccess({ ticketId, ticketNumber, customerId, certificateUrl, rawPayload })`
- **Implementation:** ✅ Real - Inserts row into PostgreSQL `processed_tickets` table with:
  - `status: 'success'`
  - `certificate_url`: The public URL from storage
  - `raw_payload`: JSON snapshot of key certificate data
- **Error Handling:** Wraps database errors in `DatabaseError`, handles duplicate ticket_id (unique constraint violation)

### Error Flow Summary

- **Data/Validation Errors** (`CertificateDataError`, `JifelineNotFoundError`): Recorded as `needs_review` status, processing stops
- **System/Infrastructure Errors** (PDF generation, storage, database): Recorded as `failed` status, error re-thrown for monitoring
- **Idempotency:** Duplicate processing attempts are detected and skipped

### Stubs and TODOs in Flow

1. **PDF Generation:** ❌ Stub - Returns placeholder PDF
2. **CertificateData Fields:** Some hardcoded/null values (calibrationResult, preScanNotes, postScanNotes, vehicleRegistration, vehicleMileage, calibrationToolUsed, systemName)
3. **Supabase Bucket:** TODO comment about ensuring `certificates` bucket exists

---

## 4. Stubs, Risks, and Missing Pieces

### Stubs and Placeholders

#### 1. PDF Generation (`StubCertificatePdfGenerator`)

- **Location:** `src/services/certificate-pdf-generator.ts`
- **Current State:** Returns minimal valid PDF with placeholder text
- **TODO Comment:** "Replace with a proper HTML→PDF implementation (e.g., Puppeteer/Chromium)"
- **Production Impact:** 🔴 **CRITICAL** - Certificates will not contain actual certificate content
- **Recommendation:**
  - Implement HTML template system (e.g., Handlebars, EJS, or React Server Components)
  - Use Puppeteer/Chromium or similar headless browser to render HTML→PDF
  - Consider PDF libraries like `pdfkit` or `jsPDF` for programmatic PDF generation
  - Ensure proper styling, fonts, and layout matching certificate requirements
  - Add template validation and error handling
- **Risks:**
  - Performance: Headless browser PDF generation can be slow and memory-intensive
  - Scalability: May need dedicated worker processes or serverless functions for PDF generation
  - Font licensing: Ensure fonts used in certificates are properly licensed
  - Template maintenance: Changes to certificate format require code changes

#### 2. CertificateData Hardcoded Values

- **Location:** `src/services/certificate-data-builder.ts` (lines 176-183)
- **Current State:** 
  - `calibrationResult: 'Calibration Successful'` (hardcoded)
  - `preScanNotes: 'NO DTCs'` (hardcoded)
  - `postScanNotes: 'NO DTCs'` (hardcoded)
  - `vehicleRegistration: null` (placeholder)
  - `vehicleMileage: null` (placeholder)
  - `calibrationToolUsed: null` (placeholder)
  - `systemName: null` (placeholder)
- **Production Impact:** 🟡 **MODERATE** - Certificates will have placeholder/default values, missing real diagnostic data
- **Recommendation:**
  - Extract `calibrationResult` from ticket data or related entities
  - Extract `preScanNotes` and `postScanNotes` from ticket diagnostic data (DTCs, scan results)
  - Extract `vehicleRegistration` and `vehicleMileage` from ticket or vehicle data (may require additional API endpoints)
  - Extract `calibrationToolUsed` and `systemName` from ticket metadata (may require additional API endpoints or database fields)
- **Risks:**
  - Data availability: Some fields may not be available in Jifeline API
  - API changes: May require additional API calls or endpoints
  - Data quality: Need to handle missing or invalid data gracefully

#### 3. Supabase Storage Bucket Configuration

- **Location:** `src/services/certificate-storage.ts` (line 54-55)
- **Current State:** TODO comment: "Ensure the 'certificates' bucket exists and has the desired access configuration in the Supabase dashboard"
- **Production Impact:** 🟡 **MODERATE** - Runtime failure if bucket doesn't exist or has wrong permissions
- **Recommendation:**
  - Document bucket creation steps in deployment guide
  - Consider infrastructure-as-code (e.g., Terraform, Supabase migrations) to create bucket programmatically
  - Add bucket existence check or creation logic in startup/initialization
  - Document access policy (public vs signed URLs)
- **Risks:**
  - Manual configuration error: Bucket may not be created or configured correctly
  - Access control: Public URLs may expose certificates to unauthorized access (consider signed URLs or custom domain)
  - Storage costs: Monitor storage usage and implement retention policies if needed

### Missing Pieces

#### 1. HTTP Handlers / Entry Points

- **Location:** `src/handlers/` (empty, only `.gitkeep`)
- **Current State:** No HTTP handlers or serverless function entry points
- **Production Impact:** 🔴 **CRITICAL** - No way to trigger ticket processing from external systems
- **Recommendation:**
  - Implement webhook handler for Jifeline ticket closed events
  - Implement scheduled job handler for polling closed tickets
  - Implement admin API endpoints for manual processing and status queries
  - Add request validation, authentication, and rate limiting
- **Risks:**
  - Security: Need proper authentication/authorization for webhooks and admin endpoints
  - Scalability: Webhook handlers need to handle concurrent requests
  - Error handling: Need proper HTTP error responses and retry logic

#### 2. Observability / Logging

- **Current State:** Uses `console.log` for logging
- **Production Impact:** 🟡 **MODERATE** - Limited visibility into system behavior and errors
- **Recommendation:**
  - Integrate structured logging (e.g., Winston, Pino)
  - Add request tracing/correlation IDs
  - Add metrics/telemetry (e.g., Prometheus, DataDog)
  - Add error tracking (e.g., Sentry)
- **Risks:**
  - Debugging difficulty: Hard to trace issues in production
  - Performance monitoring: No visibility into slow operations
  - Alerting: No way to detect and alert on errors or failures

#### 3. Retry Logic

- **Current State:** No retry logic for transient failures (API calls, storage uploads)
- **Production Impact:** 🟡 **MODERATE** - Transient failures will cause permanent failures
- **Recommendation:**
  - Add exponential backoff retry logic for API calls
  - Add retry logic for storage uploads
  - Consider idempotent retries (check processed_tickets before retrying)
- **Risks:**
  - API rate limiting: Retries may hit rate limits
  - Duplicate processing: Need to ensure idempotency

#### 4. Testing Coverage

- **Current State:** Only one test file (`certificate-storage.test.ts`)
- **Production Impact:** 🟡 **MODERATE** - Limited test coverage increases risk of regressions
- **Recommendation:**
  - Add unit tests for `CertificateDataBuilder`
  - Add unit tests for `TicketProcessingService` (with mocked dependencies)
  - Add integration tests for end-to-end flow (with test database and mocked APIs)
  - Add tests for error handling paths
- **Risks:**
  - Regression bugs: Changes may break existing functionality
  - Confidence: Hard to verify correctness without tests

#### 5. Environment-Specific Configuration

- **Current State:** Single config loader, no environment-specific overrides
- **Production Impact:** 🟢 **LOW** - May need different configs for dev/staging/prod
- **Recommendation:**
  - Consider environment-specific config files or env var prefixes
  - Add config validation for environment-specific requirements
- **Risks:**
  - Configuration errors: Wrong configs may cause runtime failures

#### 6. Database Migrations Management

- **Current State:** Single migration file, no migration runner
- **Production Impact:** 🟢 **LOW** - Manual migration application
- **Recommendation:**
  - Add migration runner (e.g., `node-pg-migrate`, `knex`, or custom script)
  - Add migration version tracking
  - Document migration application process
- **Risks:**
  - Migration errors: Manual migrations may be applied incorrectly
  - Rollback: No rollback mechanism for failed migrations

### Notable TODOs

1. **`certificate-pdf-generator.ts:27`** - "Replace with a proper HTML→PDF implementation (e.g., Puppeteer/Chromium)"
2. **`certificate-storage.ts:54-55`** - "Ensure the 'certificates' bucket exists and has the desired access configuration in the Supabase dashboard"
3. **`certificate-data-builder.ts:179`** - Comment: "Placeholders for future phases" (for vehicleRegistration, vehicleMileage, calibrationToolUsed, systemName)

### Additional Risks

1. **OAuth Token Caching:** Token is cached in memory - may be lost on serverless cold starts or multi-instance deployments. Consider shared cache (Redis) for multi-instance scenarios.

2. **Database Connection Pooling:** Pool configuration (max: 10) may need tuning for serverless environments with many concurrent invocations.

3. **Error Handling:** Some errors are re-thrown but may not be properly logged or monitored. Consider adding error logging before re-throwing.

4. **Concurrent Processing:** No explicit locking mechanism - if same ticket is processed concurrently, idempotency check may pass for both, leading to duplicate processing. Consider database-level locking or distributed locking.

5. **Storage Path Collision:** Path format `certificates/{ticketNumber}-{ticketId}.pdf` assumes ticketNumber is unique. If ticketNumber can be reused, consider including timestamp or using ticketId only.

---

## 5. Summary Assessment

### Production Readiness: 🟡 **PARTIAL**

**Strengths:**
- ✅ Solid architecture with clear separation of concerns
- ✅ Comprehensive error handling and error categorization
- ✅ Real implementations for most core components (API client, storage, data building, orchestration)
- ✅ Proper idempotency handling
- ✅ Type-safe codebase with strict TypeScript
- ✅ Well-structured domain models

**Critical Gaps:**
- ❌ PDF generation is a stub - certificates will not contain actual content
- ❌ No HTTP handlers/entry points - cannot be triggered from external systems
- 🟡 Limited observability (console.log only)
- 🟡 Some CertificateData fields are hardcoded/null

**Recommendations for Production:**
1. **Immediate:** Implement real PDF generation with HTML templates and Puppeteer/Chromium
2. **Immediate:** Implement HTTP handlers for webhooks and scheduled jobs
3. **High Priority:** Add structured logging and error tracking
4. **High Priority:** Extract real values for CertificateData fields (calibrationResult, preScanNotes, postScanNotes, etc.)
5. **Medium Priority:** Add retry logic for transient failures
6. **Medium Priority:** Increase test coverage
7. **Low Priority:** Add migration runner and environment-specific config

The codebase shows strong engineering practices and is well-structured, but requires PDF generation and HTTP entry points before it can be deployed as a production system.


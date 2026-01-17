# Observability & Logging Implementation Summary

**Date:** December 8, 2025  
**Scope:** Ticket → Certificate pipeline observability and logging

---

## Logger Module Location

**File:** `src/services/logger.ts`

The centralized logger module provides a simple abstraction with three log levels:
- `info(message, meta?)` - Informational messages
- `warn(message, meta?)` - Warning messages  
- `error(message, meta?)` - Error messages

**Current Implementation:**
- Structured JSON output to console (stdout/stderr)
- Timestamp, level, message, and optional metadata
- Easy to swap for production logging providers (Winston, Pino, Datadog, etc.)

**Future Integration Points:**
- TODO: Add request correlation IDs for tracing requests across services
- TODO: Integrate with structured logging providers (Winston, Pino)
- TODO: Add log aggregation (Datadog, CloudWatch, etc.)
- TODO: Add error tracking (Sentry, Rollbar)
- TODO: Add metrics/telemetry integration
- TODO: Add log level filtering and environment-based configuration

---

## Instrumented Flows

### 1. TicketProcessingService (`src/services/ticket-processing-service.ts`)

**Severity: INFO**
- Start of processing: `info('Starting ticket processing', { ticketId })`
- Idempotency short-circuit: `info('Ticket already processed, skipping', { ticketId, status: 'already_processed' })`
- Success: `info('Ticket processed successfully', { ticketId, ticketNumber, customerId, certificateUrl, status: 'processed' })`

**Severity: WARN**
- Ticket not found: `warn('Ticket not found, recording as needs_review', { ticketId, errorCode: 'TICKET_NOT_FOUND' })`
- Business validation failure: `warn('Certificate data validation failed, recording as needs_review', { ticketId, ticketNumber, customerId, errorCode, errorMessage, status: 'needs_review' })`

**Severity: ERROR**
- System failure (PDF/storage): `error('System error during PDF generation or storage', { ticketId, ticketNumber, customerId, errorType, errorMessage, status: 'failed', step: 'pdf_generation_or_storage' })`

---

### 2. JifelineApiClient (`src/clients/jifeline-api-client.ts`)

**Severity: WARN**
- Resource not found (404): `warn('Jifeline API resource not found', { endpoint, statusCode, statusText })`
- Client errors (4xx): `warn('Jifeline API client error', { endpoint, statusCode, statusText })`

**Severity: ERROR**
- Server errors (5xx): `error('Jifeline API server error', { endpoint, statusCode, statusText })`
- Unexpected errors: `error('Jifeline API unexpected error', { endpoint, statusCode, statusText })`

**Note:** Does not log successful requests to avoid noise. Only logs failures. Does not log tokens or secrets.

---

### 3. CertificateDataBuilder (`src/services/certificate-data-builder.ts`)

**Severity: WARN**
- Missing ticket fields: `warn('Missing customer_id in ticket', { ticketId, errorCode })`
- Missing customer_id: `warn('Missing customer_id in ticket', { ticketId, errorCode })`
- Missing vehicle_model_id: `warn('Missing vehicle_model_id in ticket', { ticketId, errorCode })`
- Missing finished_at: `warn('Missing finished_at in ticket', { ticketId, errorCode })`
- Missing primary_location_id: `warn('Missing primary_location_id in customer', { ticketId, customerId, errorCode })`
- Missing operator_id: `warn('Missing operator_id in ticket', { ticketId, errorCode })`
- Entity not found errors:
  - `warn('Customer not found', { customerId, errorCode })`
  - `warn('Location not found', { locationId, errorCode })`
  - `warn('Employee not found', { employeeId, errorCode })`
  - `warn('Vehicle model not found', { modelId, errorCode })`
  - `warn('Vehicle make not found', { makeId, errorCode })`

**Note:** All warnings include the specific `errorCode` from `CertificateDataErrorCode` enum.

---

### 4. ChromiumCertificatePdfGenerator (`src/services/certificate-pdf-generator.ts`)

**Severity: INFO**
- Start: `info('Starting PDF generation', { jobNumber })`
- Success: `info('PDF generation completed successfully', { jobNumber, pdfSize })`

**Severity: ERROR**
- Validation failure: `error('PDF generation validation failed', { jobNumber, errorCode, errorMessage })`
- Empty buffer: `error('PDF generation failed: empty buffer', { jobNumber, errorCode })`
- Invalid PDF format: `error('PDF generation failed: invalid PDF format', { jobNumber, errorCode })`
- General failure: `error('PDF generation failed', { jobNumber, errorCode, errorMessage })`
- Unexpected error: `error('PDF generation failed with unexpected error', { jobNumber, errorCode, errorMessage })`

**Note:** All errors include the `errorCode` from `CertificatePdfErrorCode` type.

---

### 5. CertificateStorage - Supabase (`src/services/certificate-storage.ts`)

**Severity: INFO**
- Upload success: `info('Certificate PDF stored successfully', { ticketId, ticketNumber, bucket, path, certificateUrl })`

**Severity: ERROR**
- Upload failure: `error('Certificate storage upload failed', { ticketId, ticketNumber, bucket, path, errorCode })`
- URL generation failure: `error('Certificate storage URL generation failed', { ticketId, ticketNumber, bucket, path, errorCode })`
- URL missing: `error('Certificate storage URL missing', { ticketId, ticketNumber, bucket, path, errorCode })`
- Unexpected error: `error('Certificate storage unexpected error', { ticketId, ticketNumber, bucket, path, errorCode })`

**Note:** Logs include bucket name and storage path for debugging.

---

### 6. ProcessedTicketsRepository (`src/services/processed-tickets-repository.ts`)

**Severity: INFO**
- Success recorded: `info('Ticket processing success recorded', { ticketId, ticketNumber, customerId, status: 'success', hasCertificateUrl })`
- Failure recorded: `info('Ticket processing failure recorded', { ticketId, ticketNumber, customerId, status, errorMessage })`

**Severity: WARN**
- Duplicate ticket_id (success): `warn('Duplicate ticket_id detected when recording success', { ticketId, ticketNumber, customerId })`
- Duplicate ticket_id (failure): `warn('Duplicate ticket_id detected when recording failure', { ticketId, ticketNumber, customerId, status })`

**Severity: ERROR**
- Database error (success): `error('Database error recording ticket success', { ticketId, ticketNumber, customerId })`
- Database error (failure): `error('Database error recording ticket failure', { ticketId, ticketNumber, customerId, status })`
- Failed to record: `error('Failed to record successful processing', { ticketId, ticketNumber, customerId })` or `error('Failed to record failed processing', { ticketId, ticketNumber, customerId, status })`

---

### 7. HTTP Handler (`src/handlers/process-ticket.ts`)

**Severity: INFO**
- Already processed: `info('Ticket processing request: already processed', { ticketId, status: 'already_processed' })`
- Processed successfully: `info('Ticket processing request: processed successfully', { ticketId, status: 'processed' })`
- Needs review: `info('Ticket processing request: needs review', { ticketId, status: 'needs_review' })`
- Processed (status unknown): `info('Ticket processing request: processed (status unknown)', { ticketId, status: 'processed' })`
- Processed (status check failed): `info('Ticket processing request: processed (status check failed)', { ticketId, status: 'processed' })`

**Severity: WARN**
- Invalid HTTP method: `warn('Invalid HTTP method for process-ticket endpoint', { method })`
- Invalid request body: `warn('Invalid request body for process-ticket', { bodyType })`
- Missing ticketId: `warn('Missing ticketId in request body')`
- Invalid ticketId: `warn('Invalid ticketId in request body', { ticketIdType, ticketIdLength })`
- Request body parsing error: `warn('Request body parsing error', { errorMessage })`
- Status check failed: `warn('Failed to check ticket status after processing', { ticketId, errorMessage })`
- CertificateDataError in handler: `warn('Ticket processing request: needs review (CertificateDataError in handler)', { ticketId, status: 'needs_review', errorCode })`

**Severity: ERROR**
- System error: `error('Ticket processing request: system error', { ticketId, status: 'failed', errorType, errorMessage })`

---

## Logging Quality Features

### Security
- ✅ **No secrets logged:** Tokens, API keys, and sensitive data are never included in logs
- ✅ **No raw payloads:** Only key identifiers and error codes are logged, not full request/response bodies
- ✅ **Sanitized error messages:** Error messages are logged but full stack traces are not exposed to clients

### Consistency
- ✅ **Consistent field names:** All logs use standardized fields:
  - `ticketId` - Jifeline ticket UUID
  - `ticketNumber` - Sequential ticket number
  - `customerId` - Jifeline customer UUID
  - `status` - Processing status (processed, already_processed, needs_review, failed)
  - `errorCode` - Structured error code (e.g., 'MISSING_CUSTOMER_ID', 'UPLOAD_FAILED')
  - `errorMessage` - Human-readable error message
  - `errorType` - Error class name (for system errors)
  - `jobNumber` - Job number for PDF generation
  - `bucket`, `path` - Storage location identifiers
  - `certificateUrl` - Generated certificate URL (on success)

### Structured Format
- ✅ **JSON output:** All logs are structured JSON for easy parsing and aggregation
- ✅ **Timestamp included:** ISO 8601 timestamps for all log entries
- ✅ **Level-based routing:** Uses appropriate console methods (log, warn, error) for log levels

---

## Future Observability Enhancements (TODOs)

### Correlation IDs
- **TODO:** Add request correlation IDs to trace requests across services
- **TODO:** Propagate correlation IDs through async operations
- **Location:** Logger module and HTTP handler

### Metrics & Telemetry
- **TODO:** Add metrics for:
  - Processing duration per ticket
  - Success/failure rates by status
  - API call latencies
  - PDF generation duration and size
  - Storage upload success rates
- **Location:** Instrumentation points in TicketProcessingService, JifelineApiClient, PDF generator

### Advanced Logging Features
- **TODO:** Add log level filtering (e.g., only ERROR in production)
- **TODO:** Add environment-based configuration (dev vs prod)
- **TODO:** Add log sampling for high-volume endpoints
- **Location:** Logger module configuration

### Integration with Observability Providers
- **TODO:** Replace console output with Winston/Pino for production
- **TODO:** Integrate with Datadog/CloudWatch for log aggregation
- **TODO:** Integrate with Sentry for error tracking and alerting
- **TODO:** Add distributed tracing (e.g., OpenTelemetry)
- **Location:** Logger module implementation

### Performance Monitoring
- **TODO:** Add performance metrics (p50, p95, p99 latencies)
- **TODO:** Add resource usage metrics (memory, CPU)
- **Location:** Service instrumentation points

---

## Summary

The ticket → certificate pipeline is now fully instrumented with structured logging at all critical decision points and error paths. Logs are:

- **Structured** - JSON format for easy parsing
- **Secure** - No secrets or sensitive data
- **Consistent** - Standardized field names across all components
- **Comprehensive** - Covers all major flows and error conditions
- **Production-ready** - Easy to integrate with logging providers

The logging abstraction allows for seamless migration to production logging providers without changing calling code.


# Script Inventory & Diagnostic Setup

**Date:** December 2024  
**Purpose:** Inventory existing scripts and create live diagnostic tools

---

## PART 1: EXISTING SCRIPTS INVENTORY

### Package.json Scripts (26 scripts)

| Script | Command | Purpose | Status |
|--------|---------|---------|--------|
| `check:jifeline` | `dotenv -e .env -- tsx scripts/check-jifeline-connection.ts` | Test Jifeline API connectivity | ✅ Functional |
| `list:tickets` | `dotenv -e .env -- tsx scripts/list-jifeline-tickets.ts` | List Jifeline tickets | ✅ Functional |
| `test:conversation` | `dotenv -e .env -- tsx scripts/test-conversation-text.ts` | Test conversation extraction | ✅ Functional |
| `test:conversation:number` | `dotenv -e .env -- tsx scripts/test-conversation-by-number.ts` | Test conversation by ticket number | ✅ Functional |
| `discover:conversations` | `dotenv -e .env -- tsx scripts/discover-conversations.ts` | Discover conversations | ✅ Functional |
| `test:pipeline` | `dotenv -e .env -- tsx scripts/test-full-pipeline.ts` | Test full pipeline | ✅ Functional |
| `test:pipeline:uuid` | `dotenv -e .env -- tsx scripts/test-pipeline-by-uuid.ts` | Test pipeline by UUID | ✅ Functional |
| `check:processed` | `dotenv -e .env -- tsx scripts/check-processed-tickets.ts` | Check processed tickets in DB | ✅ Functional |
| `find:complete` | `dotenv -e .env -- tsx scripts/find-complete-ticket.ts` | Find complete ticket | ✅ Functional |
| `fetch:more` | `dotenv -e .env -- tsx scripts/fetch-more-tickets.ts` | Fetch more tickets | ✅ Functional |
| `examine:ticket` | `dotenv -e .env -- tsx scripts/examine-ticket-structure.ts` | Examine ticket structure | ✅ Functional |
| `test:business` | `dotenv -e .env -- tsx scripts/test-business-endpoints.ts` | Test business endpoints | ✅ Functional |
| `test:partner` | `dotenv -e .env -- tsx scripts/test-partner-endpoints.ts` | Test partner endpoints | ✅ Functional |
| `list:customers` | `dotenv -e .env -- tsx scripts/list-customers.ts` | List customers | ✅ Functional |
| `test:supabase:storage` | `dotenv -e .env -- tsx scripts/test-supabase-storage.ts` | Test Supabase storage | ✅ Functional |
| `test:db` | `dotenv -e .env -- tsx scripts/test-db-connection.ts` | Test database connection | ✅ Functional |
| `test:jifeline` | `dotenv -e .env -- tsx scripts/test-jifeline-api.ts` | Test Jifeline API | ✅ Functional |
| `audit:ticket` | `dotenv -e .env -- tsx scripts/audit-ticket.ts` | Audit ticket | ✅ Functional |
| `test:integration` | `dotenv -e .env -- tsx scripts/run-integration-tests.ts` | Run integration tests | ✅ Functional |
| `test:events` | `dotenv -e .env -- tsx scripts/test-events-api.ts` | Test events API | ✅ Functional |
| `poll:tickets` | `dotenv -e .env -- tsx scripts/poll-and-process-closed-tickets.ts` | Poll and process tickets | ✅ Functional |
| `migrate` | `dotenv -e .env -- tsx scripts/run-migration.ts` | Run database migration | ✅ Functional |

### Test Files (4 files)

| File | Purpose | Status |
|------|---------|--------|
| `src/handlers/__tests__/process-ticket.test.ts` | Handler unit tests | ✅ Functional |
| `src/services/__tests__/reg-mileage-extractor.test.ts` | Extractor unit tests | ✅ Functional |
| `src/services/__tests__/certificate-storage.test.ts` | Storage unit tests | ✅ Functional |
| `src/services/__tests__/certificate-pdf-generator.test.ts` | PDF generator unit tests | ✅ Functional |

### Stale Documentation Files (30 MD files - IGNORE FOR LIVE TESTING)

**These are historical audit reports - DO NOT READ FOR CURRENT STATE:**

- `FULL_PLATFORM_AUDIT.md` - Historical audit
- `PRODUCTION_READINESS_AUDIT.md` - Historical audit
- `SYSTEM_DIAGNOSTIC_REPORT.md` - Historical audit
- `TECHNICAL_AUDIT.md` - Historical audit
- `JIFELINE_API_AUDIT.md` - Historical audit
- `SUPABASE_ARCHITECTURE_AUDIT.md` - Historical audit
- `PROJECT_STATUS.md` - Historical status
- `EVENTS_API_IMPLEMENTATION_SUMMARY.md` - Historical summary
- `CONVERSATION_ENDPOINT_IMPLEMENTATION.md` - Historical summary
- `TICKET_9111450_TEST_RESULTS.md` - Historical test results
- `TICKET_BY_NUMBER_TEST.md` - Historical test results
- `CONNECTIVITY_TEST_REPORT.md` - Historical report
- `ENDPOINT_FIX_SUMMARY.md` - Historical summary
- `LIST_TICKETS_AUDIT.md` - Historical audit
- `LIST_TICKETS_ENDPOINT_FIX.md` - Historical fix
- `LIST_TICKETS_SCRIPT_SUMMARY.md` - Historical summary
- `PERMISSIONS_ISSUE_REPORT.md` - Historical report
- `SUPABASE_STORAGE_DEBUG.md` - Historical debug
- `SUPABASE_HTTP_VERIFICATION.md` - Historical verification
- `PIPELINE_SETUP_GUIDE.md` - Historical guide
- `LOGGING_SUMMARY.md` - Historical summary
| `SCRIPTS_SETUP_SUMMARY.md` - Historical summary
- `SCRIPT_VALIDATION_REPORT.md` - Historical report
- `AUTOMATED_TESTING_SCRIPTS_SUMMARY.md` - Historical summary
- `INTEGRATION_TEST_SUITE_SUMMARY.md` - Historical summary
- `GET_TICKET_CONVERSATION_IMPLEMENTATION.md` - Historical implementation
- `CONVERSATION_TEST_RESULTS.md` - Historical results
- `EVENTS_AND_CONVERSATION_TEST_RESULTS.md` - Historical results
- `AUDIT_TICKET_EXAMPLE.md` - Historical example

**Note:** These files contain historical information. For current system state, use LIVE diagnostic scripts below.

---

## PART 2: NEW LIVE DIAGNOSTIC SCRIPTS

**Location:** `src/scripts/diagnostics/`

**Purpose:** Run LIVE tests against CURRENT codebase and APIs

---

## PART 3: HOW TO RUN DIAGNOSTICS

```bash
# Run all diagnostics
npm run diagnostic:all

# Run individual diagnostics
npm run diagnostic:apis
npm run diagnostic:ticket <TICKET_ID>
npm run diagnostic:gpt-prompt
npm run diagnostic:validations
npm run diagnostic:errors
```

---

**End of Inventory**

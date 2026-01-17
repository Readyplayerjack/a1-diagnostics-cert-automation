# Diagnostic Scripts - Quick Start

## 📋 EXISTING SCRIPTS INVENTORY

**Found: 26 scripts in `scripts/` directory**
- All functional and ready to use
- Use `dotenv -e .env -- tsx` pattern for environment loading

**Found: 4 test files in `src/**/__tests__/`**
- Unit tests for handlers and services

**Found: 30 MD files (HISTORICAL - IGNORE)**
- These are old audit reports - do not use for current state
- Use LIVE diagnostic scripts instead

---

## 🆕 NEW LIVE DIAGNOSTIC SCRIPTS

**Location:** `scripts/diagnostics/`

### Created Scripts:

1. ✅ `test-api-connections.ts` - Test Jifeline, OpenAI, Supabase APIs
2. ✅ `test-real-ticket.ts` - Test full pipeline with real ticket ID
3. ✅ `audit-gpt-prompt.ts` - Show actual GPT prompt being used
4. ✅ `check-validations.ts` - Test registration/mileage validation
5. ✅ `test-error-handling.ts` - Test error handling mechanisms
6. ✅ `run-all.ts` - Run all diagnostics in sequence

---

## 🚀 HOW TO RUN DIAGNOSTICS

### Run All Diagnostics:
```bash
npm run diagnostic:all
```

### Run Individual Diagnostics:

**Test API Connections:**
```bash
npm run diagnostic:apis
```
Tests: Jifeline Events API, OpenAI API, Supabase Database & Storage

**Test Real Ticket:**
```bash
npm run diagnostic:ticket <TICKET_ID>
```
Example:
```bash
npm run diagnostic:ticket abc12345-def6-7890-ghij-klmnopqrstuv
```
Tests: Full pipeline with real ticket (fetch, conversation, extraction, validation)

**Audit GPT Prompt:**
```bash
npm run diagnostic:gpt-prompt
```
Shows: Actual prompt being sent to GPT-4o-mini, tests with sample data

**Check Validations:**
```bash
npm run diagnostic:validations
```
Tests: Registration format validation, mileage range validation

**Test Error Handling:**
```bash
npm run diagnostic:errors
```
Tests: 404 handling, malformed responses, timeout/retry/rate limiting status

---

## 📊 WHAT EACH DIAGNOSTIC DOES

### `diagnostic:apis`
- ✅ Fetches 1 event from Jifeline Events API (real call)
- ✅ Sends test prompt to OpenAI (real call)
- ✅ Queries Supabase database (real query)
- ✅ Checks Supabase storage bucket exists
- **Output:** ✓/✗ for each API with details

### `diagnostic:ticket <TICKET_ID>`
- ✅ Fetches ticket from Jifeline
- ✅ Gets conversation text
- ✅ Runs GPT extraction
- ✅ Validates extracted data quality
- ✅ Shows confidence scores
- **Output:** Full extraction results with quality assessment

### `diagnostic:gpt-prompt`
- ✅ Shows EXACT prompt from current code (not old docs)
- ✅ Tests with sample conversation
- ✅ Shows input/output
- ✅ Rates prompt quality (0-10)
- **Output:** Complete prompt + test results + quality score

### `diagnostic:validations`
- ✅ Tests registration validation with 8 test cases
- ✅ Tests mileage validation with 8 test cases
- ✅ Shows which validations exist vs missing
- **Output:** Pass/fail for each test case + missing validations list

### `diagnostic:errors`
- ✅ Tests 404 error handling
- ✅ Tests malformed GPT response handling
- ✅ Checks for timeout handling (currently missing)
- ✅ Checks for retry logic (currently missing)
- ✅ Checks for rate limiting (currently missing)
- **Output:** Status of each error handling mechanism

---

## ⚠️ IMMEDIATE NEXT STEP

**After scripts are created, run:**

```bash
npm run diagnostic:all
```

This will give you **LIVE results** from the **CURRENT codebase** - no reading old reports, just real API calls and real code execution.

---

## 📝 Notes

- All scripts use `dotenv -e .env` to load environment variables
- All scripts make REAL API calls (not mocks)
- All scripts test CURRENT code (not historical documentation)
- Scripts exit with code 0 on success, 1 on failure

---

**End of Diagnostic Scripts README**

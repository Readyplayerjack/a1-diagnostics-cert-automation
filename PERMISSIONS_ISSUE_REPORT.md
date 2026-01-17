# Jifeline API Permissions Issue Report

**Date:** December 16, 2025  
**Issue:** Customer endpoint access denied

## Findings

### Customer List Endpoint
- ❌ `GET /v2/customers` → 404 Not Found
- ❌ `GET /v2/customers?enabled=true` → 404 Not Found  
- ❌ `GET /v2/customers?enabled=true&limit=100` → 404 Not Found
- ❌ `GET /v2/customers?limit=100` → 404 Not Found

### Individual Customer Endpoints
- ❌ All customer IDs from test tickets return 404
- Tested customer IDs:
  - `224f7381-1d28-40fc-94ce-f865f133b6e6` (ticket #9111450)
  - `5fe0d057-9b24-4a0d-9869-77741f6b07c7` (ticket #9115103)
  - `79618294-f11c-49b0-8965-61636d1eaef7` (ticket #9108850)
  - `3fbbf3a6-8cb9-4dc8-991c-6e9fdd6270c7` (ticket #9112745)
  - `a0bad234-b96a-45e5-9166-94c18cd38cdb` (ticket #9115337)

## Confirmed Working Endpoints
- ✅ `GET /v2/tickets/tickets/{id}` - Ticket fetching works
- ✅ `GET /v2/system/events` - Events API works
- ✅ OAuth2 token acquisition works

## Impact
- **Blocked:** Certificate generation (requires customer `company_name` for workshop name)
- **Blocked:** Full pipeline test (PDF generation → Storage upload)
- **Working:** Ticket fetching, conversation extraction, database writes

## Recommendation

**Contact Rishi/Jifeline to:**
1. Verify API credentials have access to `/v2/customers` endpoint (list and individual)
2. Confirm whether customer IDs in test tickets are:
   - Archived/deleted
   - From a different environment
   - Outside API credentials' access scope
3. Request a valid test ticket UUID with accessible customer data
4. Verify API credentials have the correct permissions/scope for customer endpoints

## Next Steps
Once customer endpoint access is confirmed:
1. Run `npm run list:customers` to list active customers
2. Find a ticket associated with an accessible customer
3. Run `npm run test:pipeline:uuid -- <ticket-uuid>` to test full pipeline

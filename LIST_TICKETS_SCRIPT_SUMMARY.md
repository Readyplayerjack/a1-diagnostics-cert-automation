# List Tickets Script Summary

**Script File:** `scripts/list-jifeline-tickets.ts`  
**NPM Script:** `list:tickets`  
**Status:** ✅ Updated with defaults and full UUID display

---

## Confirmed Details

### File Path
✅ **`scripts/list-jifeline-tickets.ts`**

### NPM Script
✅ **`"list:tickets": "dotenv -e .env -- tsx scripts/list-jifeline-tickets.ts"`**

### Default Behavior
✅ **Defaults Applied:**
- `state = 'closed'` (default)
- `limit = 20` (default)

### Output Fields
✅ **Each ticket row includes:**
- `id` (full UUID - no truncation)
- `ticket_number` (integer)
- `state` (string: 'closed', 'in_progress', etc.)
- `finished_at` (ISO date string or 'N/A')

---

## Expected Output Format

### Command
```bash
npm run list:tickets -- --state closed --limit 20
```

### Example Output (Success)

```
Fetching tickets from Jifeline API...
Limit: 20
State filter: closed

✓ Configuration loaded successfully
Fetching tickets...

✓ Success! Found 20 ticket(s)

Tickets Table:

 # | Ticket #   | ID                                      | State        | Finished  
--------------------------------------------------------------------------------------------------------
  1 | 9111450    | 123e4567-e89b-12d3-a456-426614174000 | closed       | 2024-01-15
  2 | 9111442    | 456e7890-e89b-12d3-a456-426614174001 | closed       | 2024-01-14
  3 | 9111271    | 789e0123-e89b-12d3-a456-426614174002 | closed       | 2024-01-13
  ...

Tickets JSON (for easy copying):

[
  {
    "ticket_number": 9111450,
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "state": "closed",
    "finished_at": "2024-01-15T10:30:00Z",
    "customer_id": "789abc12-e89b-12d3-a456-426614174001",
    "created_at": "2024-01-15T09:00:00Z"
  },
  {
    "ticket_number": 9111442,
    "id": "456e7890-e89b-12d3-a456-426614174001",
    "state": "closed",
    "finished_at": "2024-01-14T15:20:00Z",
    "customer_id": "012def34-e89b-12d3-a456-426614174002",
    "created_at": "2024-01-14T14:00:00Z"
  },
  ...
]

💡 Tip: Use the ticket ID (UUID) with the connectivity check:
   npm run check:jifeline -- 123e4567-e89b-12d3-a456-426614174000
```

### Example Output (No Tickets Found)

```
Fetching tickets from Jifeline API...
Limit: 20
State filter: closed

✓ Configuration loaded successfully
Fetching tickets...

✓ Success! Found 0 ticket(s)

Tickets Table:

No tickets found.

Tickets JSON (for easy copying):

[]
```

### Example Output (Error - API Returns Non-2xx)

```
Fetching tickets from Jifeline API...
Limit: 20
State filter: closed

✓ Configuration loaded successfully
Fetching tickets...

✗ Failed to fetch tickets from Jifeline API

Client Error (403):
  Client error: 403 Forbidden

Response details:
{
  "type": "about:blank",
  "title": "Forbidden",
  "status": 403,
  "detail": "You do not have permission to access this resource"
}

Please check:
  - Your API credentials are correct
  - Your API credentials have the required permissions
  - The query parameters are valid

Troubleshooting:
  1. Verify JIFELINE_API_BASE_URL points to the correct environment
  2. Verify JIFELINE_CLIENT_ID and JIFELINE_CLIENT_SECRET are correct
  ...
```

---

## Usage Examples

### Default (Closed Tickets, Limit 20)
```bash
npm run list:tickets
```

### Override Limit Only
```bash
npm run list:tickets -- --limit 10
# Uses: state=closed, limit=10
```

### Override State Only
```bash
npm run list:tickets -- --state in_progress
# Uses: state=in_progress, limit=20
```

### Explicit Both
```bash
npm run list:tickets -- --limit 50 --state closed
# Uses: state=closed, limit=50
```

### Other States
```bash
npm run list:tickets -- --state pending
npm run list:tickets -- --state prepared
npm run list:tickets -- --state cancelled
```

---

## Changes Made

1. ✅ **Default State:** Changed from `undefined` to `'closed'`
2. ✅ **Default Limit:** Changed from `10` to `20`
3. ✅ **UUID Display:** Changed from truncated (first 8 chars + '...') to full UUID
4. ✅ **Table Format:** Updated header to accommodate full UUID
5. ✅ **Removed Customer ID:** Simplified table to focus on key fields (id, ticket_number, state, finished_at)
6. ✅ **Documentation:** Updated usage examples in script header

---

## Key Features

- **Full UUID Display:** Ticket IDs are shown in full (no truncation) for easy copying
- **Default to Closed:** Automatically filters for closed tickets (most relevant for certificate generation)
- **Clear Error Messages:** Non-2xx responses show detailed error information
- **Dual Format:** Both table and JSON output for different use cases
- **Easy Copy:** JSON format makes it easy to copy UUIDs for testing

---

**End of Summary**


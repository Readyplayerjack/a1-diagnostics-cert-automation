# listTickets() Method Audit Report

**Date:** Implementation audit  
**Method:** `JifelineApiClient.listTickets()`  
**Purpose:** Clarify exact behavior, parameters, and "recent" definition

---

## Implementation Summary

### Endpoint
**Endpoint:** `GET /v2/tickets`

**Base URL:** `{JIFELINE_API_BASE_URL}/v2/tickets`

**Full URL Example:**
```
https://partner-api-001.prd.jifeline.cloud/v2/tickets
```

---

### Query Parameters

**Parameters Sent:**

| Parameter | When Sent | Value | Notes |
|-----------|-----------|-------|-------|
| `limit` | Only if `options.limit` is provided | Integer string | No default in method; script defaults to 10 |
| `state` | Only if `options.state` is provided | One of: `prepared`, `pending`, `in_progress`, `outsourced`, `closed`, `cancelled` | Server-side filtering |

**Parameters NOT Sent:**
- ❌ `offset` - Not implemented (no pagination support)
- ❌ `sort` - Not implemented (no ordering control)
- ❌ `order_by` - Not implemented (no ordering control)
- ❌ `order` (asc/desc) - Not implemented
- ❌ Date filters (`created_at`, `finished_at`, etc.) - Not implemented
- ❌ `page` - Not implemented

**Example Query Strings:**

| Call | Query String |
|------|--------------|
| `listTickets()` | (none) |
| `listTickets({ limit: 10 })` | `?limit=10` |
| `listTickets({ state: 'closed' })` | `?state=closed` |
| `listTickets({ limit: 20, state: 'closed' })` | `?limit=20&state=closed` |

---

### Default Behavior

**When called with no arguments: `listTickets()`**

1. **Endpoint called:** `GET /v2/tickets` (no query parameters)
2. **Limit:** **Unknown** - Depends on Jifeline API default (not specified in code)
3. **Offset:** None (first page only)
4. **Ordering:** **Unknown** - Depends on Jifeline API default ordering
5. **State filter:** None (all states returned if API allows)

**When called from script: `npm run list:tickets`**

1. **Script default:** `limit: 10` (set in script, not method)
2. **Endpoint called:** `GET /v2/tickets?limit=10`
3. **Ordering:** **Unknown** - Depends on Jifeline API default
4. **State filter:** None (unless `--state` flag used)

---

### Sorting

**Current Implementation:**
- ❌ **No sorting parameters sent to API**
- ❌ **No client-side sorting**
- ⚠️ **Order is determined by Jifeline API default behavior (unknown)**

**What this means:**
- The order of returned tickets is **not guaranteed** or documented
- Could be:
  - Most recently created (`created_at DESC`)
  - Most recently updated (`updated_at DESC`)
  - Most recently closed (`finished_at DESC`)
  - Ticket number ascending/descending
  - Random or undefined order
  - **We don't know without testing the API**

---

### State Filtering

**Implementation:** ✅ **Server-side filtering**

**When `--state closed` is used:**

1. **Query parameter sent:** `?state=closed`
2. **Filtering location:** Server-side (Jifeline API filters before returning)
3. **Client-side filtering:** None (all returned tickets match the state)

**Example:**
```typescript
// Script call: npm run list:tickets -- --state closed
// Method call: listTickets({ state: 'closed' })
// API call: GET /v2/tickets?limit=10&state=closed
// Result: Only closed tickets returned by API
```

**When no state filter:**

- All ticket states may be returned (depends on API permissions)
- Open and closed tickets mixed together
- Order still unknown

---

### Pagination Handling

**Current Implementation:** ⚠️ **Partial support**

**What's handled:**
- ✅ Detects if API returns direct array: `Ticket[]`
- ✅ Detects if API returns paginated wrapper: `{ data: Ticket[] }`
- ✅ Extracts tickets from either format

**What's NOT handled:**
- ❌ Pagination metadata (`total`, `page`, `pages`, `per_page`, etc.)
- ❌ Multiple page fetching (only first page)
- ❌ Offset/limit pagination
- ❌ Cursor-based pagination
- ❌ Total count display

**Response Format Handling:**

```typescript
// Handles format 1: Direct array
GET /v2/tickets?limit=10
Response: [Ticket, Ticket, ...]

// Handles format 2: Paginated wrapper
GET /v2/tickets?limit=10
Response: { data: [Ticket, Ticket, ...] }

// Does NOT handle format 3: Full pagination metadata
GET /v2/tickets?limit=10
Response: {
  query: { limit: 10, offset: 0 },
  result: [Ticket, Ticket, ...],
  total: 1000  // ← This is ignored
}
```

**If API returns 1000 total tickets but limit is 10:**
- ✅ Only 10 tickets are returned (API respects limit)
- ❌ Total count is not displayed
- ❌ No way to fetch next page
- ❌ No indication that more tickets exist

---

## "Recent" Definition

### Current Reality: ⚠️ **Unclear / Not Guaranteed**

**The Problem:**
- The script comment says "recent tickets" but the implementation doesn't guarantee recency
- No sorting parameters are sent to the API
- Order depends entirely on Jifeline API default behavior

**What "Recent" Could Mean (Unknown):**
1. **Most recently created** (`created_at DESC`) - Likely but not confirmed
2. **Most recently updated** (`updated_at DESC`) - Possible
3. **Most recently closed** (`finished_at DESC`) - Possible
4. **Highest ticket number** (`ticket_number DESC`) - Possible
5. **No specific order** - Also possible

**What We Know:**
- ❌ Not guaranteed to be "most recently closed"
- ❌ Not guaranteed to be "most recently created"
- ❌ Order is **undefined** until we test the API

---

## Potential Issues

### 1. Unknown Default Limit

**Issue:** If `listTickets()` is called without a limit, the API default is unknown.

**Impact:**
- Could return 10 tickets
- Could return 100 tickets
- Could return all tickets (performance risk)
- Could return 0 tickets (unlikely)

**Mitigation:** Script always provides `limit: 10` default, so this is avoided in practice.

### 2. Unknown Ordering

**Issue:** Tickets may not be in the order you expect.

**Impact:**
- "Recent" tickets might actually be old tickets
- Closed tickets might be mixed with open tickets
- No way to guarantee "most recently closed" without testing

**Mitigation:** Test the API to determine default ordering, then document or add sorting params.

### 3. No Pagination Support

**Issue:** Can only fetch first page of results.

**Impact:**
- If you need ticket #500, you can't get it
- No way to iterate through all tickets
- Total count unknown

**Mitigation:** Acceptable for discovery/testing use case, but limits utility.

### 4. Incomplete Pagination Metadata Handling

**Issue:** If API returns `{ query, result, total }` format, `total` is ignored.

**Impact:**
- Can't display "Showing 10 of 1000 tickets"
- Can't implement proper pagination later
- No visibility into total available tickets

**Mitigation:** Acceptable for initial implementation, but should be enhanced if needed.

### 5. State Filter Without Limit

**Issue:** If you call `listTickets({ state: 'closed' })` without limit, API default applies.

**Impact:**
- Could return all closed tickets (thousands)
- Performance risk
- Memory risk

**Mitigation:** Script always provides limit default, so avoided in practice.

---

## Recommendations

### Immediate (Before Testing)

1. **Document Unknown Behavior:**
   - Add comment to method: "Ordering is determined by API default (unknown)"
   - Update script comment: "Fetch a list of tickets (order not guaranteed)"

2. **Test API Default Behavior:**
   - Run `npm run list:tickets` and observe order
   - Check if tickets are sorted by `created_at`, `finished_at`, or `ticket_number`
   - Document findings

### Short-Term (After Testing)

3. **Add Sorting Parameters (if API supports):**
   ```typescript
   async listTickets(options?: {
     limit?: number;
     state?: Ticket['state'];
     sortBy?: 'created_at' | 'finished_at' | 'ticket_number';
     order?: 'asc' | 'desc';
   }): Promise<Ticket[]>
   ```

4. **Add Offset for Pagination:**
   ```typescript
   async listTickets(options?: {
     limit?: number;
     offset?: number;
     state?: Ticket['state'];
   }): Promise<{ tickets: Ticket[]; total?: number; offset: number }>
   ```

5. **Handle Full Pagination Metadata:**
   ```typescript
   // Detect and extract: { query, result, total }
   if ('result' in response && 'total' in response) {
     return {
       tickets: response.result,
       total: response.total,
       offset: response.query?.offset ?? 0
     };
   }
   ```

### Long-Term (If Needed)

6. **Add Date Filtering:**
   ```typescript
   async listTickets(options?: {
     limit?: number;
     state?: Ticket['state'];
     finishedAfter?: string; // ISO date
     finishedBefore?: string; // ISO date
   }): Promise<Ticket[]>
   ```

7. **Add Ticket Number Range Filter:**
   ```typescript
   async listTickets(options?: {
     limit?: number;
     state?: Ticket['state'];
     ticketNumberMin?: number;
     ticketNumberMax?: number;
   }): Promise<Ticket[]>
   ```

---

## Testing Checklist

Before relying on this method, test:

- [ ] **Default ordering:** What order are tickets returned in?
- [ ] **Default limit:** How many tickets returned if no limit specified?
- [ ] **State filter:** Does `?state=closed` work correctly?
- [ ] **Response format:** Does API return array or `{ data: [] }` or `{ result: [] }`?
- [ ] **Pagination metadata:** Does API include `total`, `page`, etc.?
- [ ] **Closed tickets order:** Are closed tickets sorted by `finished_at DESC`?

---

## Expected Behavior Summary

### When You Run: `npm run list:tickets`

**What Happens:**
1. Script calls `listTickets({ limit: 10 })`
2. Method calls `GET /v2/tickets?limit=10`
3. API returns tickets (order unknown, likely most recent first)
4. Script displays first 10 tickets returned

**What You Get:**
- ✅ Exactly 10 tickets (or fewer if less available)
- ✅ All states mixed together (unless `--state` used)
- ⚠️ Order is **unknown** (likely most recent first, but not guaranteed)
- ⚠️ May not be "most recently closed" tickets

### When You Run: `npm run list:tickets -- --state closed`

**What Happens:**
1. Script calls `listTickets({ limit: 10, state: 'closed' })`
2. Method calls `GET /v2/tickets?limit=10&state=closed`
3. API filters server-side and returns only closed tickets
4. Script displays first 10 closed tickets returned

**What You Get:**
- ✅ Exactly 10 closed tickets (or fewer)
- ✅ Server-side filtered (efficient)
- ⚠️ Order is **unknown** (likely most recently closed first, but not guaranteed)
- ⚠️ May not be "most recently closed" if API doesn't sort by `finished_at`

---

## Conclusion

**Current State:**
- ✅ Method works for basic ticket discovery
- ✅ State filtering works (server-side)
- ⚠️ Ordering is undefined (depends on API default)
- ⚠️ "Recent" is not guaranteed
- ⚠️ Pagination is limited (first page only)

**Recommendation:**
1. **Test the API** to determine default ordering
2. **Document findings** in method comments
3. **Enhance with sorting** if API supports it and ordering is not ideal
4. **Accept current limitations** for discovery/testing use case

**Safe to Use:** ✅ Yes, for discovering ticket UUIDs, but be aware that:
- Order may not be what you expect
- "Recent" may not mean "most recently closed"
- Only first page is accessible

---

**End of Audit**


# Supabase HTTP Key Verification

## Overview

The storage test script now includes direct HTTP verification tests that prove whether the `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are actually valid at the HTTP layer, before attempting storage operations.

## HTTP Tests Performed

1. **REST API Root**: `GET ${SUPABASE_URL}/rest/v1/?apikey=${SUPABASE_SERVICE_KEY}`
2. **Auth API Settings**: `GET ${SUPABASE_URL}/auth/v1/settings` with `apikey` header
3. **PostgREST Query**: `GET ${SUPABASE_URL}/rest/v1/processed_tickets?select=id&limit=1` with both `apikey` and `Authorization: Bearer` headers

## Example Output Structure

### Case 1: Key Rejected Globally (Current Status)

```bash
npm run test:supabase:storage
```

**Output:**
```
🧪 Testing Supabase Storage Configuration...

🔍 Verifying Supabase Key via Direct HTTP Calls...

   SUPABASE_URL: https://roacrgpbwlpgciqfykcv.supabase.co

   ✗ REST API: 401 Unauthorized (Key rejected - Invalid API key)
   ✗ Auth API: 401 Unauthorized (Key rejected - Invalid API key)
   ✗ PostgREST: 401 Unauthorized (Key rejected - Invalid API key)

📊 HTTP Verification Summary:
   REST API: rejected
   Auth API: rejected
   PostgREST: rejected
   Overall: rejected_globally_403_signature_failed

⚠️  CONCLUSION: Supabase key is REJECTED globally (401/403 Invalid API key)
   The URL/key pair is not accepted by Supabase at the HTTP layer.
   This means the key is invalid, rotated, or belongs to a different project.

   Action required:
   1. Get a fresh service_role key from Supabase Dashboard
   2. Verify SUPABASE_URL matches the project URL exactly
   3. Ensure key and URL are from the same Supabase project
```

**Status:** `"rejected_globally_403_signature_failed"`

**Meaning:** The key is definitively invalid. All HTTP endpoints reject it with 401/403.

---

### Case 2: Key Accepted for REST but Rejected for Storage

**Output:**
```
🔍 Verifying Supabase Key via Direct HTTP Calls...

   SUPABASE_URL: https://roacrgpbwlpgciqfykcv.supabase.co

   ✓ REST API: 200 OK (Key accepted)
   ✓ Auth API: 200 OK (Key accepted)
   ✓ PostgREST: 200 OK (Key accepted)

📊 HTTP Verification Summary:
   REST API: accepted
   Auth API: accepted
   PostgREST: accepted
   Overall: accepted_for_rest_but_rejected_for_storage

⚠️  CONCLUSION: Supabase key is ACCEPTED for REST/Auth but may be rejected for Storage
   This suggests a storage-specific configuration issue.
```

**Status:** `"accepted_for_rest_but_rejected_for_storage"`

**Meaning:** The key is valid, but storage upload fails. This indicates:
- Bucket doesn't exist
- Bucket RLS policies blocking uploads
- Storage API configuration issue

---

### Case 3: Key Fully Accepted (Success)

**Output:**
```
🔍 Verifying Supabase Key via Direct HTTP Calls...

   SUPABASE_URL: https://roacrgpbwlpgciqfykcv.supabase.co

   ✓ REST API: 200 OK (Key accepted)
   ✓ Auth API: 200 OK (Key accepted)
   ✓ PostgREST: 200 OK (Key accepted)

📊 HTTP Verification Summary:
   REST API: accepted
   Auth API: accepted
   PostgREST: accepted
   Overall: accepted_for_rest_but_rejected_for_storage

📤 Uploading test file to bucket 'certificates'...
   File: storage-self-test-{timestamp}.txt
   Size: 293 bytes

✓ Upload successful
✓ Public URL generated
✅ Supabase Storage test PASSED
```

**Status:** `"accepted_for_rest_but_rejected_for_storage"` (but upload succeeds)

**Meaning:** Key is valid and storage works correctly.

---

## Status Values

The script returns one of these status values:

1. **`"rejected_globally_403_signature_failed"`**
   - All HTTP tests return 401/403
   - Key is invalid, rotated, or belongs to different project
   - **Action:** Get fresh service_role key from Supabase Dashboard

2. **`"accepted_for_rest_but_rejected_for_storage"`**
   - HTTP tests succeed (200 OK)
   - Storage upload may still fail
   - **Action:** Check bucket existence and RLS policies

3. **`"mixed_results"`**
   - Some HTTP tests succeed, others fail
   - **Action:** Investigate specific endpoint issues

---

## Detailed HTTP Test Results (Debug Mode)

With `DEBUG_SUPABASE_CONFIG=true`, the script shows detailed HTTP responses:

```
🔍 Detailed HTTP Test Results:
   REST API root (/rest/v1/?apikey=...): 401 Unauthorized - {"message":"Invalid API key","hint":"Double check your Supabase `anon` or `service_role` API key."}
   Auth API settings (/auth/v1/settings): 401 Unauthorized - {"message":"Invalid API key","hint":"Double check your Supabase `anon` or `service_role` API key."}
   PostgREST query (processed_tickets): 401 Unauthorized - {"message":"Invalid API key","hint":"Double check your Supabase `anon` or `service_role` API key."}
```

---

## Current Test Results

**Status:** `"rejected_globally_403_signature_failed"`

**Evidence:**
- All three HTTP endpoints return `401 Unauthorized`
- Error message: `"Invalid API key"`
- This proves the key is not accepted by Supabase at the HTTP layer

**Conclusion:** The `SUPABASE_SERVICE_KEY` in `.env` is invalid, rotated, or belongs to a different project.

**Next Steps:**
1. Go to Supabase Dashboard → Project Settings → API
2. Copy the **service_role** key (not anon key)
3. Update `SUPABASE_SERVICE_KEY` in `.env`
4. Re-run: `npm run test:supabase:storage`

---

## Implementation Details

The HTTP verification:
- Uses native `fetch()` API (no additional dependencies)
- Tests REST, Auth, and PostgREST endpoints
- Compares results with storage upload error
- Provides clear conclusions about key validity
- Never prints the actual key value (only confirms presence)

This approach definitively proves whether the URL/key pair is valid, eliminating guesswork about configuration issues.


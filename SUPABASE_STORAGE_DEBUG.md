# Supabase Storage Debug Guide

## Current Status

The storage test script has been enhanced with comprehensive debugging. Configuration verification shows:
- ✅ SUPABASE_URL format is correct
- ✅ SUPABASE_SERVICE_KEY is present and is a service_role key
- ✅ JWT payload confirms `role: "service_role"`
- ✅ JWT ref matches URL project ref
- ⚠️  Still receiving 403 "signature verification failed" error

## Enhanced Test Script

The `scripts/test-supabase-storage.ts` script now includes:

1. **Debug Mode**: Controlled by `DEBUG_SUPABASE_CONFIG=true` environment variable
2. **JWT Payload Inspection**: Decodes the service key to verify it's actually a service_role key
3. **Bucket Existence Check**: Verifies the bucket exists before attempting upload
4. **Enhanced Error Messages**: Specific guidance for 403 errors based on configuration state

## Usage

### Standard Test
```bash
npm run test:supabase:storage
```

### Debug Mode (Recommended)
```bash
DEBUG_SUPABASE_CONFIG=true npm run test:supabase:storage
```

## What to Set in .env

### SUPABASE_URL
- **Format**: `https://{project-ref}.supabase.co`
- **Where to find**: Supabase Dashboard → Project Settings → API → Project URL
- **Example**: `https://roacrgpbwlpgciqfykcv.supabase.co`

### SUPABASE_SERVICE_KEY
- **Type**: Must be the **service_role** key (NOT anon/public key)
- **Where to find**: Supabase Dashboard → Project Settings → API → **service_role** key
- **Characteristics**:
  - Starts with `eyJ` (JWT format)
  - Much longer than anon key (typically 200+ characters)
  - Contains `"role": "service_role"` in JWT payload
- **Example format**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (full key is much longer)

## Debug Output Interpretation

When running with `DEBUG_SUPABASE_CONFIG=true`, look for:

### ✅ Configuration Correct
```
JWT payload role: service_role
Is service_role key: YES ✓
JWT ref matches URL: YES ✓
```

### ⚠️ Configuration Issues
```
Is service_role key: NO ✗ (This is likely the problem!)
```
→ **Action**: Get the service_role key, not the anon key

```
JWT ref matches URL: NO ✗ (Mismatch!)
```
→ **Action**: Ensure key and URL are from the same Supabase project

```
Bucket "certificates" exists: NO ✗
```
→ **Action**: Create the bucket in Supabase Dashboard

## Troubleshooting 403 Errors

If you see `403 Forbidden - signature verification failed`:

### When Configuration Looks Correct (Debug Mode Shows All ✓)

1. **Key May Have Been Rotated**
   - Service role keys can be regenerated in Supabase
   - **Solution**: Get a fresh service_role key from Supabase Dashboard
   - Location: Supabase Dashboard → Project Settings → API → service_role key
   - Replace the key in `.env` and retry

2. **Bucket May Not Exist**
   - Even with correct key, bucket must exist
   - **Solution**: Verify bucket exists in Supabase Dashboard
   - Location: Supabase Dashboard → Storage → Check for "certificates" bucket
   - If missing: Create it and make it public

3. **Bucket RLS Policies**
   - Service role should bypass RLS, but verify bucket is accessible
   - **Solution**: Check bucket policies in Supabase Dashboard
   - Location: Supabase Dashboard → Storage → certificates → Policies

4. **Project Status**
   - Verify project is active and not paused
   - **Solution**: Check project status in Supabase Dashboard
   - Location: Supabase Dashboard → Project Settings → General

### When Configuration Has Issues

1. **Wrong Key Type**
   - Using anon/public key instead of service_role
   - **Solution**: Get service_role key from Supabase Dashboard

2. **Key/URL Mismatch**
   - Key belongs to different project than URL
   - **Solution**: Ensure both are from the same Supabase project

3. **Incorrect URL Format**
   - URL doesn't match expected format
   - **Solution**: Use exact URL from Supabase Dashboard → Project Settings → API

## Verification Checklist

Before running the test, verify:

- [ ] `SUPABASE_URL` matches Project URL from Supabase Dashboard exactly
- [ ] `SUPABASE_SERVICE_KEY` is the **service_role** key (not anon key)
- [ ] Key and URL are from the same Supabase project
- [ ] "certificates" bucket exists in Supabase Dashboard → Storage
- [ ] Bucket is configured (public or has proper policies)
- [ ] Project is active (not paused)

## Expected Debug Output (Success)

```
📋 Configuration Details:
   SUPABASE_URL: https://roacrgpbwlpgciqfykcv.supabase.co
   Project ref (from URL): roacrgpbwlpgciqfykcv
   SUPABASE_SERVICE_KEY present: YES ✓
   JWT payload role: service_role
   Is service_role key: YES ✓
   JWT ref matches URL: YES ✓
   Bucket name: certificates

🔍 Verifying Bucket Access:
   Bucket "certificates" exists: YES ✓

📤 Upload Parameters:
   Bucket: certificates
   Object path: storage-self-test-{timestamp}.txt
   
✓ Upload successful
✓ Public URL generated
✅ Supabase Storage test PASSED
```

## Next Steps

1. Run with debug mode: `DEBUG_SUPABASE_CONFIG=true npm run test:supabase:storage`
2. Review the debug output to identify which check fails
3. Fix the identified issue (key rotation, bucket creation, etc.)
4. Re-run the test until all checks pass

## Code Verification

The test script uses:
- **Same client**: `supabaseClient` from `src/clients/supabase-client.ts`
- **Same bucket**: `'certificates'` (matches `CERTIFICATES_BUCKET` constant)
- **Same upload pattern**: `.from(bucket).upload(path, buffer, { contentType, upsert: true })`

This ensures the test accurately reflects what the main pipeline will do.


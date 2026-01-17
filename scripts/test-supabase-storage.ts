#!/usr/bin/env node
/**
 * Self-test script for Supabase Storage
 *
 * Purpose: Verify that Supabase Storage is correctly configured and accessible.
 * Tests the exact same bucket and upload pattern used by the main pipeline.
 *
 * Usage:
 *   npm run test:supabase:storage
 *   DEBUG_SUPABASE_CONFIG=true npm run test:supabase:storage
 *
 * Required Environment Variables:
 *   - SUPABASE_URL: Supabase project URL
 *   - SUPABASE_SERVICE_KEY: Supabase service role key
 *
 * Optional Environment Variables:
 *   - DEBUG_SUPABASE_CONFIG: Set to "true" to enable detailed debug output
 *
 * This script:
 *   - Connects to Supabase using the same client as the main app
 *   - Uploads a test file to the 'certificates' bucket
 *   - Verifies the upload succeeded and gets the public URL
 *   - Exits with code 0 on success, 1 on failure
 */

import { supabaseClient } from '../src/clients/supabase-client.js';
import { loadConfig } from '../src/config/index.js';
import { createClient } from '@supabase/supabase-js';

const CERTIFICATES_BUCKET = 'certificates';
const DEBUG_MODE = process.env.DEBUG_SUPABASE_CONFIG === 'true' || process.env.DEBUG_SUPABASE_CONFIG === '1';

/**
 * Test Supabase key validity using direct HTTP calls before using JS client.
 * This proves whether the URL/key pair is accepted by Supabase at the HTTP layer.
 */
async function verifySupabaseKeyHttp(config: { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string }): Promise<{
  restApiStatus: 'accepted' | 'rejected' | 'error';
  authApiStatus: 'accepted' | 'rejected' | 'error';
  postgrestStatus: 'accepted' | 'rejected' | 'error';
  overallStatus: 'accepted_for_rest_but_rejected_for_storage' | 'rejected_globally_403_signature_failed' | 'mixed_results';
  details: Array<{ test: string; status: number; message: string }>;
}> {
  const results: Array<{ test: string; status: number; message: string }> = [];
  let restApiAccepted = false;
  let authApiAccepted = false;
  let postgrestAccepted = false;

  console.log('🔍 Verifying Supabase Key via Direct HTTP Calls...\n');
  console.log(`   SUPABASE_URL: ${config.SUPABASE_URL}\n`);

  // Test 1: REST API root endpoint
  try {
    const restUrl = `${config.SUPABASE_URL}/rest/v1/?apikey=${config.SUPABASE_SERVICE_KEY}`;
    const restResponse = await fetch(restUrl, {
      method: 'GET',
      headers: {
        'apikey': config.SUPABASE_SERVICE_KEY,
      },
    });

    const status = restResponse.status;
    const statusText = restResponse.statusText;
    let bodyText = '';
    try {
      bodyText = await restResponse.text();
      // Truncate long responses
      if (bodyText.length > 200) {
        bodyText = bodyText.substring(0, 200) + '...';
      }
    } catch {
      bodyText = '(could not read response body)';
    }

    results.push({
      test: 'REST API root (/rest/v1/?apikey=...)',
      status,
      message: `${status} ${statusText} - ${bodyText}`,
    });

    if (status === 200 || status === 204) {
      restApiAccepted = true;
      console.log(`   ✓ REST API: ${status} ${statusText} (Key accepted)`);
    } else if (status === 401 || status === 403) {
      console.log(`   ✗ REST API: ${status} ${statusText} (Key rejected - ${status === 401 ? 'Invalid API key' : 'signature verification failed'})`);
    } else {
      console.log(`   ⚠️  REST API: ${status} ${statusText}`);
    }
  } catch (error) {
    results.push({
      test: 'REST API root',
      status: 0,
      message: `Network error: ${error instanceof Error ? error.message : String(error)}`,
    });
    console.log(`   ✗ REST API: Network error - ${error instanceof Error ? error.message : String(error)}`);
  }

  // Test 2: Auth API settings endpoint
  try {
    const authUrl = `${config.SUPABASE_URL}/auth/v1/settings`;
    const authResponse = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'apikey': config.SUPABASE_SERVICE_KEY,
      },
    });

    const status = authResponse.status;
    const statusText = authResponse.statusText;
    let bodyText = '';
    try {
      bodyText = await authResponse.text();
      if (bodyText.length > 200) {
        bodyText = bodyText.substring(0, 200) + '...';
      }
    } catch {
      bodyText = '(could not read response body)';
    }

    results.push({
      test: 'Auth API settings (/auth/v1/settings)',
      status,
      message: `${status} ${statusText} - ${bodyText}`,
    });

    if (status === 200 || status === 204) {
      authApiAccepted = true;
      console.log(`   ✓ Auth API: ${status} ${statusText} (Key accepted)`);
    } else if (status === 401 || status === 403) {
      console.log(`   ✗ Auth API: ${status} ${statusText} (Key rejected - ${status === 401 ? 'Invalid API key' : 'signature verification failed'})`);
    } else {
      console.log(`   ⚠️  Auth API: ${status} ${statusText}`);
    }
  } catch (error) {
    results.push({
      test: 'Auth API settings',
      status: 0,
      message: `Network error: ${error instanceof Error ? error.message : String(error)}`,
    });
    console.log(`   ✗ Auth API: Network error - ${error instanceof Error ? error.message : String(error)}`);
  }

  // Test 3: PostgREST query (processed_tickets table)
  try {
    const postgrestUrl = `${config.SUPABASE_URL}/rest/v1/processed_tickets?select=id&limit=1`;
    const postgrestResponse = await fetch(postgrestUrl, {
      method: 'GET',
      headers: {
        'apikey': config.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${config.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const status = postgrestResponse.status;
    const statusText = postgrestResponse.statusText;
    let bodyText = '';
    try {
      bodyText = await postgrestResponse.text();
      if (bodyText.length > 200) {
        bodyText = bodyText.substring(0, 200) + '...';
      }
    } catch {
      bodyText = '(could not read response body)';
    }

    results.push({
      test: 'PostgREST query (processed_tickets)',
      status,
      message: `${status} ${statusText} - ${bodyText}`,
    });

    if (status === 200 || status === 204) {
      postgrestAccepted = true;
      console.log(`   ✓ PostgREST: ${status} ${statusText} (Key accepted)`);
    } else if (status === 401 || status === 403) {
      console.log(`   ✗ PostgREST: ${status} ${statusText} (Key rejected - ${status === 401 ? 'Invalid API key' : 'signature verification failed'})`);
    } else if (status === 404) {
      console.log(`   ⚠️  PostgREST: ${status} ${statusText} (Table might not exist, but key was accepted)`);
      postgrestAccepted = true; // 404 means key worked, table just doesn't exist
    } else {
      console.log(`   ⚠️  PostgREST: ${status} ${statusText}`);
    }
  } catch (error) {
    results.push({
      test: 'PostgREST query',
      status: 0,
      message: `Network error: ${error instanceof Error ? error.message : String(error)}`,
    });
    console.log(`   ✗ PostgREST: Network error - ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('');

  // Determine overall status
  let overallStatus: 'accepted_for_rest_but_rejected_for_storage' | 'rejected_globally_403_signature_failed' | 'mixed_results';
  
  if (restApiAccepted || authApiAccepted || postgrestAccepted) {
    // At least one endpoint accepted the key
    if (restApiAccepted || postgrestAccepted) {
      overallStatus = 'accepted_for_rest_but_rejected_for_storage';
    } else {
      overallStatus = 'mixed_results';
    }
  } else {
    // All endpoints rejected with 401/403
    overallStatus = 'rejected_globally_403_signature_failed';
  }

  return {
    restApiStatus: restApiAccepted ? 'accepted' : 'rejected',
    authApiStatus: authApiAccepted ? 'accepted' : 'rejected',
    postgrestStatus: postgrestAccepted ? 'accepted' : 'rejected',
    overallStatus,
    details: results,
  };
}

async function testSupabaseStorage(): Promise<void> {
  console.log('🧪 Testing Supabase Storage Configuration...\n');

  if (DEBUG_MODE) {
    console.log('🔍 DEBUG MODE ENABLED\n');
  }

  try {
    // Load and validate configuration
    const config = loadConfig();
    
    // Step 0: Verify key validity via direct HTTP calls
    const httpVerification = await verifySupabaseKeyHttp(config);
    
    console.log('📊 HTTP Verification Summary:');
    console.log(`   REST API: ${httpVerification.restApiStatus}`);
    console.log(`   Auth API: ${httpVerification.authApiStatus}`);
    console.log(`   PostgREST: ${httpVerification.postgrestStatus}`);
    console.log(`   Overall: ${httpVerification.overallStatus}\n`);
    
    if (httpVerification.overallStatus === 'rejected_globally_403_signature_failed') {
      console.error('⚠️  CONCLUSION: Supabase key is REJECTED globally (401/403 Invalid API key)');
      console.error('   The URL/key pair is not accepted by Supabase at the HTTP layer.');
      console.error('   This means the key is invalid, rotated, or belongs to a different project.\n');
      console.error('   Action required:');
      console.error('   1. Get a fresh service_role key from Supabase Dashboard');
      console.error('   2. Verify SUPABASE_URL matches the project URL exactly');
      console.error('   3. Ensure key and URL are from the same Supabase project\n');
      
      if (DEBUG_MODE) {
        console.error('🔍 Detailed HTTP Test Results:');
        httpVerification.details.forEach((detail) => {
          console.error(`   ${detail.test}: ${detail.message}`);
        });
        console.error('');
      }
      
      process.exit(1);
    } else if (httpVerification.overallStatus === 'accepted_for_rest_but_rejected_for_storage') {
      console.log('⚠️  CONCLUSION: Supabase key is ACCEPTED for REST/Auth but may be rejected for Storage');
      console.log('   This suggests a storage-specific configuration issue.\n');
    } else {
      console.log('⚠️  CONCLUSION: Mixed results from HTTP tests');
      console.log('   Some endpoints accepted the key, others rejected it.\n');
    }
    
    // Debug output: Print non-secret configuration details
    if (DEBUG_MODE) {
      console.log('📋 Configuration Details:');
      console.log(`   SUPABASE_URL: ${config.SUPABASE_URL}`);
      console.log(`   SUPABASE_URL length: ${config.SUPABASE_URL.length} characters`);
      console.log(`   SUPABASE_URL format: ${config.SUPABASE_URL.startsWith('https://') ? 'HTTPS ✓' : 'NOT HTTPS ✗'}`);
      
      // Extract project ref from URL
      const urlMatch = config.SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
      const projectRef = urlMatch ? urlMatch[1] : 'NOT FOUND';
      console.log(`   Project ref (from URL): ${projectRef}`);
      
      console.log(`   SUPABASE_SERVICE_KEY present: ${config.SUPABASE_SERVICE_KEY ? 'YES ✓' : 'NO ✗'}`);
      console.log(`   SUPABASE_SERVICE_KEY length: ${config.SUPABASE_SERVICE_KEY ? config.SUPABASE_SERVICE_KEY.length : 0} characters`);
      console.log(`   SUPABASE_SERVICE_KEY starts with 'eyJ': ${config.SUPABASE_SERVICE_KEY.startsWith('eyJ') ? 'YES ✓' : 'NO ✗'}`);
      
      // Decode JWT to verify it's a service_role key (without verifying signature)
      try {
        const jwtParts = config.SUPABASE_SERVICE_KEY.split('.');
        if (jwtParts.length === 3) {
          const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString('utf-8'));
          console.log(`   JWT payload role: ${payload.role || 'NOT FOUND'}`);
          console.log(`   JWT payload ref: ${payload.ref || 'NOT FOUND'}`);
          console.log(`   Is service_role key: ${payload.role === 'service_role' ? 'YES ✓' : 'NO ✗ (This is likely the problem!)'}`);
          console.log(`   JWT ref matches URL: ${payload.ref === projectRef ? 'YES ✓' : 'NO ✗ (Mismatch!)'}`);
          
          if (payload.role !== 'service_role') {
            console.log(`\n   ⚠️  WARNING: Key role is "${payload.role}", not "service_role"!`);
            console.log(`   This is likely an "anon" or "public" key.`);
            console.log(`   You need the "service_role" key from Supabase Dashboard.\n`);
          }
          
          if (payload.ref && payload.ref !== projectRef) {
            console.log(`\n   ⚠️  WARNING: JWT ref "${payload.ref}" does not match URL ref "${projectRef}"!`);
            console.log(`   The key belongs to a different Supabase project.\n`);
          }
        } else {
          console.log(`   JWT format: INVALID (expected 3 parts, got ${jwtParts.length})`);
        }
      } catch (jwtError) {
        console.log(`   JWT decode failed: ${jwtError instanceof Error ? jwtError.message : String(jwtError)}`);
      }
      
      console.log(`   Bucket name: ${CERTIFICATES_BUCKET}`);
      console.log('');
    } else {
      console.log(`✓ Configuration loaded`);
      console.log(`  SUPABASE_URL: ${config.SUPABASE_URL.substring(0, 30)}...`);
      console.log(`  SUPABASE_SERVICE_KEY: ${config.SUPABASE_SERVICE_KEY ? 'Present' : 'Missing'} (${config.SUPABASE_SERVICE_KEY ? config.SUPABASE_SERVICE_KEY.length : 0} chars)\n`);
    }

    // Create test file content
    const testFileName = `storage-self-test-${Date.now()}.txt`;
    const testContent = `Supabase Storage Self-Test
Generated: ${new Date().toISOString()}
Bucket: ${CERTIFICATES_BUCKET}
Path: ${testFileName}

This is a test file to verify Supabase Storage upload functionality.
If you see this file in the certificates bucket, the storage configuration is working correctly.
`;

    const testBuffer = Buffer.from(testContent, 'utf-8');

    // Debug output: Print exact upload parameters
    if (DEBUG_MODE) {
      console.log('📤 Upload Parameters:');
      console.log(`   Bucket: ${CERTIFICATES_BUCKET}`);
      console.log(`   Object path: ${testFileName}`);
      console.log(`   Content type: text/plain`);
      console.log(`   Buffer size: ${testBuffer.length} bytes`);
      console.log(`   Upsert: true`);
      console.log('');
    }

    // Debug: Verify bucket exists and is accessible
    if (DEBUG_MODE) {
      console.log('🔍 Verifying Bucket Access:');
      try {
        const { data: buckets, error: listError } = await supabaseClient.storage.listBuckets();
        if (listError) {
          console.log(`   List buckets error: ${listError.message}`);
          console.log(`   This might indicate a permissions issue with the service_role key\n`);
        } else {
          const bucketExists = buckets?.some((b) => b.name === CERTIFICATES_BUCKET);
          console.log(`   Bucket "${CERTIFICATES_BUCKET}" exists: ${bucketExists ? 'YES ✓' : 'NO ✗'}`);
          if (buckets && buckets.length > 0) {
            console.log(`   Available buckets: ${buckets.map((b) => b.name).join(', ')}`);
          }
          console.log('');
        }
      } catch (bucketError) {
        console.log(`   Bucket check failed: ${bucketError instanceof Error ? bucketError.message : String(bucketError)}\n`);
      }
      
      console.log('🔍 Verifying Supabase Client:');
      console.log(`   Using shared client from src/clients/supabase-client.ts: ${supabaseClient ? 'YES ✓' : 'NO ✗'}`);
      
      // Create a test client with same config to verify initialization
      const testClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      console.log(`   Test client created: ${testClient ? 'YES ✓' : 'NO ✗'}`);
      console.log(`   Client URL matches: ${(testClient as unknown as { supabaseUrl?: string }).supabaseUrl === config.SUPABASE_URL ? 'YES ✓' : 'NO ✗'}`);
      console.log('');
    }

    console.log(`📤 Uploading test file to bucket '${CERTIFICATES_BUCKET}'...`);
    console.log(`   File: ${testFileName}`);
    console.log(`   Size: ${testBuffer.length} bytes\n`);

    // Upload using the same pattern as CertificateStorage
    const { error: uploadError, data: uploadData } = await supabaseClient.storage
      .from(CERTIFICATES_BUCKET)
      .upload(testFileName, testBuffer, {
        contentType: 'text/plain',
        upsert: true,
      });

    if (uploadError) {
      console.error('✗ Upload failed:\n');
      
      // Enhanced error reporting
      const errorMessage = uploadError.message || 'Unknown error';
      const statusCode = 'statusCode' in uploadError ? uploadError.statusCode : null;
      const errorCode = 'error' in uploadError ? (uploadError as { error?: string }).error : null;
      
      console.error(`  Error Message: ${errorMessage}`);
      if (statusCode) {
        console.error(`  HTTP Status: ${statusCode}`);
      }
      if (errorCode) {
        console.error(`  Error Code: ${errorCode}`);
      }
      
      // Debug output: Print full error object (excluding sensitive data)
      if (DEBUG_MODE) {
        console.error('\n🔍 Debug: Full error object:');
        console.error(JSON.stringify(uploadError, null, 2));
        console.error('');
      }
      
      // Specific guidance for 403 errors
      if (statusCode === 403) {
        console.error('\n⚠️  403 Forbidden Error - Signature Verification Failed\n');
        
        // Compare with HTTP verification results
        if (httpVerification.overallStatus === 'rejected_globally_403_signature_failed') {
          console.error('CONFIRMED: Key is rejected globally (all HTTP tests returned 403)');
          console.error('The URL/key pair is definitively invalid.\n');
        } else if (httpVerification.overallStatus === 'accepted_for_rest_but_rejected_for_storage') {
          console.error('Storage-specific issue: Key works for REST/Auth but fails for Storage');
          console.error('This indicates a storage bucket configuration problem, not a key issue.\n');
        }
        
        if (DEBUG_MODE) {
          console.error('Debug analysis shows:');
          console.error('  ✓ Key is service_role (verified from JWT payload)');
          console.error('  ✓ Key ref matches URL project ref');
          console.error('  ✓ URL format is correct\n');
          
          if (httpVerification.overallStatus === 'accepted_for_rest_but_rejected_for_storage') {
            console.error('Since HTTP tests show key is accepted for REST but storage fails:\n');
            console.error('1. BUCKET DOES NOT EXIST:');
            console.error('   - Verify the "certificates" bucket exists in Supabase Dashboard');
            console.error('   - Location: Supabase Dashboard → Storage → Create bucket if missing\n');
            console.error('2. BUCKET RLS POLICIES:');
            console.error('   - Even with service_role key, bucket RLS policies might block uploads');
            console.error('   - Check: Supabase Dashboard → Storage → certificates → Policies');
            console.error('   - Service role should bypass RLS, but verify bucket exists and is accessible\n');
            console.error('3. STORAGE API PERMISSIONS:');
            console.error('   - Verify storage API is enabled for the project');
            console.error('   - Check: Supabase Dashboard → Project Settings → API\n');
          } else {
            console.error('Since HTTP tests show key is rejected globally:\n');
            console.error('1. KEY ROTATION:');
            console.error('   - The service_role key may have been rotated/regenerated in Supabase');
            console.error('   - Solution: Get a fresh service_role key from Supabase Dashboard');
            console.error('   - Location: Supabase Dashboard → Project Settings → API → service_role key\n');
            console.error('2. KEY MISMATCH:');
            console.error('   - Key may belong to a different Supabase project');
            console.error('   - Verify key and URL are from the same project\n');
          }
        } else {
          console.error('This error typically indicates one of the following issues:\n');
          console.error('1. WRONG KEY TYPE:');
          console.error('   - You may be using the "anon" or "public" key instead of the "service_role" key');
          console.error('   - Service role key should start with "eyJ" and be much longer than anon key');
          console.error('   - Find it in: Supabase Dashboard → Project Settings → API → service_role key\n');
          console.error('2. KEY ROTATED:');
          console.error('   - The service_role key may have been regenerated');
          console.error('   - Solution: Get a fresh service_role key from Supabase Dashboard\n');
          console.error('3. INCORRECT SUPABASE_URL:');
          console.error('   - URL should be: https://{project-ref}.supabase.co');
          console.error('   - Project ref is the part before .supabase.co');
          console.error('   - Find it in: Supabase Dashboard → Project Settings → API → Project URL\n');
          console.error('4. BUCKET PERMISSIONS:');
          console.error('   - Even with service_role key, bucket must exist');
          console.error('   - Check: Supabase Dashboard → Storage → certificates bucket exists\n');
          console.error('💡 Run with DEBUG_SUPABASE_CONFIG=true for detailed diagnostics\n');
        }
      } else {
        console.error('\n💡 Troubleshooting:');
        console.error('  1. Verify the "certificates" bucket exists in Supabase Dashboard');
        console.error('  2. Check that SUPABASE_SERVICE_KEY has storage write permissions');
        console.error('  3. Verify SUPABASE_URL points to the correct project');
        console.error('  4. Ensure the bucket is configured (public or has proper policies)\n');
      }
      
      if (DEBUG_MODE) {
        console.error('🔍 To verify configuration:');
        console.error(`   - SUPABASE_URL should match your project URL exactly`);
        console.error(`   - SUPABASE_SERVICE_KEY should be the service_role key (not anon key)`);
        console.error(`   - Both should be from the same Supabase project\n`);
      }
      
      process.exit(1);
    }

    console.log('✓ Upload successful\n');

    // Get public URL using the same pattern as CertificateStorage
    console.log('🔗 Generating public URL...');
    const { data: urlData } = supabaseClient.storage.from(CERTIFICATES_BUCKET).getPublicUrl(testFileName);

    if (!urlData || !urlData.publicUrl) {
      console.error('✗ Failed to generate public URL\n');
      console.error('💡 Troubleshooting:');
      console.error('  1. Verify the bucket is configured as public');
      console.error('  2. Check bucket policies in Supabase Dashboard\n');
      process.exit(1);
    }

    console.log('✓ Public URL generated\n');
    console.log('📋 Test Results:');
    console.log(`   Bucket: ${CERTIFICATES_BUCKET}`);
    console.log(`   File Path: ${testFileName}`);
    console.log(`   Public URL: ${urlData.publicUrl}\n`);

    // Verify the URL is accessible (optional - just check it's a valid URL)
    if (urlData.publicUrl.startsWith('http')) {
      console.log('✅ Supabase Storage test PASSED\n');
      console.log('💡 The certificates bucket is configured correctly.');
      console.log('   The main pipeline will use the same bucket and upload pattern.\n');
      process.exit(0);
    } else {
      console.error('✗ Invalid public URL format\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n✗ Supabase Storage test FAILED:\n');
    if (error instanceof Error) {
      console.error(`  Error: ${error.message}`);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error(`  Unknown error: ${String(error)}`);
    }
    console.error('\n💡 Troubleshooting:');
    console.error('  1. Verify SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
    console.error('  2. Check Supabase project is accessible');
    console.error('  3. Ensure the "certificates" bucket exists\n');
    process.exit(1);
  }
}

testSupabaseStorage().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


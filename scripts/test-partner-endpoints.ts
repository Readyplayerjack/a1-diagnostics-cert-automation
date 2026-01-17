#!/usr/bin/env node
/**
 * Test partner/organization endpoints - maybe we can get current partner info
 */

import { loadConfig } from '../src/config/index.js';

async function getToken(): Promise<string> {
  const config = loadConfig();
  const response = await fetch(config.JIFELINE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.JIFELINE_CLIENT_ID,
      client_secret: config.JIFELINE_CLIENT_SECRET,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Token fetch failed: ${response.status}`);
  }
  
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

async function testEndpoint(baseUrl: string, token: string, endpoint: string): Promise<{ success: boolean; data?: unknown; status?: number }> {
  try {
    const url = `${baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }
    return { success: false, status: response.status };
  } catch (error) {
    return { success: false };
  }
}

async function main() {
  console.log('🔍 Testing partner/organization endpoints (current API caller)\n');
  
  const config = loadConfig();
  const token = await getToken();
  
  const endpoints = [
    '/v2/partner',
    '/v2/partners',
    '/v2/organization',
    '/v2/organizations',
    '/v2/business',
    '/v2/businesses',
    '/v2/me',
    '/v2/current',
    '/v2/profile',
  ];
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(config.JIFELINE_API_BASE_URL, token, endpoint);
    
    if (result.success) {
      console.log(`✅ ${endpoint}`);
      const data = result.data as Record<string, unknown>;
      console.log(`   Keys: ${Object.keys(data).join(', ')}`);
      
      const hasName = 'name' in data || 'company_name' in data || 'business_name' in data;
      const hasAddress = 'address' in data || 'location' in data;
      
      if (hasName || hasAddress) {
        console.log(`   ⭐ HAS NAME/ADDRESS - This might be the business endpoint!`);
        console.log(`\n   Full response:\n`);
        console.log(JSON.stringify(data, null, 2));
      }
      console.log('');
    } else {
      console.log(`❌ ${endpoint}${result.status ? ` (${result.status})` : ''}`);
    }
    
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});


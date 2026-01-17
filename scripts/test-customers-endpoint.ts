#!/usr/bin/env node
/**
 * Test various customer endpoint patterns
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
  console.log('🔍 Testing customer list endpoints...\n');
  
  const config = loadConfig();
  const token = await getToken();
  
  const endpoints = [
    '/v2/customers',
    '/v2/customers?enabled=true',
    '/v2/customers?enabled=true&limit=100',
    '/v2/customers?limit=100',
  ];
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(config.JIFELINE_API_BASE_URL, token, endpoint);
    
    if (result.success) {
      console.log(`✅ ${endpoint}`);
      const data = result.data as Record<string, unknown> | unknown[];
      
      if (Array.isArray(data)) {
        console.log(`   Found ${data.length} customer(s)`);
        if (data.length > 0) {
          const first = data[0] as Record<string, unknown>;
          console.log(`   Sample: ${JSON.stringify(first, null, 2).substring(0, 200)}...`);
        }
      } else if (data && typeof data === 'object') {
        console.log(`   Keys: ${Object.keys(data).join(', ')}`);
        if ('data' in data && Array.isArray(data.data)) {
          console.log(`   Found ${data.data.length} customer(s) in data array`);
        }
      }
      console.log('');
      break;
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


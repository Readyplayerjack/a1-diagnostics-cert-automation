#!/usr/bin/env node
/**
 * Test business/garage endpoint patterns
 */

import { loadConfig } from '../src/config/index.js';
import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';

const ticketId = process.argv[2] || '1536aad7-fc68-4703-afaf-6168c45b6a6a';

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
  console.log(`🔍 Testing business/garage endpoints for ticket: ${ticketId}\n`);
  
  const config = loadConfig();
  const client = new JifelineApiClient();
  
  const ticket = await client.getTicketById(ticketId);
  const ticketObj = ticket as Record<string, unknown>;
  
  const token = await getToken();
  
  console.log('📋 Ticket relationship fields:\n');
  console.log(`  customer_connector_id: ${ticketObj.customer_connector_id}`);
  console.log(`  source_provider_id: ${ticketObj.source_provider_id}\n`);
  
  const endpoints: Array<{ name: string; id: string; patterns: string[] }> = [];
  
  if (ticketObj.customer_connector_id && typeof ticketObj.customer_connector_id === 'string') {
    endpoints.push({
      name: 'customer_connector',
      id: ticketObj.customer_connector_id,
      patterns: [
        `/v2/customer-connectors/${ticketObj.customer_connector_id}`,
        `/v2/customer_connectors/${ticketObj.customer_connector_id}`,
        `/v2/customer-connector/${ticketObj.customer_connector_id}`,
        `/v2/customer_connector/${ticketObj.customer_connector_id}`,
      ],
    });
  }
  
  if (ticketObj.source_provider_id && typeof ticketObj.source_provider_id === 'string') {
    endpoints.push({
      name: 'source_provider',
      id: ticketObj.source_provider_id,
      patterns: [
        `/v2/source-providers/${ticketObj.source_provider_id}`,
        `/v2/source_providers/${ticketObj.source_provider_id}`,
        `/v2/source-provider/${ticketObj.source_provider_id}`,
        `/v2/source_provider/${ticketObj.source_provider_id}`,
        `/v2/providers/${ticketObj.source_provider_id}`,
        `/v2/provider/${ticketObj.source_provider_id}`,
      ],
    });
  }
  
  for (const { name, id, patterns } of endpoints) {
    console.log(`\n🔗 Testing ${name} (${id.substring(0, 8)}...):\n`);
    
    for (const pattern of patterns) {
      const result = await testEndpoint(config.JIFELINE_API_BASE_URL, token, pattern);
      
      if (result.success) {
        console.log(`  ✅ ${pattern}`);
        const data = result.data as Record<string, unknown>;
        console.log(`     Keys: ${Object.keys(data).join(', ')}`);
        
        // Check for business/garage fields
        const hasName = 'name' in data || 'company_name' in data || 'business_name' in data || 'organization_name' in data;
        const hasAddress = 'address' in data || 'street' in data || 'location' in data || 'primary_location' in data;
        
        if (hasName || hasAddress) {
          console.log(`     ⭐ HAS NAME/ADDRESS - This is likely the business endpoint!`);
          console.log(`\n     Full response:\n`);
          console.log(JSON.stringify(data, null, 2));
          console.log(`\n     💡 Use endpoint: ${pattern}\n`);
        }
        break;
      } else {
        console.log(`  ❌ ${pattern}${result.status ? ` (${result.status})` : ''}`);
      }
      
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});


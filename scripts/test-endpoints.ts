#!/usr/bin/env node
/**
 * Test various endpoint patterns to find the business/garage data endpoint
 */

import { JifelineApiClient } from '../src/clients/jifeline-api-client.js';
import { loadConfig } from '../src/config/index.js';

const ticketId = process.argv[2] || '1536aad7-fc68-4703-afaf-6168c45b6a6a';

async function testEndpoints() {
  console.log(`🔍 Testing endpoints for ticket: ${ticketId}\n`);
  
  loadConfig();
  const client = new JifelineApiClient();

  try {
    const ticket = await client.getTicketById(ticketId);
    const ticketObj = ticket as Record<string, unknown>;
    
    console.log('📋 Testing endpoints based on ticket fields:\n');
    
    const endpointsToTest: Array<{ name: string; id: unknown; endpoints: string[] }> = [];
    
    // Test customer_connector_id
    if (ticketObj.customer_connector_id) {
      endpointsToTest.push({
        name: 'customer_connector_id',
        id: ticketObj.customer_connector_id,
        endpoints: [
          `/v2/customer-connectors/${ticketObj.customer_connector_id}`,
          `/v2/customer_connectors/${ticketObj.customer_connector_id}`,
          `/v2/customer-connector/${ticketObj.customer_connector_id}`,
          `/v2/customer_connector/${ticketObj.customer_connector_id}`,
        ],
      });
    }
    
    // Test source_provider_id
    if (ticketObj.source_provider_id) {
      endpointsToTest.push({
        name: 'source_provider_id',
        id: ticketObj.source_provider_id,
        endpoints: [
          `/v2/source-providers/${ticketObj.source_provider_id}`,
          `/v2/source_providers/${ticketObj.source_provider_id}`,
          `/v2/source-provider/${ticketObj.source_provider_id}`,
          `/v2/source_provider/${ticketObj.source_provider_id}`,
          `/v2/providers/${ticketObj.source_provider_id}`,
          `/v2/provider/${ticketObj.source_provider_id}`,
        ],
      });
    }
    
    // Test each endpoint
    for (const { name, id, endpoints } of endpointsToTest) {
      console.log(`\n🔗 Testing ${name}: ${id}\n`);
      
      for (const endpoint of endpoints) {
        try {
          // Use the private request method via a workaround - actually, let's use fetch directly
          const token = await (client as unknown as { getAccessToken(): Promise<string> }).getAccessToken();
          const config = loadConfig();
          const url = `${config.JIFELINE_API_BASE_URL}${endpoint}`;
          
          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log(`  ✅ ${endpoint}`);
            console.log(`     Response keys: ${Object.keys(data as Record<string, unknown>).join(', ')}`);
            
            // Check if it has name/address fields (what we need for certificate)
            const dataObj = data as Record<string, unknown>;
            const hasName = 'name' in dataObj || 'company_name' in dataObj || 'business_name' in dataObj;
            const hasAddress = 'address' in dataObj || 'street' in dataObj || 'location' in dataObj;
            
            if (hasName || hasAddress) {
              console.log(`     ⭐ HAS NAME/ADDRESS FIELDS - This might be the business/garage endpoint!`);
              console.log(`     Sample data:`, JSON.stringify(data, null, 2).substring(0, 500));
            }
            break; // Found working endpoint for this ID
          } else if (response.status === 404) {
            console.log(`  ❌ ${endpoint} (404)`);
          } else {
            console.log(`  ⚠️  ${endpoint} (${response.status})`);
          }
        } catch (error) {
          console.log(`  ❌ ${endpoint} (Error: ${error instanceof Error ? error.message : String(error)})`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testEndpoints();


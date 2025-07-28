#!/usr/bin/env node

/**
 * MCP Server Validation Test Suite
 * Tests the deployed Cloudflare Workers MCP server using the MCP protocol
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_URL = 'https://courtlistener-mcp.blakeopowell.workers.dev/sse';

async function testMCPServer() {
  console.log('🧪 Testing Legal MCP Server');
  console.log('============================\n');
  
  const tests = [
    {
      name: 'Initialize Protocol',
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'Test Client', version: '1.0.0' }
        }
      },
      validate: (result) => {
        return result.serverInfo && result.serverInfo.name === 'Legal MCP Server';
      }
    },
    {
      name: 'List Available Tools',
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      },
      validate: (result) => {
        return result.tools && Array.isArray(result.tools) && result.tools.length >= 6;
      }
    },
    {
      name: 'List Federal Courts',
      payload: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'list_courts',
          arguments: { jurisdiction: 'F' }
        }
      },
      validate: (result) => {
        return result.content && Array.isArray(result.content) && result.content.length > 0;
      }
    },
    {
      name: 'Search Privacy Cases',
      payload: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'search_cases',
          arguments: { 
            query: 'privacy rights',
            court: 'scotus',
            page_size: 3
          }
        }
      },
      validate: (result) => {
        return result.content && Array.isArray(result.content) && result.content.length > 0;
      }
    },
    {
      name: 'Invalid Method Test',
      payload: {
        jsonrpc: '2.0',
        id: 5,
        method: 'invalid/method'
      },
      validate: (result, response) => {
        return response.error && response.error.code === -32601;
      }
    }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    console.log(`🔍 Testing: ${test.name}`);
    
    try {
      const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(test.payload)
      });
      
      if (!response.ok) {
        console.log(`  ❌ HTTP Error: ${response.status} ${response.statusText}`);
        continue;
      }
      
      const jsonResponse = await response.json();
      
      // Check if the test expects an error
      if (test.validate(jsonResponse.result, jsonResponse)) {
        console.log(`  ✅ PASSED`);
        passed++;
        
        // Log some details for successful tests
        if (jsonResponse.result?.tools) {
          console.log(`     📋 Found ${jsonResponse.result.tools.length} tools`);
        }
        if (jsonResponse.result?.serverInfo) {
          console.log(`     🖥️ Server: ${jsonResponse.result.serverInfo.name} v${jsonResponse.result.serverInfo.version}`);
        }
        if (jsonResponse.error) {
          console.log(`     ⚠️ Expected error: ${jsonResponse.error.message}`);
        }
      } else {
        console.log(`  ❌ FAILED - Validation failed`);
        console.log(`     Response:`, JSON.stringify(jsonResponse, null, 2));
      }
      
    } catch (error) {
      console.log(`  ❌ FAILED - ${error.message}`);
    }
  }
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! MCP server is working correctly.');
    return true;
  } else {
    console.log('⚠️ Some tests failed. Please check the server implementation.');
    return false;
  }
}

// Additional function to test specific functionality
async function testSpecificFunction(toolName, args = {}) {
  console.log(`\n🎯 Testing specific function: ${toolName}`);
  
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  };
  
  try {
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.error) {
      console.log(`❌ Error: ${result.error.message}`);
      return false;
    }
    
    console.log(`✅ Success!`);
    console.log('Response:', JSON.stringify(result.result, null, 2));
    return true;
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return false;
  }
}

// Run tests
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length > 0 && args[0] === 'test-tool') {
    // Test specific tool
    const toolName = args[1] || 'list_courts';
    const toolArgs = args[2] ? JSON.parse(args[2]) : {};
    await testSpecificFunction(toolName, toolArgs);
  } else {
    // Run full test suite
    const success = await testMCPServer();
    process.exit(success ? 0 : 1);
  }
}

// Check if this module is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

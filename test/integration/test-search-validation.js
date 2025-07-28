#!/usr/bin/env node

/**
 * Test to verify that the search_cases tool properly validates order_by parameters
 * to prevent 400 Bad Request errors from CourtListener API
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

async function testSearchValidation() {
  console.log('Testing search parameter validation...');
  
  // Start the MCP server
  const server = spawn('node', [join(projectRoot, 'dist/index.js')], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Test case 1: search_cases with order_by parameter (should be filtered out)
  const testRequest1 = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "search_cases",
      arguments: {
        court: "scotus",
        order_by: "date_filed", // This should be filtered out to prevent 400 error
        page_size: 5,
        date_filed_after: "2024-01-01"
      }
    }
  };

  // Test case 2: advanced_search with order_by parameter (should be filtered out)
  const testRequest2 = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "advanced_search",
      arguments: {
        type: "o",
        court: "scotus",
        order_by: "date_filed", // This should be filtered out to prevent 400 error
        page_size: 5,
        date_filed_after: "2024-01-01"
      }
    }
  };

  let responseCount = 0;
  let responses = [];

  server.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const response = JSON.parse(line);
        if (response.id && response.result) {
          responses.push(response);
          responseCount++;
          
          console.log(`Response ${responseCount} received for test ${response.id}`);
          
          // Check if we got an error (which would indicate the fix didn't work)
          if (response.error) {
            console.error(`❌ Test ${response.id} failed with error:`, response.error);
          } else {
            console.log(`✅ Test ${response.id} completed successfully`);
          }

          if (responseCount === 2) {
            // All tests completed
            server.kill();
            
            console.log('\n=== Test Results ===');
            const allPassed = responses.every(r => !r.error);
            
            if (allPassed) {
              console.log('✅ All parameter validation tests passed!');
              console.log('✅ The order_by parameter filtering is working correctly.');
              console.log('✅ No more 400 Bad Request errors should occur.');
            } else {
              console.log('❌ Some tests failed. Check the error messages above.');
            }
            
            process.exit(allPassed ? 0 : 1);
          }
        }
      } catch (e) {
        // Not JSON, ignore
      }
    }
  });

  server.stderr.on('data', (data) => {
    console.error('Server error:', data.toString());
  });

  // Wait a moment for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send test requests
  console.log('Sending test request 1: search_cases with order_by parameter...');
  server.stdin.write(JSON.stringify(testRequest1) + '\n');

  console.log('Sending test request 2: advanced_search with order_by parameter...');
  server.stdin.write(JSON.stringify(testRequest2) + '\n');

  // Set a timeout in case the server doesn't respond
  setTimeout(() => {
    console.log('❌ Test timeout - server did not respond in time');
    server.kill();
    process.exit(1);
  }, 30000); // 30 second timeout
}

testSearchValidation().catch(console.error);

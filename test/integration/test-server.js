#!/usr/bin/env node

/**
 * Test script for the Legal MCP Server
 * This script tests the basic functionality of the server
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testMCPServer() {
  console.log('Testing Legal MCP Server...');
  
  // Start the MCP server
  const serverPath = join(__dirname, '../../dist/index.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Test message to list tools
  const listToolsMessage = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  };

  let response = '';
  
  server.stdout.on('data', (data) => {
    response += data.toString();
  });

  server.stderr.on('data', (data) => {
    console.error('Server stderr:', data.toString());
  });

  // Send the test message
  server.stdin.write(JSON.stringify(listToolsMessage) + '\n');

  // Wait a bit for response
  await new Promise(resolve => setTimeout(resolve, 2000));

  server.kill();

  console.log('Server response:', response);
  
  if (response.includes('search_cases') && response.includes('get_case_details')) {
    console.log('✅ Test passed: Server is working correctly');
    return true;
  } else {
    console.log('❌ Test failed: Expected tools not found in response');
    return false;
  }
}

// Run the test
testMCPServer()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });

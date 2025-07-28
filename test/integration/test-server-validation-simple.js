#!/usr/bin/env node

/**
 * 🚀 Simple Server Validation Tests
 * Quick smoke tests to validate basic server functionality
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

// Test configuration
const TEST_TIMEOUT = 10000; // 10 seconds
const SERVER_STARTUP_DELAY = 2000; // 2 seconds

/**
 * 🧪 Test: Standard Server Startup
 */
describe('Standard Server Validation', { timeout: TEST_TIMEOUT }, () => {
  
  it('should start standard server without errors', async () => {
    console.log('🔍 Testing standard server startup...');
    
    const server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });
    
    let serverOutput = '';
    let serverError = '';
    
    server.stdout.on('data', (data) => {
      serverOutput += data.toString();
    });
    
    server.stderr.on('data', (data) => {
      serverError += data.toString();
    });
    
    // Wait for server to start
    await setTimeout(SERVER_STARTUP_DELAY);
    
    // Kill the server
    server.kill('SIGTERM');
    
    // Wait for graceful shutdown
    await new Promise((resolve) => {
      server.on('close', resolve);
    });
    
    // Validate startup
    assert(serverError.includes('Legal MCP Server'), 
      `Expected server startup message, got: ${serverError}`);
    
    console.log('✅ Standard server started successfully');
  });
  
  it('should validate package.json configuration', async () => {
    console.log('🔍 Testing package.json configuration...');
    
    const fs = await import('node:fs/promises');
    const packageJsonContent = await fs.readFile('package.json', 'utf8');
    const pkg = JSON.parse(packageJsonContent);
    
    // Validate basic package structure
    assert(pkg.name === 'courtlistener-mcp', 'Package name should be courtlistener-mcp');
    assert(pkg.type === 'module', 'Package should be ES module');
    assert(pkg.main === 'dist/index.js', 'Main entry should be dist/index.js');
    
    // Validate binary entries
    assert(pkg.bin['legal-mcp'] === 'dist/index.js', 'Standard binary should point to index.js');
    assert(pkg.bin['legal-mcp-enterprise'] === 'dist/enterprise-server.js', 'Enterprise binary should point to enterprise-server.js');
    
    // Validate required dependencies
    assert(pkg.dependencies['@modelcontextprotocol/sdk'], 'MCP SDK dependency required');
    assert(pkg.dependencies['node-fetch'], 'node-fetch dependency required');
    
    console.log('✅ Package configuration is valid');
  });
  
  it('should validate TypeScript compilation', async () => {
    console.log('🔍 Testing TypeScript compilation...');
    
    const tsc = spawn('npx', ['tsc', '--noEmit'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });
    
    let tscOutput = '';
    let tscError = '';
    
    tsc.stdout.on('data', (data) => {
      tscOutput += data.toString();
    });
    
    tsc.stderr.on('data', (data) => {
      tscError += data.toString();
    });
    
    const exitCode = await new Promise((resolve) => {
      tsc.on('close', resolve);
    });
    
    // TypeScript compilation should succeed
    assert(exitCode === 0, 
      `TypeScript compilation failed with exit code ${exitCode}. Error: ${tscError}`);
    
    console.log('✅ TypeScript compilation successful');
  });
  
});

/**
 * 🏢 Test: Enterprise Server Startup
 */
describe('Enterprise Server Validation', { timeout: TEST_TIMEOUT }, () => {
  
  it('should start enterprise server without errors', async () => {
    console.log('🔍 Testing enterprise server startup...');
    
    const server = spawn('node', ['dist/enterprise-server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
      env: { 
        ...process.env,
        // Disable enterprise features for simple startup test
        AUDIT_ENABLED: 'false',
        CIRCUIT_BREAKER_ENABLED: 'false',
        GRACEFUL_SHUTDOWN_ENABLED: 'false'
      }
    });
    
    let serverOutput = '';
    let serverError = '';
    
    server.stdout.on('data', (data) => {
      serverOutput += data.toString();
    });
    
    server.stderr.on('data', (data) => {
      serverError += data.toString();
    });
    
    // Wait for server to start
    await setTimeout(SERVER_STARTUP_DELAY);
    
    // Kill the server
    server.kill('SIGTERM');
    
    // Wait for graceful shutdown
    await new Promise((resolve) => {
      server.on('close', resolve);
    });
    
    // Validate startup
    assert(serverError.includes('Legal MCP Server') && serverError.includes('Enterprise'), 
      `Expected enterprise server startup message, got: ${serverError}`);
    
    console.log('✅ Enterprise server started successfully');
  });
  
});

/**
 * 🔧 Test: Build Artifacts
 */
describe('Build Artifacts Validation', () => {
  
  it('should have compiled JavaScript files', async () => {
    console.log('🔍 Testing build artifacts...');
    
    const fs = await import('node:fs/promises');
    
    // Check main artifacts exist
    const mainExists = await fs.access('dist/index.js').then(() => true).catch(() => false);
    const enterpriseExists = await fs.access('dist/enterprise-server.js').then(() => true).catch(() => false);
    const courtListenerExists = await fs.access('dist/courtlistener.js').then(() => true).catch(() => false);
    
    assert(mainExists, 'dist/index.js should exist');
    assert(enterpriseExists, 'dist/enterprise-server.js should exist'); 
    assert(courtListenerExists, 'dist/courtlistener.js should exist');
    
    console.log('✅ All required build artifacts present');
  });
  
});

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🧪 Running Simple Server Validation Tests...');
  console.log('='.repeat(50));
}

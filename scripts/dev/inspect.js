#!/usr/bin/env node

/**
 * MCP Inspector Launcher
 * 
 * This script makes it easy to test your MCP server with the visual inspector.
 * It supports both local and remote server testing.
 */

import { spawn } from 'child_process';
import { platform } from 'os';

const REMOTE_SERVER_URL = process.env.MCP_REMOTE_URL || 'https://courtlistenermcp.blakeoxford.com/mcp';

function openBrowser(url) {
  const command = platform() === 'darwin' ? 'open' : 
                  platform() === 'win32' ? 'start' : 'xdg-open';
  
  spawn(command, [url], { detached: true });
}

async function launchInspector(mode = 'remote') {
  console.log('🔍 Launching MCP Inspector...');
  
  let command, args;
  
  if (mode === 'remote') {
    console.log(`🌐 Testing remote server: ${REMOTE_SERVER_URL}`);
    
    // Open inspector with remote server pre-configured
    const inspectorUrl = `http://localhost:6274/?transport=streamable-http&serverUrl=${encodeURIComponent(REMOTE_SERVER_URL)}`;
    
    console.log('🚀 Starting inspector server...');
    
    // Start the inspector
    const inspectorProcess = spawn('npx', ['@modelcontextprotocol/inspector'], {
      stdio: 'inherit'
    });
    
    // Give it a moment to start, then open browser
    setTimeout(() => {
      console.log(`🌐 Opening browser to: ${inspectorUrl}`);
      openBrowser(inspectorUrl);
    }, 3000);
    
    // Handle process cleanup
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down inspector...');
      inspectorProcess.kill('SIGINT');
      process.exit(0);
    });
    
  } else if (mode === 'local') {
    console.log('🏠 Testing local server');
    
    // Start inspector with local server
    command = 'npx';
    args = ['@modelcontextprotocol/inspector', 'node', 'dist/index.js'];
    
    const inspectorProcess = spawn(command, args, {
      stdio: 'inherit'
    });
    
    // Handle process cleanup
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down inspector...');
      inspectorProcess.kill('SIGINT');
      process.exit(0);
    });
    
  } else {
    console.log('❌ Unknown mode. Use "remote" or "local"');
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'remote';
  
  console.log('🧪 Legal MCP Server Inspector');
  console.log('==============================\n');
  
  if (mode === 'help' || mode === '-h' || mode === '--help') {
    console.log('Usage:');
    console.log('  npm run inspect        # Test remote Cloudflare server (default)');
    console.log('  npm run inspect local  # Test local server');
    console.log('  npm run inspect remote # Test remote server');
    console.log('');
    console.log('The inspector will open in your browser at http://localhost:6274');
    return;
  }
  
  await launchInspector(mode);
}

// Check if this module is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

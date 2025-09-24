#!/usr/bin/env node

/**
 * Legal MCP Server - Enterprise Configuration Demo
 *
 * This script demonstrates how to enable enterprise features through environment variables.
 * All enterprise features are implemented as optional enhancements that maintain
 * full backward compatibility with the standard Legal MCP Server.
 *
 * @version 1.1.0
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Enterprise feature configurations
 */
const ENTERPRISE_FEATURES = {
  // Authentication
  SECURITY_AUTHENTICATION_ENABLED: 'true',
  SECURITY_AUTHENTICATION_API_KEY: 'your-api-key-here',
  SECURITY_AUTHENTICATION_METHODS: 'api_key,basic_auth',

  // Input Sanitization
  SECURITY_SANITIZATION_ENABLED: 'true',
  SECURITY_SANITIZATION_XSS_PROTECTION: 'true',
  SECURITY_SANITIZATION_INJECTION_PROTECTION: 'true',

  // Audit Logging
  AUDIT_ENABLED: 'true',
  AUDIT_LOG_REQUESTS: 'true',
  AUDIT_LOG_RESPONSES: 'false',
  AUDIT_RETENTION_DAYS: '90',

  // Response Compression
  COMPRESSION_ENABLED: 'true',
  COMPRESSION_THRESHOLD: '1024',
  COMPRESSION_LEVEL: '6',

  // Per-Client Rate Limiting
  RATE_LIMITING_PER_CLIENT_ENABLED: 'true',
  RATE_LIMITING_PER_CLIENT_REQUESTS_PER_MINUTE: '100',
  RATE_LIMITING_PER_CLIENT_BURST_SIZE: '20',

  // Circuit Breakers
  CIRCUIT_BREAKER_ENABLED: 'true',
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: '5',
  CIRCUIT_BREAKER_TIMEOUT: '60000',

  // Graceful Shutdown
  GRACEFUL_SHUTDOWN_ENABLED: 'true',
  GRACEFUL_SHUTDOWN_TIMEOUT: '30000',
};

/**
 * Display enterprise features status
 */
function displayEnterpriseStatus() {
  console.error('\n🏢 Legal MCP Server - Enterprise Edition');
  console.error('==========================================');
  console.error('\n📋 Enterprise Features Available:');
  console.error('  🔐 Authentication & Authorization');
  console.error('  🛡️  Advanced Input Sanitization');
  console.error('  📝 Audit Logging & Compliance');
  console.error('  🗜️  Response Compression');
  console.error('  🚦 Per-Client Rate Limiting');
  console.error('  ⚡ Circuit Breakers');
  console.error('  🔄 Graceful Shutdown');
  console.error('\n💡 To enable enterprise features, set environment variables:');

  Object.entries(ENTERPRISE_FEATURES).forEach(([key, value]) => {
    const status = process.env[key] === 'true' ? '✅' : '⚪';
    console.error(`  ${status} ${key}=${value}`);
  });

  console.error('\n📖 For detailed configuration, see: ENTERPRISE_FEATURES.md');
  console.error('🔗 Repository: https://github.com/blakeox/courtlistener-mcp\n');
}

/**
 * Start server with enterprise features
 */
function startEnterpriseServer() {
  // Check if any enterprise features are enabled
  const enabledFeatures = Object.keys(ENTERPRISE_FEATURES).filter(key => process.env[key] === 'true');

  if (enabledFeatures.length > 0) {
    console.error(`\n🚀 Starting with ${enabledFeatures.length} enterprise features enabled...\n`);
  } else {
    console.error('\n🔧 No enterprise features enabled. Using standard configuration.\n');
    console.error('💡 To enable enterprise features, set environment variables first.\n');
  }

  // Import and start the standard server (enterprise features are configured via env vars)
  import('./index.js')
    .then(async (module: typeof import('./index.js')) => {
      const server = new module.LegalMCPServer();
      await server.start();
    })
    .catch(error => {
      console.error('Failed to start Legal MCP Server:', error);
      process.exit(1);
    });
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    displayEnterpriseStatus();
    console.error('\n🛠️  Usage:');
    console.error('  node enterprise-demo.js                 # Start server');
    console.error('  node enterprise-demo.js --features      # Show available features');
    console.error('  node enterprise-demo.js --demo          # Start with demo config');
    console.error('  node enterprise-demo.js --help          # Show this help');
    process.exit(0);
  }

  if (args.includes('--features')) {
    displayEnterpriseStatus();
    process.exit(0);
  }

  if (args.includes('--demo')) {
    console.error('\n🎯 Setting up enterprise demo configuration...\n');

    // Set demo environment variables
    Object.entries(ENTERPRISE_FEATURES).forEach(([key, value]) => {
      process.env[key] = value;
    });

    console.error('✅ Enterprise features enabled for demo');
  }

  displayEnterpriseStatus();
  startEnterpriseServer();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

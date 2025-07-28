#!/usr/bin/env node

/**
 * Detailed Untested Code Analysis
 * Creates specific test templates for critical untested components
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

class DetailedUntestedAnalysis {
  constructor() {
    this.criticalFiles = [
      'src/courtlistener.ts',
      'src/metrics.ts', 
      'src/cache.ts',
      'src/http-server.ts',
      'src/enterprise-server.ts',
      'src/config.ts',
      'src/tool-definitions.ts'
    ];
  }

  async analyze() {
    console.log('🔬 Detailed Analysis of Critical Untested Code');
    console.log('='.repeat(60));
    
    for (const file of this.criticalFiles) {
      await this.analyzeFile(file);
    }
    
    await this.generateTestTemplates();
  }

  async analyzeFile(filePath) {
    console.log(`\n📄 Analyzing: ${filePath}`);
    console.log('-'.repeat(40));
    
    const fullPath = path.join(projectRoot, filePath);
    if (!fs.existsSync(fullPath)) {
      console.log('   ❌ File not found');
      return;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    const analysis = this.extractFileStructure(content);
    
    console.log(`   📊 Classes: ${analysis.classes.length}`);
    console.log(`   📊 Public Methods: ${analysis.publicMethods.length}`);
    console.log(`   📊 Functions: ${analysis.functions.length}`);
    console.log(`   📊 Exports: ${analysis.exports.length}`);
    console.log(`   📊 Lines: ${content.split('\n').length}`);
    
    if (analysis.classes.length > 0) {
      console.log('   🏗️ Classes Found:');
      for (const cls of analysis.classes) {
        console.log(`      • ${cls.name}`);
        if (cls.methods.length > 0) {
          console.log(`        Methods: ${cls.methods.join(', ')}`);
        }
        if (cls.privateMembers.length > 0) {
          console.log(`        Private: ${cls.privateMembers.join(', ')}`);
        }
      }
    }
    
    if (analysis.functions.length > 0) {
      console.log('   ⚡ Functions Found:');
      for (const func of analysis.functions) {
        console.log(`      • ${func}`);
      }
    }
    
    // Identify critical testing priorities
    console.log('   🎯 Testing Priority:');
    this.assessTestingPriority(filePath, analysis);
  }

  extractFileStructure(content) {
    const classes = [];
    const functions = [];
    const exports = [];
    const publicMethods = [];
    
    // Extract classes with detailed method analysis
    const classMatches = content.matchAll(/(?:export\s+)?class\s+(\w+).*?{([\s\S]*?)^}/gm);
    for (const match of classMatches) {
      const className = match[1];
      const classBody = match[2];
      
      const methods = [];
      const privateMembers = [];
      
      // Extract methods
      const methodMatches = classBody.matchAll(/(?:async\s+)?(private\s+|public\s+)?(\w+)\s*\([^)]*\)\s*[:{]/g);
      for (const methodMatch of methodMatches) {
        const isPrivate = methodMatch[1]?.includes('private');
        const methodName = methodMatch[2];
        
        if (!['constructor', 'get', 'set'].includes(methodName)) {
          if (isPrivate) {
            privateMembers.push(methodName);
          } else {
            methods.push(methodName);
            publicMethods.push(`${className}.${methodName}`);
          }
        }
      }
      
      classes.push({
        name: className,
        methods,
        privateMembers
      });
    }
    
    // Extract standalone functions
    const functionMatches = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
    for (const match of functionMatches) {
      functions.push(match[1]);
    }
    
    // Extract exports
    const exportMatches = content.matchAll(/export\s+(?:default\s+)?(?:class|function|const|interface|type)\s+(\w+)/g);
    for (const match of exportMatches) {
      exports.push(match[1]);
    }
    
    return {
      classes,
      functions,
      exports,
      publicMethods
    };
  }

  assessTestingPriority(filePath, analysis) {
    const priorities = [];
    
    if (filePath.includes('courtlistener.ts')) {
      priorities.push('🔥 CRITICAL - API integration, error handling, rate limiting');
      priorities.push('🔥 CRITICAL - Caching behavior, retry logic');
      priorities.push('⚡ HIGH - Search methods, data parsing');
    }
    
    if (filePath.includes('metrics.ts')) {
      priorities.push('🔥 CRITICAL - Metric recording accuracy');
      priorities.push('🔥 CRITICAL - Performance calculations');
      priorities.push('⚡ HIGH - Memory management of response times');
    }
    
    if (filePath.includes('cache.ts')) {
      priorities.push('🔥 CRITICAL - TTL expiration, LRU eviction');
      priorities.push('🔥 CRITICAL - Thread safety, concurrent access');
      priorities.push('⚡ HIGH - Cache hit/miss logic');
    }
    
    if (filePath.includes('http-server.ts')) {
      priorities.push('🔥 CRITICAL - Health endpoint responses');
      priorities.push('⚡ HIGH - Metrics endpoint formatting');
      priorities.push('⚡ HIGH - Error handling for malformed requests');
    }
    
    if (filePath.includes('enterprise-server.ts')) {
      priorities.push('🔥 CRITICAL - Middleware integration');
      priorities.push('🔥 CRITICAL - Security boundary enforcement');
      priorities.push('⚡ HIGH - Graceful shutdown behavior');
    }
    
    if (filePath.includes('config.ts')) {
      priorities.push('⚡ HIGH - Environment variable parsing');
      priorities.push('⚡ HIGH - Default value handling');
      priorities.push('🟡 MEDIUM - Configuration validation');
    }
    
    if (filePath.includes('tool-definitions.ts')) {
      priorities.push('⚡ HIGH - Tool schema validation');
      priorities.push('⚡ HIGH - Category organization');
      priorities.push('🟡 MEDIUM - Example generation');
    }
    
    for (const priority of priorities) {
      console.log(`      ${priority}`);
    }
  }

  async generateTestTemplates() {
    console.log('\n🛠️ Generating Test Templates');
    console.log('='.repeat(60));
    
    // Create test templates for critical files
    await this.createCourtListenerTests();
    await this.createMetricsTests();
    await this.createCacheTests();
    await this.createConfigTests();
    
    console.log('\n✅ Test templates generated in test/unit/ directory');
    console.log('💡 Run these tests with: npm run test:unit');
  }

  async createCourtListenerTests() {
    const template = `#!/usr/bin/env node

/**
 * Unit Tests for CourtListener API Client
 * Tests API integration, caching, rate limiting, and error handling
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Mock dependencies
class MockCache {
  constructor() {
    this.cache = new Map();
  }
  
  get(key) {
    return this.cache.get(key) || null;
  }
  
  set(key, value, ttl) {
    this.cache.set(key, value);
  }
  
  delete(key) {
    this.cache.delete(key);
  }
}

class MockLogger {
  constructor() {
    this.logs = [];
  }
  
  info(msg, meta) { this.logs.push({ level: 'info', msg, meta }); }
  error(msg, meta) { this.logs.push({ level: 'error', msg, meta }); }
  debug(msg, meta) { this.logs.push({ level: 'debug', msg, meta }); }
  warn(msg, meta) { this.logs.push({ level: 'warn', msg, meta }); }
  
  startTimer(name) {
    return () => ({ duration: 100 });
  }
}

class MockMetrics {
  constructor() {
    this.metrics = {
      requests_total: 0,
      requests_successful: 0,
      requests_failed: 0
    };
  }
  
  recordRequest(responseTime, fromCache) {
    this.metrics.requests_total++;
    this.metrics.requests_successful++;
  }
  
  recordFailure(responseTime) {
    this.metrics.requests_total++;
    this.metrics.requests_failed++;
  }
}

describe('CourtListener API Client', () => {
  let courtListener;
  let mockCache;
  let mockLogger;
  let mockMetrics;
  
  beforeEach(() => {
    mockCache = new MockCache();
    mockLogger = new MockLogger();
    mockMetrics = new MockMetrics();
    
    // Note: You'll need to import the actual CourtListenerAPI class
    // const { CourtListenerAPI } = await import('../../src/courtlistener.js');
    
    // For now, we'll create a minimal test structure
    console.log('Setting up CourtListener tests...');
  });
  
  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      // TODO: Test that requests are properly rate limited
      console.log('⚠️ TODO: Implement rate limiting test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should queue requests when rate limited', async () => {
      // TODO: Test request queueing behavior
      console.log('⚠️ TODO: Implement request queueing test');
      assert.ok(true, 'Test placeholder');
    });
  });
  
  describe('Caching', () => {
    it('should cache successful responses', async () => {
      // TODO: Test caching behavior
      console.log('⚠️ TODO: Implement caching test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should not cache error responses', async () => {
      // TODO: Test error response handling
      console.log('⚠️ TODO: Implement error caching test');
      assert.ok(true, 'Test placeholder');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // TODO: Test network error handling
      console.log('⚠️ TODO: Implement network error test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should retry failed requests', async () => {
      // TODO: Test retry logic
      console.log('⚠️ TODO: Implement retry test');
      assert.ok(true, 'Test placeholder');
    });
  });
  
  describe('Search Methods', () => {
    it('should search cases by citation', async () => {
      // TODO: Test case search by citation
      console.log('⚠️ TODO: Implement citation search test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should search cases by case name', async () => {
      // TODO: Test case search by name
      console.log('⚠️ TODO: Implement case name search test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should handle invalid search parameters', async () => {
      // TODO: Test invalid parameter handling
      console.log('⚠️ TODO: Implement invalid parameter test');
      assert.ok(true, 'Test placeholder');
    });
  });
});

console.log('🧪 CourtListener API unit tests ready');
console.log('💡 Next steps:');
console.log('   1. Import actual CourtListenerAPI class');
console.log('   2. Implement test cases with real API calls (mocked)');
console.log('   3. Add edge case testing');
console.log('   4. Test error scenarios');
`;

    const testDir = path.join(projectRoot, 'test', 'unit');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(testDir, 'test-courtlistener.js'), template);
    console.log('   ✅ Created test/unit/test-courtlistener.js');
  }

  async createMetricsTests() {
    const template = `#!/usr/bin/env node

/**
 * Unit Tests for Metrics Collector
 * Tests metric recording, calculations, and performance tracking
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

class MockLogger {
  constructor() {
    this.logs = [];
  }
  
  info(msg, meta) { this.logs.push({ level: 'info', msg, meta }); }
  error(msg, meta) { this.logs.push({ level: 'error', msg, meta }); }
  debug(msg, meta) { this.logs.push({ level: 'debug', msg, meta }); }
}

describe('Metrics Collector', () => {
  let metrics;
  let mockLogger;
  
  beforeEach(() => {
    mockLogger = new MockLogger();
    
    // Note: You'll need to import the actual MetricsCollector class
    // const { MetricsCollector } = await import('../../src/metrics.js');
    // metrics = new MetricsCollector(mockLogger);
    
    console.log('Setting up Metrics tests...');
  });
  
  describe('Request Recording', () => {
    it('should record successful requests', () => {
      // TODO: Test successful request recording
      console.log('⚠️ TODO: Implement successful request test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should record failed requests', () => {
      // TODO: Test failed request recording
      console.log('⚠️ TODO: Implement failed request test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should track cache hits and misses', () => {
      // TODO: Test cache metrics
      console.log('⚠️ TODO: Implement cache metrics test');
      assert.ok(true, 'Test placeholder');
    });
  });
  
  describe('Response Time Calculations', () => {
    it('should calculate average response time correctly', () => {
      // TODO: Test response time calculation
      console.log('⚠️ TODO: Implement response time test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should limit response time samples', () => {
      // TODO: Test response time sample limiting
      console.log('⚠️ TODO: Implement sample limiting test');
      assert.ok(true, 'Test placeholder');
    });
  });
  
  describe('Health Monitoring', () => {
    it('should calculate failure rates correctly', () => {
      // TODO: Test failure rate calculation
      console.log('⚠️ TODO: Implement failure rate test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should track uptime accurately', () => {
      // TODO: Test uptime tracking
      console.log('⚠️ TODO: Implement uptime test');
      assert.ok(true, 'Test placeholder');
    });
  });
});

console.log('📊 Metrics Collector unit tests ready');
`;

    const testDir = path.join(projectRoot, 'test', 'unit');
    fs.writeFileSync(path.join(testDir, 'test-metrics.js'), template);
    console.log('   ✅ Created test/unit/test-metrics.js');
  }

  async createCacheTests() {
    const template = `#!/usr/bin/env node

/**
 * Unit Tests for Cache Manager
 * Tests caching behavior, TTL expiration, and LRU eviction
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

class MockLogger {
  constructor() {
    this.logs = [];
  }
  
  info(msg, meta) { this.logs.push({ level: 'info', msg, meta }); }
  debug(msg, meta) { this.logs.push({ level: 'debug', msg, meta }); }
}

describe('Cache Manager', () => {
  let cache;
  let mockLogger;
  
  beforeEach(() => {
    mockLogger = new MockLogger();
    
    // Note: You'll need to import the actual CacheManager class
    // const { CacheManager } = await import('../../src/cache.js');
    // cache = new CacheManager(config, mockLogger);
    
    console.log('Setting up Cache tests...');
  });
  
  describe('Basic Caching', () => {
    it('should store and retrieve values', () => {
      // TODO: Test basic get/set operations
      console.log('⚠️ TODO: Implement basic caching test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should return null for non-existent keys', () => {
      // TODO: Test missing key behavior
      console.log('⚠️ TODO: Implement missing key test');
      assert.ok(true, 'Test placeholder');
    });
  });
  
  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      // TODO: Test TTL expiration
      console.log('⚠️ TODO: Implement TTL expiration test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should clean up expired entries', () => {
      // TODO: Test cleanup process
      console.log('⚠️ TODO: Implement cleanup test');
      assert.ok(true, 'Test placeholder');
    });
  });
  
  describe('LRU Eviction', () => {
    it('should evict least recently used entries', () => {
      // TODO: Test LRU eviction
      console.log('⚠️ TODO: Implement LRU eviction test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should respect max cache size', () => {
      // TODO: Test max size enforcement
      console.log('⚠️ TODO: Implement max size test');
      assert.ok(true, 'Test placeholder');
    });
  });
  
  describe('Key Generation', () => {
    it('should generate consistent keys for same parameters', () => {
      // TODO: Test key generation consistency
      console.log('⚠️ TODO: Implement key generation test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should generate different keys for different parameters', () => {
      // TODO: Test key uniqueness
      console.log('⚠️ TODO: Implement key uniqueness test');
      assert.ok(true, 'Test placeholder');
    });
  });
});

console.log('💾 Cache Manager unit tests ready');
`;

    const testDir = path.join(projectRoot, 'test', 'unit');
    fs.writeFileSync(path.join(testDir, 'test-cache.js'), template);
    console.log('   ✅ Created test/unit/test-cache.js');
  }

  async createConfigTests() {
    const template = `#!/usr/bin/env node

/**
 * Unit Tests for Configuration Management
 * Tests environment variable parsing and default values
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('Configuration Management', () => {
  let originalEnv;
  
  beforeEach(() => {
    originalEnv = { ...process.env };
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });
  
  describe('Environment Variable Parsing', () => {
    it('should parse environment variables correctly', () => {
      // TODO: Test environment variable parsing
      console.log('⚠️ TODO: Implement env parsing test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should use default values when env vars are missing', () => {
      // TODO: Test default value fallback
      console.log('⚠️ TODO: Implement default values test');
      assert.ok(true, 'Test placeholder');
    });
  });
  
  describe('Configuration Validation', () => {
    it('should validate required configuration', () => {
      // TODO: Test configuration validation
      console.log('⚠️ TODO: Implement config validation test');
      assert.ok(true, 'Test placeholder');
    });
    
    it('should handle invalid configuration gracefully', () => {
      // TODO: Test invalid config handling
      console.log('⚠️ TODO: Implement invalid config test');
      assert.ok(true, 'Test placeholder');
    });
  });
});

console.log('⚙️ Configuration unit tests ready');
`;

    const testDir = path.join(projectRoot, 'test', 'unit');
    fs.writeFileSync(path.join(testDir, 'test-config.js'), template);
    console.log('   ✅ Created test/unit/test-config.js');
  }
}

// Run the detailed analysis
const analyzer = new DetailedUntestedAnalysis();
analyzer.analyze().catch(error => {
  console.error('Error in detailed analysis:', error);
  process.exit(1);
});

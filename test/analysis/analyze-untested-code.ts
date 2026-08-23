#!/usr/bin/env node

/**
 * ✅ Detailed Untested Code Analysis (TypeScript)
 * Creates specific test templates for critical untested components
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

interface ClassInfo {
  name: string;
  methods: string[];
  privateMembers: string[];
}

interface FileStructure {
  classes: ClassInfo[];
  functions: string[];
  exports: string[];
  publicMethods: string[];
}

class DetailedUntestedAnalysis {
  private criticalFiles: string[];

  constructor() {
    this.criticalFiles = [
      'src/courtlistener.ts',
      'src/metrics.ts',
      'src/cache.ts',
      'src/config.ts',
      'src/tool-definitions.ts',
    ];
  }

  async analyze(): Promise<void> {
    console.log('🔬 Detailed Analysis of Critical Untested Code');
    console.log('='.repeat(60));

    for (const file of this.criticalFiles) {
      await this.analyzeFile(file);
    }

    await this.generateTestTemplates();
  }

  async analyzeFile(filePath: string): Promise<void> {
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

  private extractFileStructure(content: string): FileStructure {
    const classes: ClassInfo[] = [];
    const functions: string[] = [];
    const exports: string[] = [];
    const publicMethods: string[] = [];

    // Extract classes with detailed method analysis
    const classMatches = content.matchAll(/(?:export\s+)?class\s+(\w+).*?{([\s\S]*?)^}/gm);
    for (const match of classMatches) {
      const className = match[1];
      const classBody = match[2];

      const methods: string[] = [];
      const privateMembers: string[] = [];

      // Extract methods
      const methodMatches = classBody.matchAll(
        /(?:async\s+)?(private\s+|public\s+)?(\w+)\s*\([^)]*\)\s*[:{]/g,
      );
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
        privateMembers,
      });
    }

    // Extract standalone functions
    const functionMatches = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
    for (const match of functionMatches) {
      functions.push(match[1]);
    }

    // Extract exports
    const exportMatches = content.matchAll(
      /export\s+(?:default\s+)?(?:class|function|const|interface|type)\s+(\w+)/g,
    );
    for (const match of exportMatches) {
      exports.push(match[1]);
    }

    return {
      classes,
      functions,
      exports,
      publicMethods,
    };
  }

  private assessTestingPriority(filePath: string, analysis: FileStructure): void {
    const priorities: string[] = [];

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

  private async generateTestTemplates(): Promise<void> {
    console.log('\n🛠️ Generating Test Templates');
    console.log('='.repeat(60));

    // Create test templates for critical files
    await this.createCourtListenerTests();
    await this.createMetricsTests();
    await this.createCacheTests();
    await this.createConfigTests();

    console.log('\n✅ Test templates generated in test/unit/ directory');
    console.log('💡 Run these tests with: pnpm run test:unit');
  }

  private async createCourtListenerTests(): Promise<void> {
    const template = `#!/usr/bin/env node

/**
 * Unit Tests for CourtListener API Client
 * Tests API integration, caching, rate limiting, and error handling
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Note: This is a template file - implement actual tests based on your needs
console.log('🧪 CourtListener API unit tests template ready');
`;

    const testDir = path.join(projectRoot, 'test', 'unit');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    fs.writeFileSync(path.join(testDir, 'test-courtlistener-template.ts'), template);
    console.log('   ✅ Created test/unit/test-courtlistener-template.ts');
  }

  private async createMetricsTests(): Promise<void> {
    const template = `#!/usr/bin/env node

/**
 * Unit Tests for Metrics Collector
 * Tests metric recording, calculations, and performance tracking
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Note: This is a template file - implement actual tests based on your needs
console.log('📊 Metrics Collector unit tests template ready');
`;

    const testDir = path.join(projectRoot, 'test', 'unit');
    fs.writeFileSync(path.join(testDir, 'test-metrics-template.ts'), template);
    console.log('   ✅ Created test/unit/test-metrics-template.ts');
  }

  private async createCacheTests(): Promise<void> {
    const template = `#!/usr/bin/env node

/**
 * Unit Tests for Cache Manager
 * Tests caching behavior, TTL expiration, and LRU eviction
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Note: This is a template file - implement actual tests based on your needs
console.log('💾 Cache Manager unit tests template ready');
`;

    const testDir = path.join(projectRoot, 'test', 'unit');
    fs.writeFileSync(path.join(testDir, 'test-cache-template.ts'), template);
    console.log('   ✅ Created test/unit/test-cache-template.ts');
  }

  private async createConfigTests(): Promise<void> {
    const template = `#!/usr/bin/env node

/**
 * Unit Tests for Configuration Management
 * Tests environment variable parsing and default values
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Note: This is a template file - implement actual tests based on your needs
console.log('⚙️ Configuration unit tests template ready');
`;

    const testDir = path.join(projectRoot, 'test', 'unit');
    fs.writeFileSync(path.join(testDir, 'test-config-template.ts'), template);
    console.log('   ✅ Created test/unit/test-config-template.ts');
  }
}

// Run the detailed analysis
const analyzer = new DetailedUntestedAnalysis();
analyzer.analyze().catch((error) => {
  console.error('Error in detailed analysis:', error);
  process.exit(1);
});

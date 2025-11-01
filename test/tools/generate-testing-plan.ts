#!/usr/bin/env node

/**
 * ✅ Test Coverage Action Plan Generator (TypeScript)
 * Creates a prioritized roadmap for implementing comprehensive test coverage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '../..');

interface ActionItem {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  file: string;
  component: string;
  lines: number;
  methods: number;
  effort: string;
  risk: string;
  impact: string;
  tasks: string[];
  dependencies: string[];
}

interface Timeline {
  week1: string[];
  week2: string[];
  week3: string[];
  week4: string[];
}

interface TestResult {
  file: string;
  success: boolean;
  output: string;
  error: string;
  code: number | null;
}

interface PackageJson {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

class TestCoverageActionPlan {
  private actionItems: ActionItem[];
  private timeline: Timeline;

  constructor() {
    this.actionItems = [];
    this.timeline = {
      week1: [],
      week2: [],
      week3: [],
      week4: [],
    };
  }

  async generatePlan(): Promise<void> {
    console.log('📋 Test Coverage Action Plan Generator');
    console.log('='.repeat(60));

    await this.analyzePriorities();
    await this.createTimeline();
    await this.generateTestRunner();
    await this.updatePackageJson();
    await this.createTestingGuidelines();

    this.printActionPlan();
  }

  private async analyzePriorities(): Promise<void> {
    console.log('\n🎯 Analyzing Testing Priorities...');

    this.actionItems = [
      {
        priority: 'CRITICAL',
        file: 'src/courtlistener.ts',
        component: 'CourtListener API',
        lines: 367,
        methods: 35,
        effort: 'High',
        risk: 'High',
        impact: 'High',
        tasks: [
          'Test API rate limiting and request queuing',
          'Test caching behavior and cache invalidation',
          'Test error handling and retry logic',
          'Test all search methods with various inputs',
          'Test network failure scenarios',
          'Mock external API responses for consistent testing',
        ],
        dependencies: ['Mock HTTP client', 'Test fixtures for API responses'],
      },
      {
        priority: 'CRITICAL',
        file: 'src/metrics.ts',
        component: 'Metrics Collector',
        lines: 226,
        methods: 10,
        effort: 'Medium',
        risk: 'High',
        impact: 'High',
        tasks: [
          'Test metric recording accuracy',
          'Test response time calculations',
          'Test memory management of response time samples',
          'Test failure rate calculations',
          'Test cache hit/miss tracking',
          'Test metric reset functionality',
        ],
        dependencies: ['Time simulation utilities', 'Memory usage monitoring'],
      },
      {
        priority: 'CRITICAL',
        file: 'src/cache.ts',
        component: 'Cache Manager',
        lines: 195,
        methods: 11,
        effort: 'Medium',
        risk: 'High',
        impact: 'High',
        tasks: [
          'Test TTL expiration logic',
          'Test LRU eviction behavior',
          'Test concurrent access scenarios',
          'Test cache size limits',
          'Test key generation consistency',
          'Test cleanup processes',
        ],
        dependencies: ['Time manipulation utilities', 'Concurrency testing tools'],
      },
      {
        priority: 'HIGH',
        file: 'src/enterprise-server.ts',
        component: 'Enterprise Server',
        lines: 700,
        methods: 54,
        effort: 'Very High',
        risk: 'Medium',
        impact: 'High',
        tasks: [
          'Test middleware integration pipeline',
          'Test security boundary enforcement',
          'Test graceful shutdown behavior',
          'Test tool handler methods',
          'Test error propagation',
          'Test configuration integration',
        ],
        dependencies: ['Middleware mocks', 'Server lifecycle utilities'],
      },
      {
        priority: 'HIGH',
        file: 'src/http-server.ts',
        component: 'Health Server',
        lines: 214,
        methods: 13,
        effort: 'Medium',
        risk: 'Medium',
        impact: 'Medium',
        tasks: [
          'Test health endpoint responses',
          'Test metrics endpoint formatting',
          'Test error handling for malformed requests',
          'Test all HTTP endpoints',
          'Test CORS handling',
          'Test server startup/shutdown',
        ],
        dependencies: ['HTTP testing utilities', 'Mock HTTP requests'],
      },
      {
        priority: 'MEDIUM',
        file: 'src/config.ts',
        component: 'Configuration',
        lines: 186,
        methods: 4,
        effort: 'Low',
        risk: 'Low',
        impact: 'Medium',
        tasks: [
          'Test environment variable parsing',
          'Test default value handling',
          'Test configuration validation',
          'Test invalid configuration scenarios',
          'Test configuration summary generation',
        ],
        dependencies: ['Environment variable mocking'],
      },
    ];
  }

  private async createTimeline(): Promise<void> {
    console.log('📅 Creating Implementation Timeline...');

    // Week 1: Critical infrastructure
    this.timeline.week1.push(
      '🏗️ Set up unit testing infrastructure',
      '📊 Implement Metrics Collector tests (CRITICAL)',
      '💾 Implement Cache Manager tests (CRITICAL)',
      '⚙️ Implement Configuration tests (quick wins)'
    );

    // Week 2: API integration
    this.timeline.week2.push(
      '🌐 Implement CourtListener API tests (CRITICAL)',
      '🔧 Create comprehensive API mocking framework',
      '🧪 Add error scenario testing',
      '⚡ Performance testing for caching'
    );

    // Week 3: Server integration
    this.timeline.week3.push(
      '🏥 Implement Health Server tests',
      '🏢 Begin Enterprise Server testing (high complexity)',
      '🔌 Test middleware integration points',
      '🔒 Security boundary testing'
    );

    // Week 4: Completion and optimization
    this.timeline.week4.push(
      '✅ Complete Enterprise Server tests',
      '📈 Set up test coverage reporting',
      '🚀 Integration with CI/CD pipeline',
      '📚 Documentation and test maintenance guidelines'
    );
  }

  private async generateTestRunner(): Promise<void> {
    console.log('🏃 Creating Test Runner...');

    const testRunner = `#!/usr/bin/env node

/**
 * Unit Test Runner for Legal MCP Server
 * Runs all unit tests and generates coverage reports
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

class UnitTestRunner {
  constructor() {
    this.testResults = [];
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  async runAllTests() {
    console.log('🧪 Running Legal MCP Server Unit Tests');
    console.log('='.repeat(50));
    
    const testDir = path.join(projectRoot, 'test', 'unit');
    
    if (!fs.existsSync(testDir)) {
      console.log('❌ Unit test directory not found:', testDir);
      console.log('💡 Run: npx tsx test/analysis/analyze-untested-code.ts to generate test templates');
      process.exit(1);
    }
    
    const testFiles = fs.readdirSync(testDir)
      .filter(file => file.startsWith('test-') && (file.endsWith('.ts') || file.endsWith('.js')));
    
    if (testFiles.length === 0) {
      console.log('❌ No unit test files found');
      console.log('💡 Generate test templates first');
      process.exit(1);
    }
    
    console.log(\`📁 Found \${testFiles.length} test files\\n\`);
    
    for (const testFile of testFiles) {
      await this.runTestFile(testFile);
    }
    
    this.printSummary();
  }

  async runTestFile(testFile) {
    console.log(\`🧪 Running \${testFile}...\`);
    
    const testPath = path.join(projectRoot, 'test', 'unit', testFile);
    
    return new Promise((resolve) => {
      const child = spawn('npx', ['tsx', testPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: projectRoot
      });
      
      let output = '';
      let errorOutput = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      child.on('close', (code) => {
        const result = {
          file: testFile,
          success: code === 0,
          output,
          error: errorOutput,
          code
        };
        
        this.testResults.push(result);
        
        if (code === 0) {
          console.log(\`   ✅ \${testFile} - PASSED\`);
          this.passedTests++;
        } else {
          console.log(\`   ❌ \${testFile} - FAILED (exit code: \${code})\`);
          if (errorOutput) {
            console.log(\`      Error: \${errorOutput.split('\\n')[0]}\`);
          }
          this.failedTests++;
        }
        
        this.totalTests++;
        resolve(result);
      });
    });
  }

  printSummary() {
    console.log('\\n' + '='.repeat(50));
    console.log('📊 Unit Test Summary');
    console.log('='.repeat(50));
    
    const successRate = this.totalTests > 0 ? (this.passedTests / this.totalTests * 100).toFixed(1) : '0';
    
    console.log(\`Total Tests: \${this.totalTests}\`);
    console.log(\`✅ Passed: \${this.passedTests}\`);
    console.log(\`❌ Failed: \${this.failedTests}\`);
    console.log(\`📈 Success Rate: \${successRate}%\`);
    
    if (this.failedTests > 0) {
      console.log('\\n❌ Failed Tests:');
      for (const result of this.testResults) {
        if (!result.success) {
          console.log(\`   📄 \${result.file}\`);
          if (result.error) {
            console.log(\`      \${result.error.split('\\n')[0]}\`);
          }
        }
      }
    }
    
    console.log('\\n💡 Next Steps:');
    if (this.failedTests > 0) {
      console.log('   1. Fix failing unit tests');
      console.log('   2. Implement missing test cases');
    }
    console.log('   3. Add more comprehensive test coverage');
    console.log('   4. Set up automated test coverage reporting');
    console.log('   5. Integrate with CI/CD pipeline');
    
    // Exit with error code if any tests failed
    process.exit(this.failedTests > 0 ? 1 : 0);
  }
}

// Run the tests
const runner = new UnitTestRunner();
runner.runAllTests().catch(error => {
  console.error('Error running unit tests:', error);
  process.exit(1);
});
`;

    const scriptsDir = path.join(projectRoot, 'scripts');
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(scriptsDir, 'run-unit-tests.ts'), testRunner);
    console.log('   ✅ Created scripts/run-unit-tests.ts');
  }

  private async updatePackageJson(): Promise<void> {
    console.log('📦 Updating package.json...');

    const packageJsonPath = path.join(projectRoot, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf-8')
      ) as PackageJson;

      // Add unit test scripts
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }

      packageJson.scripts['test:unit'] = 'npx tsx test/runners/run-unit-tests.ts';
      packageJson.scripts['test:coverage'] = 'npx tsx test/analysis/analyze-test-coverage.ts';
      packageJson.scripts['test:analysis'] = 'npx tsx test/analysis/analyze-untested-code.ts';
      packageJson.scripts['test:all'] = 'npm run test:unit && npm run test:enterprise';

      // Add development dependencies for testing
      if (!packageJson.devDependencies) {
        packageJson.devDependencies = {};
      }

      // Only add if not already present
      const testDeps: Record<string, string> = {
        c8: '^8.0.1',
        sinon: '^15.2.0',
      };

      for (const [dep, version] of Object.entries(testDeps)) {
        if (
          !packageJson.devDependencies[dep] &&
          !packageJson.dependencies?.[dep]
        ) {
          packageJson.devDependencies[dep] = version;
        }
      }

      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2)
      );
      console.log('   ✅ Updated package.json with test scripts');
    }
  }

  private async createTestingGuidelines(): Promise<void> {
    console.log('📚 Creating Testing Guidelines...');

    const guidelines = `# Unit Testing Guidelines for Legal MCP Server

## Overview
This document provides guidelines for writing and maintaining unit tests for the Legal MCP Server codebase.

## Test Structure

### File Organization
- Unit tests are located in \`test/unit/\`
- Test files follow the naming convention: \`test-{component}.ts\`
- Each source file should have a corresponding test file

### Test Naming Convention
- Test files: \`test-{component}.ts\`
- Test suites: \`describe('{Component Name}', () => {})\`
- Test cases: \`it('should {expected behavior}', () => {})\`

## Testing Priorities

### 🔥 CRITICAL (Must Test)
1. **Core Business Logic**
   - API integration (CourtListener)
   - Caching mechanisms
   - Metrics collection
   - Error handling

2. **Security Components**
   - Authentication middleware
   - Input sanitization
   - Rate limiting

3. **Performance Critical**
   - Cache TTL/LRU logic
   - Rate limiting algorithms
   - Memory management

### ⚡ HIGH (Should Test)
1. **Server Infrastructure**
   - HTTP server endpoints
   - Enterprise server middleware
   - Configuration management

2. **Integration Points**
   - Middleware pipeline
   - Tool handlers
   - Error propagation

### 🟡 MEDIUM (Nice to Test)
1. **Utilities**
   - Helper functions
   - Data transformations
   - Logging utilities

## Writing Effective Tests

### Test Structure Pattern
\`\`\`typescript
describe('Component Name', () => {
  let component: ComponentType;
  let mockDependencies: MockDeps;
  
  beforeEach(() => {
    // Setup mocks and test instance
    mockDependencies = createMocks();
    component = new Component(mockDependencies);
  });
  
  describe('Feature Group', () => {
    it('should handle normal case', () => {
      // Arrange
      const input = { /* test data */ };
      
      // Act
      const result = component.method(input);
      
      // Assert
      assert.strictEqual(result.expected, 'value');
    });
    
    it('should handle edge case', () => {
      // Test edge cases and error conditions
    });
  });
});
\`\`\`

### Mocking Guidelines

#### Mock External Dependencies
- Always mock external APIs
- Mock file system operations
- Mock network calls
- Mock timing functions

#### Mock Example
\`\`\`typescript
class MockLogger {
  private logs: Array<{ level: string; msg: string; meta?: unknown }> = [];
  
  info(msg: string, meta?: unknown): void { 
    this.logs.push({ level: 'info', msg, meta }); 
  }
  
  error(msg: string, meta?: unknown): void { 
    this.logs.push({ level: 'error', msg, meta }); 
  }
}
\`\`\`

### Test Coverage Goals

| Component | Target Coverage | Priority |
|-----------|----------------|----------|
| CourtListener API | 90%+ | CRITICAL |
| Metrics Collector | 95%+ | CRITICAL |
| Cache Manager | 90%+ | CRITICAL |
| Enterprise Server | 80%+ | HIGH |
| HTTP Server | 85%+ | HIGH |
| Configuration | 70%+ | MEDIUM |

## Running Tests

### Command Reference
\`\`\`bash
# Run all unit tests
npm run test:unit

# Run test coverage analysis
npm run test:coverage

# Run all tests (unit + enterprise)
npm run test:all

# Analyze untested code
npm run test:analysis
\`\`\`

### CI/CD Integration
- All tests must pass before merging
- Coverage reports should be generated
- Failed tests should block deployment

## Best Practices

### 1. Test Isolation
- Each test should be independent
- Clean up after each test
- Use beforeEach/afterEach for setup/teardown

### 2. Test Data
- Use realistic test data
- Create data fixtures for complex objects
- Avoid hardcoded values where possible

### 3. Async Testing
\`\`\`typescript
// Correct async test
it('should handle async operation', async () => {
  const result = await component.asyncMethod();
  assert.strictEqual(result.status, 'success');
});
\`\`\`

### 4. Error Testing
- Test both success and failure cases
- Test edge cases and boundary conditions
- Verify error messages and types

### 5. Performance Testing
- Test response time expectations
- Test memory usage for large datasets
- Test concurrent operations

## Maintenance

### Regular Tasks
1. **Weekly**: Review test coverage reports
2. **Monthly**: Update test dependencies
3. **Per Release**: Run full test suite
4. **After Changes**: Update related tests

### Test Debt Management
- Prioritize fixing broken tests
- Remove obsolete tests
- Refactor test code for maintainability

## Resources

### Testing Tools
- **Node.js Test Runner**: Built-in testing framework
- **tsx**: TypeScript execution for tests
- **c8**: Code coverage tool
- **Sinon**: Mocking and stubbing library

### Documentation
- [Node.js Test Runner](https://nodejs.org/api/test.html)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

**Remember**: Good tests are an investment in code quality and developer productivity!
`;

    const testDir = path.join(projectRoot, 'test');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(testDir, 'TESTING_GUIDELINES.md'),
      guidelines
    );
    console.log('   ✅ Created test/TESTING_GUIDELINES.md');
  }

  private printActionPlan(): void {
    console.log('\n🎯 Test Coverage Action Plan');
    console.log('='.repeat(60));

    console.log('\n📊 Priority Summary:');
    const criticalItems = this.actionItems.filter(
      (item) => item.priority === 'CRITICAL'
    );
    const highItems = this.actionItems.filter(
      (item) => item.priority === 'HIGH'
    );
    const mediumItems = this.actionItems.filter(
      (item) => item.priority === 'MEDIUM'
    );

    console.log(`   🔥 CRITICAL: ${criticalItems.length} components`);
    console.log(`   ⚡ HIGH: ${highItems.length} components`);
    console.log(`   🟡 MEDIUM: ${mediumItems.length} components`);

    const totalMethods = this.actionItems.reduce(
      (sum, item) => sum + item.methods,
      0
    );
    const totalLines = this.actionItems.reduce(
      (sum, item) => sum + item.lines,
      0
    );

    console.log(`\n📈 Scope:`);
    console.log(`   Methods to test: ${totalMethods}`);
    console.log(`   Lines of code: ${totalLines}`);

    console.log('\n📅 Implementation Timeline:');

    console.log('\n   🗓️ Week 1 (Critical Infrastructure):');
    for (const task of this.timeline.week1) {
      console.log(`      ${task}`);
    }

    console.log('\n   🗓️ Week 2 (API Integration):');
    for (const task of this.timeline.week2) {
      console.log(`      ${task}`);
    }

    console.log('\n   🗓️ Week 3 (Server Integration):');
    for (const task of this.timeline.week3) {
      console.log(`      ${task}`);
    }

    console.log('\n   🗓️ Week 4 (Completion):');
    for (const task of this.timeline.week4) {
      console.log(`      ${task}`);
    }

    console.log('\n🚀 Immediate Next Steps:');
    console.log('   1. npm run test:unit (run existing unit tests)');
    console.log('   2. Implement Metrics Collector tests (highest ROI)');
    console.log('   3. Implement Cache Manager tests (critical performance)');
    console.log('   4. Set up test coverage monitoring');
    console.log('   5. Begin CourtListener API test implementation');

    console.log('\n📚 New Commands Available:');
    console.log('   npm run test:unit         - Run all unit tests');
    console.log('   npm run test:coverage     - Analyze test coverage');
    console.log('   npm run test:analysis     - Analyze untested code');
    console.log('   npm run test:all          - Run all tests');

    console.log('\n💡 Success Metrics:');
    console.log('   - Unit test coverage > 80% for critical components');
    console.log('   - All tests passing in CI/CD pipeline');
    console.log('   - Test execution time < 30 seconds');
    console.log('   - Zero test flakiness in core components');
  }
}

// Generate the action plan
const planner = new TestCoverageActionPlan();
planner.generatePlan().catch((error) => {
  console.error('Error generating action plan:', error);
  process.exit(1);
});


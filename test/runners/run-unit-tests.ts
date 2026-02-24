#!/usr/bin/env node

/**
 * Unit Test Runner for Legal MCP Server
 * Runs all unit tests and generates coverage reports
 * All tests are now in TypeScript (.ts)
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '../..');

interface TestResult {
  file: string;
  success: boolean;
  output: string;
  error: string;
  code: number | null;
}

class UnitTestRunner {
  private testResults: TestResult[] = [];
  private totalTests = 0;
  private passedTests = 0;
  private failedTests = 0;

  async runAllTests(): Promise<void> {
    console.log('🧪 Running Legal MCP Server Unit Tests');
    console.log('='.repeat(50));

    const testDir = path.join(projectRoot, 'test', 'unit');

    if (!fs.existsSync(testDir)) {
      console.log('❌ Unit test directory not found:', testDir);
      console.log('💡 Run: node scripts/analyze-untested-code.js to generate test templates');
      process.exit(1);
    }

    const testFiles = fs
      .readdirSync(testDir)
      .filter((file) => {
        // Only TypeScript test files
        return file.startsWith('test-') && file.endsWith('.ts');
      })
      .filter((file) => {
        // Skip empty test files
        const filePath = path.join(testDir, file);
        const content = fs.readFileSync(filePath, 'utf8').trim();
        return content.length > 0;
      })
      .filter((file) => {
        // Skip known problematic tests
        const problematicTests: string[] = [];
        if (problematicTests.includes(file)) {
          console.log(`⏭️  Skipping ${file} (known to hang with Node.js test runner)`);
          return false;
        }
        return true;
      });

    if (testFiles.length === 0) {
      console.log('❌ No unit test files found');
      console.log('💡 Generate test templates first');
      process.exit(1);
    }

    console.log(`📁 Found ${testFiles.length} test files\n`);

    for (const testFile of testFiles) {
      await this.runTestFile(testFile);
    }

    this.printSummary();
  }

  async runTestFile(testFile: string): Promise<TestResult> {
    console.log(`🧪 Running ${testFile}...`);

    const testPath = path.join(projectRoot, 'test', 'unit', testFile);

    return new Promise((resolve) => {
      // Use tsx directly to avoid npx wrapper issues with process cleanup
      const command = path.join(projectRoot, 'node_modules', '.bin', 'tsx');
      const args = ['--test', testPath];

      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: projectRoot,
        detached: true,
      });

      // Add a timeout to prevent hanging tests
      // Kill entire process group to avoid orphaned child processes
      const timeout = setTimeout(() => {
        console.log(`   ⏰ ${testFile} - TIMEOUT (killing process)`);
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          /* already exited */
        }
      }, 30000); // 30 second timeout

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);

        const result: TestResult = {
          file: testFile,
          success: code === 0,
          output,
          error: errorOutput,
          code,
        };

        this.testResults.push(result);

        if (code === 0) {
          console.log(`   ✅ ${testFile} - PASSED`);
          this.passedTests++;
        } else {
          console.log(`   ❌ ${testFile} - FAILED (exit code: ${code})`);
          if (errorOutput) {
            console.log(`      Error: ${errorOutput.split('\n')[0]}`);
          }
          this.failedTests++;
        }

        this.totalTests++;
        resolve(result);
      });
    });
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(50));
    console.log('📊 Unit Test Summary');
    console.log('='.repeat(50));

    const successRate =
      this.totalTests > 0 ? ((this.passedTests / this.totalTests) * 100).toFixed(1) : '0';

    console.log(`Total Tests: ${this.totalTests}`);
    console.log(`✅ Passed: ${this.passedTests}`);
    console.log(`❌ Failed: ${this.failedTests}`);
    console.log(`📈 Success Rate: ${successRate}%`);

    if (this.failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      for (const result of this.testResults) {
        if (!result.success) {
          console.log(`   📄 ${result.file}`);
          if (result.error) {
            console.log(`      ${result.error.split('\n')[0]}`);
          }
        }
      }
    }

    console.log('\n💡 Next Steps:');
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
runner.runAllTests().catch((error) => {
  console.error('Error running unit tests:', error);
  process.exit(1);
});

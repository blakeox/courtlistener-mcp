#!/usr/bin/env node

/**
 * Unit Test Runner for Legal MCP Server
 * Runs all unit tests and generates coverage reports
 * All tests are now in TypeScript (.ts)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '../..');
const require = createRequire(import.meta.url);
const tsxPackageJsonPath = require.resolve('tsx/package.json');
const tsxCliPath = path.join(path.dirname(tsxPackageJsonPath), 'dist', 'cli.mjs');

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
  private readonly backupCopyPattern = / \d+\.ts$/;

  async runAllTests(): Promise<void> {
    console.log('🧪 Running Legal MCP Server Unit Tests');
    console.log('='.repeat(50));

    const testDir = path.join(projectRoot, 'test', 'unit');

    if (!fs.existsSync(testDir)) {
      console.log('❌ Unit test directory not found:', testDir);
      console.log('💡 Run: pnpm run test:analysis to inspect coverage gaps');
      process.exit(1);
    }

    const testFiles = fs
      .readdirSync(testDir)
      .filter((file) => {
        // Only real TypeScript test files; ignore local backup copies such as
        // "test-foo 3.ts" that can appear in shared worktrees.
        return (
          file.startsWith('test-') && file.endsWith('.ts') && !this.backupCopyPattern.test(file)
        );
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
      // Use the resolved tsx CLI directly to avoid package-manager wrapper
      // issues with process cleanup.
      // Detached subprocesses can exit with code 1 on macOS even when the same
      // test passes normally, so keep the child attached and kill it directly
      // on timeout.
      const command = process.execPath;
      const supportsForceExit = Number(process.versions.node.split('.')[0] ?? '0') >= 20;
      const args = supportsForceExit
        ? [tsxCliPath, '--test', '--test-force-exit', testPath]
        : [tsxCliPath, '--test', testPath];

      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: projectRoot,
      });

      let settled = false;
      // Add a timeout to prevent hanging tests.
      const timeout = setTimeout(() => {
        console.log(`   ⏰ ${testFile} - TIMEOUT (killing process)`);
        try {
          child.kill('SIGKILL');
        } catch {
          /* already exited */
        }
      }, 900000); // 15 minute timeout for slow integration-style unit files

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      const finish = (code: number | null, spawnError?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);

        if (spawnError) {
          errorOutput += `${spawnError.message}\n`;
        }

        const result: TestResult = {
          file: testFile,
          success: code === 0 && !spawnError,
          output,
          error: errorOutput,
          code: spawnError ? 1 : code,
        };

        this.testResults.push(result);

        if (result.success) {
          console.log(`   ✅ ${testFile} - PASSED`);
          this.passedTests++;
        } else {
          console.log(`   ❌ ${testFile} - FAILED (exit code: ${result.code})`);
          if (errorOutput) {
            console.log(`      Error: ${errorOutput.split('\n')[0]}`);
          }
          this.failedTests++;
        }

        this.totalTests++;
        resolve(result);
      };

      child.once('exit', (code) => {
        finish(code);
      });

      child.once('error', (error) => {
        finish(1, error);
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

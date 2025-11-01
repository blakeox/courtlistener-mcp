#!/usr/bin/env node

/**
 * ✅ Test Coverage Analysis Script (TypeScript)
 * Analyzes the codebase to identify untested code and missing test coverage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

interface SourceFileData {
  path: string;
  content: string;
  exports: string[];
  classes: Array<{ name: string; methods: string[] }>;
  functions: string[];
  lines: number;
}

interface TestFileData {
  path: string;
  content: string;
  imports: string[];
  describes: string[];
  tests: string[];
}

interface FileAnalysis {
  file: string;
  path: string;
  exports: string[];
  classes: Array<{ name: string; methods: string[] }>;
  functions: string[];
  lines: number;
  testFiles: Array<{ file: string; data: TestFileData }>;
  coverage: 'none' | 'minimal' | 'partial' | 'full';
}

interface CoverageReport {
  covered: FileAnalysis[];
  uncovered: FileAnalysis[];
  partialCoverage: FileAnalysis[];
  recommendations: unknown[];
}

class TestCoverageAnalyzer {
  private sourceFiles: Map<string, SourceFileData>;
  private testFiles: Map<string, TestFileData>;
  private coverageReport: CoverageReport;

  constructor() {
    this.sourceFiles = new Map();
    this.testFiles = new Map();
    this.coverageReport = {
      covered: [],
      uncovered: [],
      partialCoverage: [],
      recommendations: [],
    };
  }

  async analyze(): Promise<void> {
    console.log('🔍 Analyzing Test Coverage for Legal MCP Server');
    console.log('='.repeat(60));

    // Scan source files
    await this.scanSourceFiles();

    // Scan test files
    await this.scanTestFiles();

    // Analyze coverage
    await this.analyzeCoverage();

    // Generate report
    this.generateReport();
  }

  async scanSourceFiles(): Promise<void> {
    console.log('\n📁 Scanning source files...');

    const srcDir = path.join(projectRoot, 'src');
    const files = await this.getAllFiles(srcDir, '.ts');

    for (const file of files) {
      const relativePath = path.relative(srcDir, file);
      const content = fs.readFileSync(file, 'utf-8');

      this.sourceFiles.set(relativePath, {
        path: file,
        content,
        exports: this.extractExports(content),
        classes: this.extractClasses(content),
        functions: this.extractFunctions(content),
        lines: content.split('\n').length,
      });
    }

    console.log(`   Found ${this.sourceFiles.size} source files`);
  }

  async scanTestFiles(): Promise<void> {
    console.log('\n🧪 Scanning test files...');

    const testDir = path.join(projectRoot, 'test');
    const files = await this.getAllFiles(testDir, '.ts');

    for (const file of files) {
      const relativePath = path.relative(testDir, file);
      const content = fs.readFileSync(file, 'utf-8');

      this.testFiles.set(relativePath, {
        path: file,
        content,
        imports: this.extractImports(content),
        describes: this.extractDescribes(content),
        tests: this.extractTests(content),
      });
    }

    console.log(`   Found ${this.testFiles.size} test files`);
  }

  private async getAllFiles(
    dir: string,
    extension: string
  ): Promise<string[]> {
    const files: string[] = [];

    if (!fs.existsSync(dir)) return files;

    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...(await this.getAllFiles(fullPath, extension)));
      } else if (stat.isFile() && fullPath.endsWith(extension)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];

    // Export class/function/const patterns
    const exportPatterns = [
      /export\s+(?:default\s+)?class\s+(\w+)/g,
      /export\s+(?:default\s+)?function\s+(\w+)/g,
      /export\s+(?:default\s+)?const\s+(\w+)/g,
      /export\s+(?:default\s+)?interface\s+(\w+)/g,
      /export\s+(?:default\s+)?type\s+(\w+)/g,
      /export\s*{\s*([^}]+)\s*}/g,
    ];

    for (const pattern of exportPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1].includes(',')) {
          // Handle export { a, b, c }
          const items = match[1].split(',').map((item) => item.trim());
          exports.push(...items);
        } else {
          exports.push(match[1]);
        }
      }
    }

    return [...new Set(exports)];
  }

  private extractClasses(content: string): Array<{
    name: string;
    methods: string[];
  }> {
    const classes: Array<{ name: string; methods: string[] }> = [];
    const classPattern = /(?:export\s+)?class\s+(\w+)/g;

    let match: RegExpExecArray | null;
    while ((match = classPattern.exec(content)) !== null) {
      const className = match[1];
      const classBody = this.extractClassMethods(content, className);
      classes.push({
        name: className,
        methods: classBody,
      });
    }

    return classes;
  }

  private extractClassMethods(content: string, className: string): string[] {
    const methods: string[] = [];

    // Find class definition
    const classPattern = new RegExp(
      `class\\s+${className}[^{]*{([^}]*(?:{[^}]*}[^}]*)*)}`,
      's'
    );
    const classMatch = classPattern.exec(content);

    if (classMatch) {
      const classBody = classMatch[1];
      const methodPattern = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/g;

      let methodMatch: RegExpExecArray | null;
      while ((methodMatch = methodPattern.exec(classBody)) !== null) {
        if (!['constructor', 'get', 'set'].includes(methodMatch[1])) {
          methods.push(methodMatch[1]);
        }
      }
    }

    return methods;
  }

  private extractFunctions(content: string): string[] {
    const functions: string[] = [];
    const functionPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;

    let match: RegExpExecArray | null;
    while ((match = functionPattern.exec(content)) !== null) {
      functions.push(match[1]);
    }

    return functions;
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importPattern = /import\s+.*?from\s+['"]([^'"]+)['"]/g;

    let match: RegExpExecArray | null;
    while ((match = importPattern.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  private extractDescribes(content: string): string[] {
    const describes: string[] = [];
    const describePattern = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;

    let match: RegExpExecArray | null;
    while ((match = describePattern.exec(content)) !== null) {
      describes.push(match[1]);
    }

    return describes;
  }

  private extractTests(content: string): string[] {
    const tests: string[] = [];
    const testPatterns = [
      /(?:test|it)\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /runTest\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /runAsyncTest\s*\(\s*['"`]([^'"`]+)['"`]/g,
    ];

    for (const pattern of testPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        tests.push(match[1]);
      }
    }

    return tests;
  }

  private async analyzeCoverage(): Promise<void> {
    console.log('\n📊 Analyzing coverage gaps...');

    for (const [sourceFile, sourceData] of this.sourceFiles) {
      const analysis: FileAnalysis = {
        file: sourceFile,
        path: sourceData.path,
        exports: sourceData.exports,
        classes: sourceData.classes,
        functions: sourceData.functions,
        lines: sourceData.lines,
        testFiles: [],
        coverage: 'none',
      };

      // Find corresponding test files
      const possibleTestFiles = this.findTestFiles(sourceFile);
      analysis.testFiles = possibleTestFiles;

      if (possibleTestFiles.length > 0) {
        analysis.coverage = this.calculateCoverage(
          sourceData,
          possibleTestFiles
        );
      }

      // Categorize
      if (analysis.coverage === 'none') {
        this.coverageReport.uncovered.push(analysis);
      } else if (analysis.coverage === 'full') {
        this.coverageReport.covered.push(analysis);
      } else {
        this.coverageReport.partialCoverage.push(analysis);
      }
    }
  }

  private findTestFiles(sourceFile: string): Array<{
    file: string;
    data: TestFileData;
  }> {
    const testFiles: Array<{ file: string; data: TestFileData }> = [];
    const baseName = path.basename(sourceFile, '.ts');

    // Look for direct test file matches
    for (const [testFile, testData] of this.testFiles) {
      if (
        testFile.includes(baseName) ||
        testFile.includes(`test-${baseName}`) ||
        testData.content.includes(baseName) ||
        testData.imports.some((imp) => imp.includes(baseName))
      ) {
        testFiles.push({
          file: testFile,
          data: testData,
        });
      }
    }

    return testFiles;
  }

  private calculateCoverage(
    sourceData: SourceFileData,
    testFiles: Array<{ file: string; data: TestFileData }>
  ): 'none' | 'minimal' | 'partial' | 'full' {
    let coveredItems = 0;
    let totalItems = sourceData.exports.length + sourceData.functions.length;

    // Add class methods to total
    for (const cls of sourceData.classes) {
      totalItems += cls.methods.length;
    }

    if (totalItems === 0) return 'minimal';

    // Check if exports/functions/classes are mentioned in tests
    for (const testFile of testFiles) {
      const testContent = testFile.data.content.toLowerCase();

      // Check exports
      for (const exportItem of sourceData.exports) {
        if (testContent.includes(exportItem.toLowerCase())) {
          coveredItems++;
        }
      }

      // Check functions
      for (const func of sourceData.functions) {
        if (testContent.includes(func.toLowerCase())) {
          coveredItems++;
        }
      }

      // Check class methods
      for (const cls of sourceData.classes) {
        for (const method of cls.methods) {
          if (testContent.includes(method.toLowerCase())) {
            coveredItems++;
          }
        }
      }
    }

    const coveragePercent = (coveredItems / totalItems) * 100;

    if (coveragePercent >= 80) return 'full';
    if (coveragePercent >= 40) return 'partial';
    if (coveragePercent > 0) return 'minimal';
    return 'none';
  }

  private generateReport(): void {
    console.log('\n📋 Test Coverage Report');
    console.log('='.repeat(60));

    const total = this.sourceFiles.size;
    const covered = this.coverageReport.covered.length;
    const partial = this.coverageReport.partialCoverage.length;
    const uncovered = this.coverageReport.uncovered.length;

    console.log(`\n📈 Coverage Summary:`);
    console.log(`   Total Files: ${total}`);
    if (total > 0) {
      console.log(
        `   ✅ Full Coverage: ${covered} (${((covered / total) * 100).toFixed(1)}%)`
      );
      console.log(
        `   🟡 Partial Coverage: ${partial} (${((partial / total) * 100).toFixed(1)}%)`
      );
      console.log(
        `   ❌ No Coverage: ${uncovered} (${((uncovered / total) * 100).toFixed(1)}%)`
      );
    }

    // Detailed uncovered files
    if (this.coverageReport.uncovered.length > 0) {
      console.log(`\n❌ Files with NO Test Coverage:`);
      for (const file of this.coverageReport.uncovered) {
        console.log(`   📄 ${file.file}`);
        if (file.exports.length > 0) {
          console.log(`      Exports: ${file.exports.join(', ')}`);
        }
        if (file.classes.length > 0) {
          console.log(
            `      Classes: ${file.classes.map((c) => c.name).join(', ')}`
          );
        }
        if (file.functions.length > 0) {
          console.log(`      Functions: ${file.functions.join(', ')}`);
        }
        console.log(`      Lines: ${file.lines}`);
        console.log('');
      }
    }

    // Partial coverage details
    if (this.coverageReport.partialCoverage.length > 0) {
      console.log(`\n🟡 Files with PARTIAL Test Coverage:`);
      for (const file of this.coverageReport.partialCoverage) {
        console.log(`   📄 ${file.file} (${file.coverage} coverage)`);
        console.log(
          `      Test files: ${file.testFiles.map((t) => t.file).join(', ')}`
        );
        console.log('');
      }
    }

    // Recommendations
    this.generateRecommendations();
  }

  private generateRecommendations(): void {
    console.log(`\n💡 Testing Recommendations:`);

    const highPriorityUntested = this.coverageReport.uncovered.filter(
      (file) =>
        file.exports.length > 3 ||
        file.classes.length > 0 ||
        file.lines > 100
    );

    if (highPriorityUntested.length > 0) {
      console.log(`\n🔥 HIGH PRIORITY - Create unit tests for:`);
      for (const file of highPriorityUntested) {
        console.log(
          `   📄 ${file.file} - ${
            file.exports.length + file.classes.length + file.functions.length
          } public items, ${file.lines} lines`
        );
      }
    }

    const utilityFiles = this.coverageReport.uncovered.filter(
      (file) =>
        file.file.includes('utils') ||
        file.file.includes('helper') ||
        file.file.includes('config')
    );

    if (utilityFiles.length > 0) {
      console.log(`\n🔧 UTILITY FILES - Need basic unit tests:`);
      for (const file of utilityFiles) {
        console.log(`   📄 ${file.file}`);
      }
    }

    const coreFiles = this.coverageReport.uncovered.filter((file) =>
      ['cache.ts', 'config.ts', 'logger.ts', 'metrics.ts', 'types.ts'].includes(
        path.basename(file.file)
      )
    );

    if (coreFiles.length > 0) {
      console.log(`\n🏗️ CORE INFRASTRUCTURE - Critical to test:`);
      for (const file of coreFiles) {
        console.log(`   📄 ${file.file}`);
      }
    }

    console.log(`\n📝 Suggested next steps:`);
    console.log(`   1. Create unit tests for high-priority untested files`);
    console.log(`   2. Add integration tests for core infrastructure`);
    console.log(`   3. Consider code coverage tools like Istanbul/NYC`);
    console.log(`   4. Set up automated coverage reporting in CI/CD`);
    console.log(`   5. Aim for 80%+ coverage on critical business logic`);
  }
}

// Run the analysis
const analyzer = new TestCoverageAnalyzer();
analyzer.analyze().catch((error) => {
  console.error('Error analyzing test coverage:', error);
  process.exit(1);
});


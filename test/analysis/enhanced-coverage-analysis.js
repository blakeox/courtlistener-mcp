#!/usr/bin/env node

/**
 * 📊 Enhanced Coverage Analysis Script
 * Provides detailed test coverage reporting with actionable insights
 * Week 4: Coverage Reporting Enhancement
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

class CoverageAnalyzer {
  constructor() {
    this.testFiles = [];
    this.coverageData = null;
    this.sourceFiles = [];
  }

  /**
   * Discover test files
   */
  discoverTestFiles() {
    const testPatterns = [
      'test/unit/test-cache.js',
      'test/unit/test-config.js', 
      'test/unit/test-logger.js',
      'test/unit/test-metrics.js',
      'test/unit/test-circuit-breaker.js',
      'test/unit/test-courtlistener.js',
      'test/unit/test-server-integration.js',
      'test/unit/test-enterprise-server.js'
    ];

    this.testFiles = testPatterns.filter(file => existsSync(file));
    
    console.log(`📁 Discovered ${this.testFiles.length} test files:`);
    this.testFiles.forEach(file => console.log(`   ✓ ${file}`));
    
    return this.testFiles.length > 0;
  }

  /**
   * Discover source files
   */
  discoverSourceFiles() {
    const sourcePatterns = [
      'src/cache.ts',
      'src/config.ts',
      'src/logger.ts', 
      'src/metrics.ts',
      'src/circuit-breaker.ts',
      'src/courtlistener.ts',
      'src/http-server.ts',
      'src/index.ts',
      'src/types.ts',
      'src/tool-definitions.ts'
    ];

    this.sourceFiles = sourcePatterns.filter(file => existsSync(file));
    
    console.log(`📂 Discovered ${this.sourceFiles.length} source files:`);
    this.sourceFiles.forEach(file => console.log(`   ✓ ${file}`));
    
    return this.sourceFiles.length > 0;
  }

  /**
   * Run coverage analysis
   */
  runCoverage() {
    console.log(`\n📊 Running comprehensive coverage analysis...`);
    
    if (this.testFiles.length === 0) {
      console.log(`❌ No test files found for coverage analysis`);
      return false;
    }

    try {
      // Build the coverage command
      const testCommand = this.testFiles.join(' && node ');
      const coverageCommand = `npx c8 --config .c8rc.json node ${this.testFiles[0]}`;
      
      console.log(`⚡ Executing: ${coverageCommand}`);
      
      // Run coverage for each test file separately to get better insights
      const results = [];
      
      for (const testFile of this.testFiles) {
        console.log(`\n🧪 Analyzing coverage for ${testFile}...`);
        
        try {
          const cmd = `npx c8 --config .c8rc.json --reporter=json-summary node ${testFile}`;
          const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
          
          // Try to read the coverage summary
          if (existsSync('coverage/coverage-summary.json')) {
            const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf-8'));
            results.push({
              testFile,
              summary,
              success: true
            });
          }
          
          console.log(`   ✅ Coverage analysis completed for ${testFile}`);
        } catch (error) {
          console.log(`   ⚠️  Coverage analysis failed for ${testFile}: ${error.message}`);
          results.push({
            testFile,
            error: error.message,
            success: false
          });
        }
      }
      
      // Run comprehensive coverage for all tests
      console.log(`\n🔄 Running comprehensive coverage for all tests...`);
      
      try {
        const allTestsCommand = `npx c8 --config .c8rc.json --reporter=html --reporter=text --reporter=json-summary bash -c "node ${this.testFiles.join(' && node ')}"`;
        const output = execSync(allTestsCommand, { encoding: 'utf-8', cwd: process.cwd() });
        
        console.log(`\n📊 Coverage Output:`);
        console.log(output);
        
        // Read final coverage summary
        if (existsSync('coverage/coverage-summary.json')) {
          this.coverageData = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf-8'));
        }
        
        return true;
      } catch (error) {
        console.log(`❌ Comprehensive coverage failed: ${error.message}`);
        return false;
      }
      
    } catch (error) {
      console.log(`💥 Coverage analysis crashed: ${error.message}`);
      return false;
    }
  }

  /**
   * Analyze coverage data
   */
  analyzeCoverage() {
    if (!this.coverageData) {
      console.log(`⚠️  No coverage data available for analysis`);
      return null;
    }

    console.log(`\n🔍 Analyzing coverage data...`);
    
    const analysis = {
      overall: this.coverageData.total || {},
      files: [],
      recommendations: [],
      metrics: {
        totalFiles: 0,
        coveredFiles: 0,
        uncoveredFiles: 0,
        averageCoverage: {
          lines: 0,
          functions: 0,
          branches: 0,
          statements: 0
        }
      }
    };

    // Analyze per-file coverage
    if (this.coverageData) {
      const files = Object.keys(this.coverageData).filter(key => key !== 'total');
      analysis.metrics.totalFiles = files.length;
      
      let totalLines = 0, totalFunctions = 0, totalBranches = 0, totalStatements = 0;
      
      files.forEach(file => {
        if (this.coverageData[file]) {
          const fileCoverage = this.coverageData[file];
          const linesPct = fileCoverage.lines?.pct || 0;
          const funcsPct = fileCoverage.functions?.pct || 0;
          const branchesPct = fileCoverage.branches?.pct || 0;
          const stmtsPct = fileCoverage.statements?.pct || 0;
          
          analysis.files.push({
            file: file.replace(process.cwd(), ''),
            lines: linesPct,
            functions: funcsPct,
            branches: branchesPct,
            statements: stmtsPct,
            overall: (linesPct + funcsPct + branchesPct + stmtsPct) / 4
          });
          
          totalLines += linesPct;
          totalFunctions += funcsPct;
          totalBranches += branchesPct;
          totalStatements += stmtsPct;
          
          if (linesPct > 0) analysis.metrics.coveredFiles++;
          else analysis.metrics.uncoveredFiles++;
        }
      });
      
      if (files.length > 0) {
        analysis.metrics.averageCoverage = {
          lines: totalLines / files.length,
          functions: totalFunctions / files.length,
          branches: totalBranches / files.length,
          statements: totalStatements / files.length
        };
      }
    }

    // Generate recommendations
    analysis.recommendations = this.generateCoverageRecommendations(analysis);
    
    return analysis;
  }

  /**
   * Generate coverage recommendations
   */
  generateCoverageRecommendations(analysis) {
    const recommendations = [];
    const thresholds = { high: 90, good: 80, acceptable: 70 };
    
    const overall = analysis.overall;
    const linesPct = overall.lines?.pct || 0;
    const funcsPct = overall.functions?.pct || 0;
    const branchesPct = overall.branches?.pct || 0;
    
    // Overall coverage recommendations
    if (linesPct < thresholds.acceptable) {
      recommendations.push({
        type: 'CRITICAL',
        category: 'Line Coverage',
        message: `Line coverage ${linesPct.toFixed(1)}% is below acceptable threshold (${thresholds.acceptable}%)`,
        action: 'Add unit tests to increase line coverage',
        priority: 'High'
      });
    } else if (linesPct < thresholds.good) {
      recommendations.push({
        type: 'WARNING',
        category: 'Line Coverage',
        message: `Line coverage ${linesPct.toFixed(1)}% is below good threshold (${thresholds.good}%)`,
        action: 'Consider adding more comprehensive tests',
        priority: 'Medium'
      });
    }
    
    if (funcsPct < thresholds.acceptable) {
      recommendations.push({
        type: 'CRITICAL',
        category: 'Function Coverage',
        message: `Function coverage ${funcsPct.toFixed(1)}% is below acceptable threshold`,
        action: 'Ensure all public functions have test cases',
        priority: 'High'
      });
    }
    
    if (branchesPct < thresholds.acceptable) {
      recommendations.push({
        type: 'WARNING',
        category: 'Branch Coverage',
        message: `Branch coverage ${branchesPct.toFixed(1)}% indicates missing edge case testing`,
        action: 'Add tests for error conditions and edge cases',
        priority: 'Medium'
      });
    }
    
    // File-specific recommendations
    analysis.files.forEach(file => {
      if (file.overall < thresholds.acceptable) {
        recommendations.push({
          type: 'WARNING',
          category: 'File Coverage',
          message: `${file.file} has low coverage (${file.overall.toFixed(1)}%)`,
          action: `Add specific tests for ${file.file}`,
          priority: 'Medium',
          file: file.file
        });
      }
    });
    
    // Uncovered files
    if (analysis.metrics.uncoveredFiles > 0) {
      recommendations.push({
        type: 'WARNING',
        category: 'Uncovered Files',
        message: `${analysis.metrics.uncoveredFiles} files have no test coverage`,
        action: 'Create test files for uncovered source files',
        priority: 'Medium'
      });
    }
    
    // Success message
    if (recommendations.length === 0 || recommendations.every(r => r.type !== 'CRITICAL')) {
      recommendations.unshift({
        type: 'SUCCESS',
        category: 'Overall',
        message: 'Test coverage meets quality standards!',
        action: 'Maintain current testing practices',
        priority: 'Info'
      });
    }
    
    return recommendations;
  }

  /**
   * Generate coverage report
   */
  generateReport(analysis) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        test_files: this.testFiles.length,
        source_files: this.sourceFiles.length,
        overall_coverage: analysis.overall,
        metrics: analysis.metrics,
        recommendations_count: analysis.recommendations.length,
        critical_issues: analysis.recommendations.filter(r => r.type === 'CRITICAL').length
      },
      coverage: analysis,
      test_files: this.testFiles,
      source_files: this.sourceFiles
    };

    // Write JSON report
    writeFileSync('coverage-report.json', JSON.stringify(report, null, 2));
    
    // Write markdown report
    const markdown = this.generateMarkdownReport(report);
    writeFileSync('COVERAGE-REPORT.md', markdown);
    
    return report;
  }

  /**
   * Generate markdown coverage report
   */
  generateMarkdownReport(report) {
    const { summary, coverage } = report;
    
    let markdown = `# 📊 Test Coverage Report\n\n`;
    markdown += `**Generated:** ${summary.timestamp}\n\n`;
    
    // Summary
    markdown += `## 📈 Coverage Summary\n\n`;
    const overall = coverage.overall;
    
    if (overall.lines) {
      markdown += `| Metric | Coverage | Status |\n`;
      markdown += `|--------|----------|--------|\n`;
      markdown += `| Lines | ${overall.lines.pct?.toFixed(1) || 0}% (${overall.lines.covered}/${overall.lines.total}) | ${this.getCoverageStatus(overall.lines.pct)} |\n`;
      markdown += `| Functions | ${overall.functions.pct?.toFixed(1) || 0}% (${overall.functions.covered}/${overall.functions.total}) | ${this.getCoverageStatus(overall.functions.pct)} |\n`;
      markdown += `| Branches | ${overall.branches.pct?.toFixed(1) || 0}% (${overall.branches.covered}/${overall.branches.total}) | ${this.getCoverageStatus(overall.branches.pct)} |\n`;
      markdown += `| Statements | ${overall.statements.pct?.toFixed(1) || 0}% (${overall.statements.covered}/${overall.statements.total}) | ${this.getCoverageStatus(overall.statements.pct)} |\n\n`;
    }
    
    // File-level coverage
    if (coverage.files.length > 0) {
      markdown += `## 📁 File Coverage\n\n`;
      markdown += `| File | Lines | Functions | Branches | Statements | Overall |\n`;
      markdown += `|------|-------|-----------|----------|------------|----------|\n`;
      
      coverage.files.forEach(file => {
        markdown += `| ${file.file} | ${file.lines.toFixed(1)}% | ${file.functions.toFixed(1)}% | ${file.branches.toFixed(1)}% | ${file.statements.toFixed(1)}% | ${file.overall.toFixed(1)}% |\n`;
      });
      markdown += `\n`;
    }
    
    // Recommendations
    markdown += `## 💡 Recommendations\n\n`;
    coverage.recommendations.forEach(rec => {
      const icon = rec.type === 'SUCCESS' ? '🎉' : rec.type === 'WARNING' ? '⚠️' : '🚨';
      markdown += `### ${icon} ${rec.category} (${rec.priority})\n\n`;
      markdown += `**${rec.message}**\n\n`;
      markdown += `*Action:* ${rec.action}\n\n`;
      
      if (rec.file) {
        markdown += `*File:* ${rec.file}\n\n`;
      }
    });
    
    return markdown;
  }

  /**
   * Get coverage status emoji
   */
  getCoverageStatus(percentage) {
    if (!percentage) return '❌';
    if (percentage >= 90) return '🟢';
    if (percentage >= 80) return '🟡';
    if (percentage >= 70) return '🟠';
    return '🔴';
  }

  /**
   * Print coverage summary
   */
  printSummary(report) {
    const { summary, coverage } = report;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 COVERAGE ANALYSIS SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    
    if (coverage.overall.lines) {
      console.log(`📈 Overall Coverage:`);
      console.log(`   Lines: ${coverage.overall.lines.pct?.toFixed(1) || 0}% (${coverage.overall.lines.covered}/${coverage.overall.lines.total})`);
      console.log(`   Functions: ${coverage.overall.functions.pct?.toFixed(1) || 0}% (${coverage.overall.functions.covered}/${coverage.overall.functions.total})`);
      console.log(`   Branches: ${coverage.overall.branches.pct?.toFixed(1) || 0}% (${coverage.overall.branches.covered}/${coverage.overall.branches.total})`);
      console.log(`   Statements: ${coverage.overall.statements.pct?.toFixed(1) || 0}% (${coverage.overall.statements.covered}/${coverage.overall.statements.total})`);
    }
    
    console.log(`\n📁 Files: ${summary.source_files} source files, ${summary.test_files} test files`);
    console.log(`🧪 Covered Files: ${coverage.metrics.coveredFiles}/${coverage.metrics.totalFiles}`);
    
    console.log(`\n💡 Recommendations: ${summary.recommendations_count} total`);
    const critical = summary.critical_issues;
    if (critical > 0) {
      console.log(`   🚨 Critical Issues: ${critical}`);
    } else {
      console.log(`   ✅ No critical coverage issues`);
    }
    
    console.log(`\n📋 Reports Generated:`);
    console.log(`   📄 coverage-report.json - Detailed JSON report`);
    console.log(`   📝 COVERAGE-REPORT.md - Human-readable markdown report`);
    console.log(`   📊 coverage/index.html - Interactive HTML report`);
    
    const overallGood = coverage.overall.lines?.pct >= 80;
    console.log(`\n🏆 Coverage Status: ${overallGood ? 'GOOD ✅' : 'NEEDS IMPROVEMENT ❌'}`);
    console.log(`${'='.repeat(80)}\n`);
  }

  /**
   * Main execution method
   */
  async run() {
    console.log(`📊 Starting Enhanced Coverage Analysis`);
    console.log(`📅 ${new Date().toISOString()}`);
    console.log(`${'='.repeat(80)}`);
    
    // Discover files
    const hasTests = this.discoverTestFiles();
    const hasSources = this.discoverSourceFiles();
    
    if (!hasTests) {
      console.log(`❌ No test files found. Cannot run coverage analysis.`);
      process.exit(1);
    }
    
    if (!hasSources) {
      console.log(`⚠️  No source files found. Coverage may be incomplete.`);
    }
    
    // Run coverage
    const success = this.runCoverage();
    
    if (!success) {
      console.log(`❌ Coverage analysis failed.`);
      process.exit(1);
    }
    
    // Analyze results
    const analysis = this.analyzeCoverage();
    
    if (!analysis) {
      console.log(`⚠️  Coverage analysis incomplete.`);
      process.exit(1);
    }
    
    // Generate report
    const report = this.generateReport(analysis);
    this.printSummary(report);
    
    // Return success based on coverage thresholds
    const criticalIssues = report.summary.critical_issues;
    return criticalIssues === 0;
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new CoverageAnalyzer();
  const success = await analyzer.run();
  process.exit(success ? 0 : 1);
}

export { CoverageAnalyzer };

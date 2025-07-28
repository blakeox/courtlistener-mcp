#!/usr/bin/env node

/**
 * Performance Analysis Script
 * Analyzes performance test results and detects regressions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  responseTime: {
    warning: 2000,  // 2 seconds
    critical: 5000  // 5 seconds
  },
  successRate: {
    warning: 95,    // 95%
    critical: 90    // 90%
  }
};

/**
 * Parse performance data from test results
 */
function parsePerformanceData(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Extract performance metrics from test output
    const metrics = {
      averageResponseTime: null,
      successRate: null,
      totalTests: null,
      passedTests: null,
      timestamp: null
    };
    
    // Parse average response time
    const avgTimeMatch = content.match(/Average.*?(\d+)ms/i);
    if (avgTimeMatch) {
      metrics.averageResponseTime = parseInt(avgTimeMatch[1]);
    }
    
    // Parse success rate
    const successRateMatch = content.match(/Success Rate.*?(\d+(?:\.\d+)?)%/i);
    if (successRateMatch) {
      metrics.successRate = parseFloat(successRateMatch[1]);
    }
    
    // Parse test counts
    const testCountMatch = content.match(/(\d+)\/(\d+) tests passed/i);
    if (testCountMatch) {
      metrics.passedTests = parseInt(testCountMatch[1]);
      metrics.totalTests = parseInt(testCountMatch[2]);
      metrics.successRate = (metrics.passedTests / metrics.totalTests) * 100;
    }
    
    // Extract timestamp from filename or content
    const timestampMatch = filePath.match(/(\d{8}-\d{6})/);
    if (timestampMatch) {
      metrics.timestamp = timestampMatch[1];
    }
    
    return metrics;
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Analyze performance directory
 */
function analyzePerformanceDirectory(dirPath) {
  console.log(`🔍 Analyzing performance data in: ${dirPath}`);
  
  if (!fs.existsSync(dirPath)) {
    console.log('❌ Performance data directory not found');
    return false;
  }
  
  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.txt'))
    .sort()
    .reverse(); // Most recent first
  
  if (files.length === 0) {
    console.log('ℹ️  No performance data files found');
    return true;
  }
  
  console.log(`📊 Found ${files.length} performance data file(s)`);
  
  const performanceData = [];
  let hasIssues = false;
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const metrics = parsePerformanceData(filePath);
    
    if (metrics) {
      performanceData.push({ file, ...metrics });
      
      // Check for performance issues
      const issues = checkPerformanceIssues(metrics, file);
      if (issues.length > 0) {
        hasIssues = true;
        issues.forEach(issue => console.log(issue));
      }
    }
  });
  
  // Generate trend analysis if we have multiple data points
  if (performanceData.length > 1) {
    generateTrendAnalysis(performanceData);
  }
  
  return !hasIssues;
}

/**
 * Check for performance issues
 */
function checkPerformanceIssues(metrics, filename) {
  const issues = [];
  
  // Check response time
  if (metrics.averageResponseTime !== null) {
    if (metrics.averageResponseTime > THRESHOLDS.responseTime.critical) {
      issues.push(`🚨 CRITICAL: Response time ${metrics.averageResponseTime}ms exceeds critical threshold (${THRESHOLDS.responseTime.critical}ms) in ${filename}`);
    } else if (metrics.averageResponseTime > THRESHOLDS.responseTime.warning) {
      issues.push(`⚠️  WARNING: Response time ${metrics.averageResponseTime}ms exceeds warning threshold (${THRESHOLDS.responseTime.warning}ms) in ${filename}`);
    }
  }
  
  // Check success rate
  if (metrics.successRate !== null) {
    if (metrics.successRate < THRESHOLDS.successRate.critical) {
      issues.push(`🚨 CRITICAL: Success rate ${metrics.successRate}% below critical threshold (${THRESHOLDS.successRate.critical}%) in ${filename}`);
    } else if (metrics.successRate < THRESHOLDS.successRate.warning) {
      issues.push(`⚠️  WARNING: Success rate ${metrics.successRate}% below warning threshold (${THRESHOLDS.successRate.warning}%) in ${filename}`);
    }
  }
  
  return issues;
}

/**
 * Generate trend analysis
 */
function generateTrendAnalysis(performanceData) {
  console.log('\n📈 Performance Trend Analysis:');
  
  // Sort by timestamp (most recent first)
  const sortedData = performanceData.sort((a, b) => {
    if (!a.timestamp || !b.timestamp) return 0;
    return b.timestamp.localeCompare(a.timestamp);
  });
  
  if (sortedData.length >= 2) {
    const latest = sortedData[0];
    const previous = sortedData[1];
    
    // Response time trend
    if (latest.averageResponseTime && previous.averageResponseTime) {
      const responseTimeDiff = latest.averageResponseTime - previous.averageResponseTime;
      const responseTimePercent = ((responseTimeDiff / previous.averageResponseTime) * 100).toFixed(1);
      
      if (responseTimeDiff > 0) {
        console.log(`📈 Response time increased by ${responseTimeDiff}ms (${responseTimePercent}%)`);
        if (Math.abs(parseFloat(responseTimePercent)) > 20) {
          console.log(`⚠️  Significant response time change detected!`);
        }
      } else {
        console.log(`📉 Response time improved by ${Math.abs(responseTimeDiff)}ms (${Math.abs(parseFloat(responseTimePercent))}%)`);
      }
    }
    
    // Success rate trend
    if (latest.successRate && previous.successRate) {
      const successRateDiff = latest.successRate - previous.successRate;
      
      if (successRateDiff < 0) {
        console.log(`📉 Success rate decreased by ${Math.abs(successRateDiff).toFixed(1)}%`);
        if (Math.abs(successRateDiff) > 5) {
          console.log(`⚠️  Significant success rate decline detected!`);
        }
      } else if (successRateDiff > 0) {
        console.log(`📈 Success rate improved by ${successRateDiff.toFixed(1)}%`);
      } else {
        console.log(`📊 Success rate unchanged (${latest.successRate}%)`);
      }
    }
  }
  
  // Summary of recent performance
  console.log('\n📋 Recent Performance Summary:');
  sortedData.slice(0, 5).forEach((data, index) => {
    const age = index === 0 ? 'Latest' : `${index} run(s) ago`;
    console.log(`   ${age}: ${data.averageResponseTime || 'N/A'}ms avg, ${data.successRate || 'N/A'}% success (${data.file})`);
  });
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node analyze-performance.js <performance-data-directory>');
    console.log('Example: node analyze-performance.js performance-data/');
    process.exit(1);
  }
  
  const performanceDir = args[0];
  const absolutePath = path.isAbsolute(performanceDir) ? performanceDir : path.join(process.cwd(), performanceDir);
  
  console.log('🚀 Legal MCP Server - Performance Analysis');
  console.log('==========================================\n');
  
  const success = analyzePerformanceDirectory(absolutePath);
  
  console.log('\n📊 Analysis Complete');
  
  if (success) {
    console.log('✅ No critical performance issues detected');
    process.exit(0);
  } else {
    console.log('❌ Performance issues detected - review the alerts above');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { analyzePerformanceDirectory, parsePerformanceData, checkPerformanceIssues };

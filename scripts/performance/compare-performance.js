#!/usr/bin/env node

/**
 * Performance Comparison Script
 * Compares current performance results with baseline
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse performance metrics from file content
 */
function parseMetrics(content) {
  const metrics = {};
  
  // Extract various performance metrics
  const patterns = {
    averageTime: /Average.*?(\d+)ms/i,
    minTime: /Min.*?(\d+)ms/i,
    maxTime: /Max.*?(\d+)ms/i,
    successRate: /Success Rate.*?(\d+(?:\.\d+)?)%/i,
    requestsTotal: /requests_total.*?(\d+)/i,
    cacheHits: /cache_hits.*?(\d+)/i
  };
  
  Object.entries(patterns).forEach(([key, pattern]) => {
    const match = content.match(pattern);
    if (match) {
      metrics[key] = key === 'successRate' ? parseFloat(match[1]) : parseInt(match[1]);
    }
  });
  
  return metrics;
}

/**
 * Compare two sets of metrics
 */
function compareMetrics(baseline, current) {
  const comparison = {
    improved: [],
    degraded: [],
    unchanged: [],
    summary: {}
  };
  
  // Define what constitutes improvement for each metric
  const improvementLogic = {
    averageTime: (base, curr) => curr < base,
    minTime: (base, curr) => curr < base,
    maxTime: (base, curr) => curr < base,
    successRate: (base, curr) => curr > base,
    requestsTotal: (base, curr) => curr >= base,
    cacheHits: (base, curr) => curr >= base
  };
  
  Object.keys(baseline).forEach(metric => {
    if (current[metric] !== undefined) {
      const baseValue = baseline[metric];
      const currValue = current[metric];
      const diff = currValue - baseValue;
      const percentChange = ((diff / baseValue) * 100).toFixed(1);
      
      const change = {
        metric,
        baseline: baseValue,
        current: currValue,
        difference: diff,
        percentChange: parseFloat(percentChange)
      };
      
      // Determine if this is an improvement, degradation, or no change
      if (Math.abs(diff) < 0.01) {
        comparison.unchanged.push(change);
      } else if (improvementLogic[metric] && improvementLogic[metric](baseValue, currValue)) {
        comparison.improved.push(change);
      } else {
        comparison.degraded.push(change);
      }
      
      comparison.summary[metric] = change;
    }
  });
  
  return comparison;
}

/**
 * Generate comparison report
 */
function generateReport(comparison) {
  console.log('📊 Performance Comparison Report');
  console.log('='.repeat(50));
  
  // Summary statistics
  const totalMetrics = Object.keys(comparison.summary).length;
  const improved = comparison.improved.length;
  const degraded = comparison.degraded.length;
  const unchanged = comparison.unchanged.length;
  
  console.log(`\n📈 Summary:`);
  console.log(`   Total metrics compared: ${totalMetrics}`);
  console.log(`   Improved: ${improved}`);
  console.log(`   Degraded: ${degraded}`);
  console.log(`   Unchanged: ${unchanged}`);
  
  // Detailed results
  if (comparison.improved.length > 0) {
    console.log(`\n✅ Improved Metrics:`);
    comparison.improved.forEach(change => {
      const direction = change.difference < 0 ? 'decreased' : 'increased';
      const unit = change.metric.includes('Time') ? 'ms' : 
                   change.metric === 'successRate' ? '%' : '';
      
      console.log(`   📈 ${change.metric}: ${change.baseline}${unit} → ${change.current}${unit} (${direction} by ${Math.abs(change.percentChange)}%)`);
    });
  }
  
  if (comparison.degraded.length > 0) {
    console.log(`\n❌ Degraded Metrics:`);
    comparison.degraded.forEach(change => {
      const direction = change.difference < 0 ? 'decreased' : 'increased';
      const unit = change.metric.includes('Time') ? 'ms' : 
                   change.metric === 'successRate' ? '%' : '';
      
      console.log(`   📉 ${change.metric}: ${change.baseline}${unit} → ${change.current}${unit} (${direction} by ${Math.abs(change.percentChange)}%)`);
    });
  }
  
  if (comparison.unchanged.length > 0) {
    console.log(`\n📊 Unchanged Metrics:`);
    comparison.unchanged.forEach(change => {
      const unit = change.metric.includes('Time') ? 'ms' : 
                   change.metric === 'successRate' ? '%' : '';
      console.log(`   ➡️  ${change.metric}: ${change.current}${unit} (no significant change)`);
    });
  }
  
  // Performance grade
  const degradationScore = comparison.degraded.reduce((score, change) => {
    // Weight critical metrics more heavily
    const weight = change.metric === 'averageTime' || change.metric === 'successRate' ? 2 : 1;
    return score + (Math.abs(change.percentChange) * weight);
  }, 0);
  
  const improvementScore = comparison.improved.reduce((score, change) => {
    const weight = change.metric === 'averageTime' || change.metric === 'successRate' ? 2 : 1;
    return score + (Math.abs(change.percentChange) * weight);
  }, 0);
  
  console.log(`\n🎯 Performance Assessment:`);
  
  if (degradationScore > 20) {
    console.log(`   🚨 SIGNIFICANT REGRESSION DETECTED`);
    console.log(`   Performance has significantly degraded. Review changes immediately.`);
    return false;
  } else if (degradationScore > 10) {
    console.log(`   ⚠️  MODERATE REGRESSION`);
    console.log(`   Performance has moderately degraded. Consider investigation.`);
    return false;
  } else if (improvementScore > degradationScore) {
    console.log(`   ✅ PERFORMANCE IMPROVED`);
    console.log(`   Overall performance has improved compared to baseline.`);
    return true;
  } else {
    console.log(`   📊 PERFORMANCE STABLE`);
    console.log(`   Performance is stable compared to baseline.`);
    return true;
  }
}

/**
 * Main comparison function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node compare-performance.js <baseline-file> <current-file>');
    console.log('Example: node compare-performance.js baseline.txt current-results.txt');
    process.exit(1);
  }
  
  const baselinePath = args[0];
  const currentPath = args[1];
  
  console.log('🚀 Legal MCP Server - Performance Comparison');
  console.log('============================================\n');
  
  // Read and parse files
  let baselineContent, currentContent;
  
  try {
    baselineContent = fs.readFileSync(baselinePath, 'utf8');
    console.log(`📋 Baseline: ${baselinePath}`);
  } catch (error) {
    console.error(`❌ Error reading baseline file: ${error.message}`);
    process.exit(1);
  }
  
  try {
    currentContent = fs.readFileSync(currentPath, 'utf8');
    console.log(`📋 Current: ${currentPath}`);
  } catch (error) {
    console.error(`❌ Error reading current file: ${error.message}`);
    process.exit(1);
  }
  
  // Parse metrics from both files
  const baselineMetrics = parseMetrics(baselineContent);
  const currentMetrics = parseMetrics(currentContent);
  
  console.log(`\n🔍 Parsed ${Object.keys(baselineMetrics).length} baseline metrics`);
  console.log(`🔍 Parsed ${Object.keys(currentMetrics).length} current metrics`);
  
  if (Object.keys(baselineMetrics).length === 0) {
    console.log('⚠️  No metrics found in baseline file');
    process.exit(1);
  }
  
  if (Object.keys(currentMetrics).length === 0) {
    console.log('⚠️  No metrics found in current file');
    process.exit(1);
  }
  
  // Compare metrics
  const comparison = compareMetrics(baselineMetrics, currentMetrics);
  const success = generateReport(comparison);
  
  // Save comparison results
  const reportPath = path.join(process.cwd(), 'performance-comparison-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    baselineFile: baselinePath,
    currentFile: currentPath,
    comparison,
    success
  }, null, 2));
  
  console.log(`\n📄 Detailed report saved: ${reportPath}`);
  
  process.exit(success ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { parseMetrics, compareMetrics, generateReport };

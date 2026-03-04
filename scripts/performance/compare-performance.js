#!/usr/bin/env node

/**
 * Performance Comparison Script
 * Compares current performance results with baseline
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DEFAULT_THRESHOLDS = {
  p95: { warnPct: 10, failPct: 20 },
  throughput: { warnPct: 10, failPct: 20 },
  errorRate: { warnAbs: 0.5, failAbs: 1.0 },
  successRate: { warnAbs: 1.0, failAbs: 2.0 },
};

const DEFAULT_ENDPOINT_CLASS_THRESHOLDS = {
  mcp: {
    p95: { warnPct: 12, failPct: 25 },
    throughput: { warnPct: 10, failPct: 20 },
    errorRate: { warnAbs: 0.5, failAbs: 1.0 },
  },
  api: {
    p95: { warnPct: 15, failPct: 30 },
    throughput: { warnPct: 12, failPct: 25 },
    errorRate: { warnAbs: 1.0, failAbs: 2.0 },
  },
  auth: {
    p95: { warnPct: 20, failPct: 35 },
    throughput: { warnPct: 15, failPct: 30 },
    errorRate: { warnAbs: 1.5, failAbs: 3.0 },
  },
};

const DEFAULT_SCENARIO_CLASS_MAP = {
  mcp_initialize: 'mcp',
  mcp_tools_list: 'mcp',
  api_session_get: 'api',
  api_keys_get: 'api',
  auth_signup_limiter: 'auth',
  auth_login_limiter: 'auth',
};

function sanitizeLabel(value, fallback) {
  return String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
}

function getCommitShaLabel() {
  const envSha = process.env.PERF_COMMIT_SHA || process.env.GITHUB_SHA;
  if (envSha) return sanitizeLabel(envSha.slice(0, 12), 'unknown-sha');
  try {
    return sanitizeLabel(execSync('git rev-parse --short=12 HEAD', { encoding: 'utf8' }), 'unknown-sha');
  } catch {
    return 'unknown-sha';
  }
}

function getRuntimeModeLabel() {
  return sanitizeLabel(
    process.env.PERF_RUNTIME_MODE || process.env.MCP_RUNTIME_MODE || process.env.NODE_ENV,
    'default'
  );
}

/**
 * Parse performance metrics from file content
 */
function parseMetrics(content, filePath = '') {
  const fileExt = path.extname(filePath).toLowerCase();
  if (fileExt === '.json') {
    try {
      const parsed = JSON.parse(content);
      const jsonMetrics = parseJsonMetrics(parsed);
      if (Object.keys(jsonMetrics).length > 0) return jsonMetrics;
    } catch {
      // Fall back to text parsing below.
    }
  }

  const metrics = {};

  // Extract various performance metrics
  const patterns = {
    averageTime: /Average(?:\s+\w+)?(?:\s+Time)?[^0-9]*(\d+(?:\.\d+)?)\s*ms/i,
    minTime: /\bMin(?:imum)?(?:\s+Time)?[^0-9]*(\d+(?:\.\d+)?)\s*ms/i,
    maxTime: /\bMax(?:imum)?(?:\s+Time)?[^0-9]*(\d+(?:\.\d+)?)\s*ms/i,
    p95: /\bp95(?:\s+latency)?[^0-9]*(\d+(?:\.\d+)?)\s*ms/i,
    successRate: /Success Rate.*?(\d+(?:\.\d+)?)%/i,
    errorRate: /error(?:\s|_|-)?rate[^0-9]*(\d+(?:\.\d+)?)\s*%/i,
    throughput: /(?:throughput|requests\/s|req\/s|rps)[^0-9]*(\d+(?:\.\d+)?)/i,
    requestsTotal: /requests_total.*?(\d+)/i,
    cacheHits: /cache_hits.*?(\d+)/i,
  };

  Object.entries(patterns).forEach(([key, pattern]) => {
    const match = content.match(pattern);
    if (match) {
      metrics[key] = parseFloat(match[1]);
    }
  });

  if (metrics.successRate !== undefined && metrics.errorRate === undefined) {
    metrics.errorRate = 100 - metrics.successRate;
  }

  return metrics;
}

function parseJsonMetrics(data) {
  const metrics = {};
  let source = data;

  if (data && typeof data === 'object' && data.baseline) {
    source = data.baseline;
  } else if (data && typeof data === 'object' && Array.isArray(data.results) && data.results[0]?.metrics) {
    source = data.results[0].metrics;
  } else if (data && typeof data === 'object' && data.metrics) {
    source = data.metrics;
  }

  if (!source || typeof source !== 'object') return metrics;
  const latencies = Array.isArray(source.request_latency) ? source.request_latency.filter(v => Number.isFinite(v) && v >= 0) : [];

  if (typeof source.startup_time === 'number') metrics.averageTime = source.startup_time;
  if (typeof source.minTime === 'number') metrics.minTime = source.minTime;
  if (typeof source.maxTime === 'number') metrics.maxTime = source.maxTime;
  if (typeof source.throughput === 'number') metrics.throughput = source.throughput;
  if (typeof source.errors === 'number') metrics.errors = source.errors;
  if (typeof source.requestsTotal === 'number') metrics.requestsTotal = source.requestsTotal;

  if (latencies.length > 0) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, value) => acc + value, 0);
    metrics.averageTime = sum / sorted.length;
    metrics.minTime = sorted[0];
    metrics.maxTime = sorted[sorted.length - 1];
    metrics.p95 = percentile(sorted, 95);
    metrics.requestsTotal = metrics.requestsTotal ?? sorted.length + (metrics.errors || 0);
  }

  if (metrics.requestsTotal > 0 && metrics.errors !== undefined) {
    metrics.errorRate = (metrics.errors / metrics.requestsTotal) * 100;
    metrics.successRate = 100 - metrics.errorRate;
  }

  return metrics;
}

function parseJsonObject(content, filePath = '') {
  if (path.extname(filePath).toLowerCase() !== '.json') return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function mergeDeep(base, override) {
  if (!override || typeof override !== 'object') return base;
  const merged = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      merged[key] &&
      typeof merged[key] === 'object' &&
      !Array.isArray(merged[key])
    ) {
      merged[key] = mergeDeep(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  try {
    return mergeDeep(fallback, JSON.parse(raw));
  } catch {
    console.warn(`⚠️  Ignoring invalid ${name} JSON; using defaults.`);
    return fallback;
  }
}

function classifyScenario(name, scenarioClassMap) {
  if (!name) return '';
  if (scenarioClassMap[name]) return scenarioClassMap[name];
  if (name.startsWith('mcp_')) return 'mcp';
  if (name.startsWith('api_')) return 'api';
  if (name.startsWith('auth_')) return 'auth';
  return '';
}

function parseEndpointClassMetrics(content, filePath, scenarioClassMap) {
  const parsed = parseJsonObject(content, filePath);
  if (!parsed || !Array.isArray(parsed.results)) return {};

  const aggregate = {};
  for (const result of parsed.results) {
    const className = classifyScenario(result?.name, scenarioClassMap);
    if (!className) continue;
    const weight = Number(result?.requests || 0);
    const p95 = Number(result?.latency_ms?.p95_ms);
    const throughput = Number(result?.throughput_rps);
    const errorRate = Number(result?.error_rate_pct);
    if (!aggregate[className]) {
      aggregate[className] = {
        weight: 0,
        p95WeightedSum: 0,
        throughputWeightedSum: 0,
        errorRateWeightedSum: 0,
      };
    }
    const item = aggregate[className];
    item.weight += Number.isFinite(weight) && weight > 0 ? weight : 1;
    const normalizedWeight = Number.isFinite(weight) && weight > 0 ? weight : 1;
    if (Number.isFinite(p95)) item.p95WeightedSum += p95 * normalizedWeight;
    if (Number.isFinite(throughput)) item.throughputWeightedSum += throughput * normalizedWeight;
    if (Number.isFinite(errorRate)) item.errorRateWeightedSum += errorRate * normalizedWeight;
  }

  const classMetrics = {};
  for (const [className, stats] of Object.entries(aggregate)) {
    if (stats.weight <= 0) continue;
    classMetrics[className] = {
      p95: Number((stats.p95WeightedSum / stats.weight).toFixed(2)),
      throughput: Number((stats.throughputWeightedSum / stats.weight).toFixed(2)),
      errorRate: Number((stats.errorRateWeightedSum / stats.weight).toFixed(2)),
    };
  }

  return classMetrics;
}

function percentile(sortedValues, percentileValue) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.ceil((percentileValue / 100) * sortedValues.length) - 1);
  return sortedValues[index];
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
    p95: (base, curr) => curr < base,
    successRate: (base, curr) => curr > base,
    errorRate: (base, curr) => curr < base,
    throughput: (base, curr) => curr >= base,
    requestsTotal: (base, curr) => curr >= base,
    cacheHits: (base, curr) => curr >= base
  };

  Object.keys(baseline).forEach(metric => {
    if (current[metric] !== undefined) {
      const baseValue = baseline[metric];
      const currValue = current[metric];
      const diff = currValue - baseValue;
      const percentChange = baseValue === 0 ? 0 : ((diff / baseValue) * 100).toFixed(1);

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
function evaluateThresholds(comparison, thresholds) {
  const warnings = [];
  const failures = [];

  Object.values(comparison.summary).forEach(change => {
    const { metric, baseline, current, percentChange } = change;
    if (metric === 'p95' && current > baseline) {
      if (percentChange >= thresholds.p95.failPct) failures.push(`p95 latency +${percentChange}% (fail ${thresholds.p95.failPct}%)`);
      else if (percentChange >= thresholds.p95.warnPct) warnings.push(`p95 latency +${percentChange}% (warn ${thresholds.p95.warnPct}%)`);
    }

    if (metric === 'throughput' && current < baseline) {
      const dropPct = Math.abs(percentChange);
      if (dropPct >= thresholds.throughput.failPct) failures.push(`throughput -${dropPct}% (fail ${thresholds.throughput.failPct}%)`);
      else if (dropPct >= thresholds.throughput.warnPct) warnings.push(`throughput -${dropPct}% (warn ${thresholds.throughput.warnPct}%)`);
    }

    if (metric === 'errorRate' && current > baseline) {
      const delta = current - baseline;
      if (delta >= thresholds.errorRate.failAbs) failures.push(`error rate +${delta.toFixed(2)}pp (fail ${thresholds.errorRate.failAbs}pp)`);
      else if (delta >= thresholds.errorRate.warnAbs) warnings.push(`error rate +${delta.toFixed(2)}pp (warn ${thresholds.errorRate.warnAbs}pp)`);
    }

    if (metric === 'successRate' && current < baseline) {
      const delta = baseline - current;
      if (delta >= thresholds.successRate.failAbs) failures.push(`success rate -${delta.toFixed(2)}pp (fail ${thresholds.successRate.failAbs}pp)`);
      else if (delta >= thresholds.successRate.warnAbs) warnings.push(`success rate -${delta.toFixed(2)}pp (warn ${thresholds.successRate.warnAbs}pp)`);
    }
  });

  return { warnings, failures };
}

function evaluateEndpointClassThresholds(baselineClasses, currentClasses, classThresholds) {
  const warnings = [];
  const failures = [];
  const evaluatedClasses = [];

  for (const [className, thresholds] of Object.entries(classThresholds)) {
    const baseline = baselineClasses[className];
    const current = currentClasses[className];
    if (!baseline || !current) continue;
    evaluatedClasses.push(className);

    if (Number.isFinite(baseline.p95) && Number.isFinite(current.p95) && current.p95 > baseline.p95) {
      const pctIncrease = baseline.p95 === 0 ? 0 : ((current.p95 - baseline.p95) / baseline.p95) * 100;
      if (pctIncrease >= thresholds.p95.failPct) failures.push(`[${className}] p95 +${pctIncrease.toFixed(1)}% (fail ${thresholds.p95.failPct}%)`);
      else if (pctIncrease >= thresholds.p95.warnPct) warnings.push(`[${className}] p95 +${pctIncrease.toFixed(1)}% (warn ${thresholds.p95.warnPct}%)`);
    }

    if (Number.isFinite(baseline.throughput) && Number.isFinite(current.throughput) && current.throughput < baseline.throughput) {
      const pctDrop = baseline.throughput === 0 ? 0 : ((baseline.throughput - current.throughput) / baseline.throughput) * 100;
      if (pctDrop >= thresholds.throughput.failPct) failures.push(`[${className}] throughput -${pctDrop.toFixed(1)}% (fail ${thresholds.throughput.failPct}%)`);
      else if (pctDrop >= thresholds.throughput.warnPct) warnings.push(`[${className}] throughput -${pctDrop.toFixed(1)}% (warn ${thresholds.throughput.warnPct}%)`);
    }

    if (Number.isFinite(baseline.errorRate) && Number.isFinite(current.errorRate) && current.errorRate > baseline.errorRate) {
      const delta = current.errorRate - baseline.errorRate;
      if (delta >= thresholds.errorRate.failAbs) failures.push(`[${className}] error rate +${delta.toFixed(2)}pp (fail ${thresholds.errorRate.failAbs}pp)`);
      else if (delta >= thresholds.errorRate.warnAbs) warnings.push(`[${className}] error rate +${delta.toFixed(2)}pp (warn ${thresholds.errorRate.warnAbs}pp)`);
    }
  }

  return { warnings, failures, evaluatedClasses };
}

function resolvePolicyMode(options) {
  if (options.warnOnly) return { mode: 'warn', reason: '--warn-only flag' };
  const policyMode = String(options.policyMode || 'auto').toLowerCase();
  if (policyMode === 'warn') return { mode: 'warn', reason: 'PERF_GATE_POLICY_MODE=warn' };
  if (policyMode === 'fail') return { mode: 'fail', reason: 'PERF_GATE_POLICY_MODE=fail' };

  const eventName = process.env.GITHUB_EVENT_NAME || '';
  const ref = process.env.GITHUB_REF || '';
  const baseRef = process.env.GITHUB_BASE_REF || '';

  if (eventName === 'pull_request') return { mode: 'warn', reason: 'auto policy for pull_request' };
  if (/^refs\/heads\/(main|master)$/.test(ref) || /^refs\/heads\/release\//.test(ref) || /^refs\/tags\/v/i.test(ref)) {
    return { mode: 'fail', reason: 'auto policy for main/release' };
  }
  if (/^(main|master|release\/)/.test(baseRef)) return { mode: 'fail', reason: 'auto policy for PR base branch' };

  return { mode: 'warn', reason: 'auto policy default (non-protected branch)' };
}

function generateReport(comparison, options = {}) {
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
      const unit = change.metric.includes('Time') || change.metric === 'p95' ? 'ms' :
                   change.metric === 'successRate' || change.metric === 'errorRate' ? '%' : '';

      console.log(`   📈 ${change.metric}: ${change.baseline}${unit} → ${change.current}${unit} (${direction} by ${Math.abs(change.percentChange)}%)`);
    });
  }

  if (comparison.degraded.length > 0) {
    console.log(`\n❌ Degraded Metrics:`);
    comparison.degraded.forEach(change => {
      const direction = change.difference < 0 ? 'decreased' : 'increased';
      const unit = change.metric.includes('Time') || change.metric === 'p95' ? 'ms' :
                   change.metric === 'successRate' || change.metric === 'errorRate' ? '%' : '';

      console.log(`   📉 ${change.metric}: ${change.baseline}${unit} → ${change.current}${unit} (${direction} by ${Math.abs(change.percentChange)}%)`);
    });
  }

  if (comparison.unchanged.length > 0) {
    console.log(`\n📊 Unchanged Metrics:`);
    comparison.unchanged.forEach(change => {
      const unit = change.metric.includes('Time') || change.metric === 'p95' ? 'ms' :
                   change.metric === 'successRate' || change.metric === 'errorRate' ? '%' : '';
      console.log(`   ➡️  ${change.metric}: ${change.current}${unit} (no significant change)`);
    });
  }

  const thresholdResult = evaluateThresholds(comparison, options.thresholds || DEFAULT_THRESHOLDS);
  const endpointThresholdResult = evaluateEndpointClassThresholds(
    options.baselineEndpointClasses || {},
    options.currentEndpointClasses || {},
    options.endpointClassThresholds || DEFAULT_ENDPOINT_CLASS_THRESHOLDS
  );
  const policy = resolvePolicyMode(options);

  console.log(`\n🎯 Performance Assessment:`);
  console.log(`   Policy mode: ${policy.mode} (${policy.reason})`);

  if (endpointThresholdResult.evaluatedClasses.length > 0) {
    console.log(`   Endpoint classes evaluated: ${endpointThresholdResult.evaluatedClasses.join(', ')}`);
  }

  const allFailures = [...thresholdResult.failures, ...endpointThresholdResult.failures];
  const allWarnings = [...thresholdResult.warnings, ...endpointThresholdResult.warnings];

  if (allFailures.length > 0) {
    console.log('   🚨 THRESHOLD FAILURES');
    allFailures.forEach(item => console.log(`   - ${item}`));
    if (policy.mode === 'warn') {
      console.log('   ⚠️  warn policy active; continuing without failure.');
      return true;
    }
    return false;
  }

  if (allWarnings.length > 0) {
    console.log('   ⚠️  THRESHOLD WARNINGS');
    allWarnings.forEach(item => console.log(`   - ${item}`));
    return true;
  }

  console.log(`   ✅ WITHIN THRESHOLDS`);
  console.log(`   No threshold-based regressions detected.`);
  return true;
}

function parseArgs(args) {
  const options = {
    warnOnly: false,
    policyMode: process.env.PERF_GATE_POLICY_MODE || 'auto',
    endpointClassThresholds: parseJsonEnv('PERF_GATE_ENDPOINT_CLASS_THRESHOLDS_JSON', DEFAULT_ENDPOINT_CLASS_THRESHOLDS),
    scenarioClassMap: parseJsonEnv('PERF_GATE_SCENARIO_CLASS_MAP_JSON', DEFAULT_SCENARIO_CLASS_MAP),
    thresholds: {
      p95: {
        warnPct: Number(process.env.PERF_GATE_P95_WARN_PCT ?? DEFAULT_THRESHOLDS.p95.warnPct),
        failPct: Number(process.env.PERF_GATE_P95_FAIL_PCT ?? DEFAULT_THRESHOLDS.p95.failPct),
      },
      throughput: {
        warnPct: Number(process.env.PERF_GATE_THROUGHPUT_WARN_DROP_PCT ?? DEFAULT_THRESHOLDS.throughput.warnPct),
        failPct: Number(process.env.PERF_GATE_THROUGHPUT_FAIL_DROP_PCT ?? DEFAULT_THRESHOLDS.throughput.failPct),
      },
      errorRate: {
        warnAbs: Number(process.env.PERF_GATE_ERROR_RATE_WARN_PP ?? DEFAULT_THRESHOLDS.errorRate.warnAbs),
        failAbs: Number(process.env.PERF_GATE_ERROR_RATE_FAIL_PP ?? DEFAULT_THRESHOLDS.errorRate.failAbs),
      },
      successRate: {
        warnAbs: Number(process.env.PERF_GATE_SUCCESS_RATE_WARN_PP ?? DEFAULT_THRESHOLDS.successRate.warnAbs),
        failAbs: Number(process.env.PERF_GATE_SUCCESS_RATE_FAIL_PP ?? DEFAULT_THRESHOLDS.successRate.failAbs),
      },
    },
  };

  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--warn-only') options.warnOnly = true;
    else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--p95-warn-pct') options.thresholds.p95.warnPct = Number(args[++i]);
    else if (arg === '--p95-fail-pct') options.thresholds.p95.failPct = Number(args[++i]);
    else if (arg === '--throughput-warn-drop-pct') options.thresholds.throughput.warnPct = Number(args[++i]);
    else if (arg === '--throughput-fail-drop-pct') options.thresholds.throughput.failPct = Number(args[++i]);
    else if (arg === '--error-rate-warn-pp') options.thresholds.errorRate.warnAbs = Number(args[++i]);
    else if (arg === '--error-rate-fail-pp') options.thresholds.errorRate.failAbs = Number(args[++i]);
    else if (arg === '--success-rate-warn-pp') options.thresholds.successRate.warnAbs = Number(args[++i]);
    else if (arg === '--success-rate-fail-pp') options.thresholds.successRate.failAbs = Number(args[++i]);
    else if (arg === '--policy-mode') options.policyMode = String(args[++i] || options.policyMode).toLowerCase();
    else positionals.push(arg);
  }

  if (positionals.length < 2) {
    printUsage();
    process.exit(1);
  }

  return { baselinePath: positionals[0], currentPath: positionals[1], options };
}

function printUsage() {
  console.log('Usage: node compare-performance.js <baseline-file> <current-file> [options]');
  console.log('Options:');
  console.log('  --warn-only');
  console.log('  --policy-mode <auto|warn|fail>');
  console.log('  --p95-warn-pct <n> --p95-fail-pct <n>');
  console.log('  --throughput-warn-drop-pct <n> --throughput-fail-drop-pct <n>');
  console.log('  --error-rate-warn-pp <n> --error-rate-fail-pp <n>');
  console.log('  --success-rate-warn-pp <n> --success-rate-fail-pp <n>');
  console.log('Environment overrides: PERF_GATE_* variables for CI usage.');
  console.log('  PERF_GATE_POLICY_MODE=auto|warn|fail (default auto: PR warn, main/release fail)');
  console.log('  PERF_GATE_ENDPOINT_CLASS_THRESHOLDS_JSON={"mcp":{"p95":{"warnPct":12,"failPct":25},...}}');
  console.log('  PERF_GATE_SCENARIO_CLASS_MAP_JSON={"mcp_initialize":"mcp","api_session_get":"api",...}');
}

/**
 * Main comparison function
 */
function main() {
  const { baselinePath, currentPath, options } = parseArgs(process.argv.slice(2));
  const artifactLabels = {
    commitSha: getCommitShaLabel(),
    runtimeMode: getRuntimeModeLabel(),
  };

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
  const baselineMetrics = parseMetrics(baselineContent, baselinePath);
  const currentMetrics = parseMetrics(currentContent, currentPath);
  const baselineEndpointClasses = parseEndpointClassMetrics(
    baselineContent,
    baselinePath,
    options.scenarioClassMap || DEFAULT_SCENARIO_CLASS_MAP
  );
  const currentEndpointClasses = parseEndpointClassMetrics(
    currentContent,
    currentPath,
    options.scenarioClassMap || DEFAULT_SCENARIO_CLASS_MAP
  );

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
  const success = generateReport(comparison, {
    ...options,
    baselineEndpointClasses,
    currentEndpointClasses,
  });

  // Save comparison results
  const reportPath = path.join(process.cwd(), 'performance-comparison-report.json');
  const labeledReportPath = path.join(
    process.cwd(),
    `performance-comparison-report-${artifactLabels.runtimeMode}-${artifactLabels.commitSha}.json`
  );
  const reportPayload = {
    timestamp: new Date().toISOString(),
    artifactLabels,
    baselineFile: baselinePath,
    currentFile: currentPath,
    comparison,
    endpointClassComparison: {
      baseline: baselineEndpointClasses,
      current: currentEndpointClasses,
      thresholds: options.endpointClassThresholds,
    },
    success
  };
  fs.writeFileSync(reportPath, JSON.stringify(reportPayload, null, 2));
  if (labeledReportPath !== reportPath) {
    fs.writeFileSync(labeledReportPath, JSON.stringify(reportPayload, null, 2));
  }

  console.log(`\n📄 Detailed report saved: ${reportPath}`);
  if (labeledReportPath !== reportPath) {
    console.log(`🏷️  Labeled report saved: ${labeledReportPath}`);
  }

  process.exit(success ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { parseMetrics, compareMetrics, generateReport };

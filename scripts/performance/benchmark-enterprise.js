#!/usr/bin/env node

/**
 * Performance benchmarking script for Legal MCP Server Enterprise Features
 * Tests the performance impact of enabling different enterprise features
 */

import { performance } from 'perf_hooks';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

function sanitizeLabel(value, fallback) {
  return String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
}

async function getCommitShaLabel() {
  const envSha = process.env.PERF_COMMIT_SHA || process.env.GITHUB_SHA;
  if (envSha) return sanitizeLabel(envSha.slice(0, 12), 'unknown-sha');
  try {
    const { stdout } = await execAsync('git rev-parse --short=12 HEAD');
    return sanitizeLabel(stdout, 'unknown-sha');
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

class PerformanceBenchmark {
  constructor() {
    this.results = [];
    this.baselineMetrics = null;
    this.healthPort = parseInt(process.env.METRICS_PORT || '3001', 10);
    this.healthUrl =
      process.env.BENCHMARK_HEALTH_URL || `http://localhost:${this.healthPort}/health`;
    this.baseFeatureEnv = {
      AUTH_ENABLED: 'false',
      SANITIZATION_ENABLED: 'false',
      AUDIT_ENABLED: 'false',
      COMPRESSION_ENABLED: 'false',
      RATE_LIMIT_ENABLED: 'false',
      CIRCUIT_BREAKER_ENABLED: 'false',
      GRACEFUL_SHUTDOWN_ENABLED: 'false',
    };
  }

  /**
   * Run performance tests for different enterprise feature configurations
   */
  async runBenchmarks() {
    console.log('🚀 Starting Legal MCP Server Enterprise Performance Benchmarks\n');

    // Test configurations
    const configurations = [
      {
        name: 'Baseline (No Enterprise Features)',
        env: {}
      },
      {
        name: 'Authentication Only',
        env: {
          AUTH_ENABLED: 'true',
          AUTH_API_KEYS: 'benchmark-api-key',
          AUTH_ALLOW_ANONYMOUS: 'false'
        }
      },
      {
        name: 'Input Sanitization Only',
        env: {
          SANITIZATION_ENABLED: 'true'
        }
      },
      {
        name: 'Compression Only',
        env: {
          COMPRESSION_ENABLED: 'true'
        }
      },
      {
        name: 'Rate Limiting Only',
        env: {
          RATE_LIMIT_ENABLED: 'true'
        }
      },
      {
        name: 'All Enterprise Features',
        env: {
          AUTH_ENABLED: 'true',
          AUTH_API_KEYS: 'benchmark-api-key',
          AUTH_ALLOW_ANONYMOUS: 'false',
          SANITIZATION_ENABLED: 'true',
          AUDIT_ENABLED: 'true',
          COMPRESSION_ENABLED: 'true',
          RATE_LIMIT_ENABLED: 'true',
          CIRCUIT_BREAKER_ENABLED: 'true',
          GRACEFUL_SHUTDOWN_ENABLED: 'true'
        }
      }
    ];

    for (const config of configurations) {
      console.log(`📊 Testing: ${config.name}`);
      const metrics = await this.benchmarkConfiguration(config);
      this.results.push({ config: config.name, metrics });
      
      if (config.name === 'Baseline (No Enterprise Features)') {
        this.baselineMetrics = metrics;
      }
      
      console.log(`✅ Completed: ${config.name}\n`);
    }

    await this.generateReport();
  }

  /**
   * Benchmark a specific configuration
   */
  async benchmarkConfiguration(config) {
    const metrics = {
      startup_time: 0,
      memory_usage: 0,
      request_latency: [],
      throughput: 0,
      cpu_usage: 0,
      errors: 0
    };

    try {
      // Measure startup time
      const startupStart = performance.now();
      await this.startServer(config.env);
      await this.waitForServer();
      metrics.startup_time = performance.now() - startupStart;

      // Measure memory usage
      metrics.memory_usage = await this.measureMemoryUsage();

      // Run load tests
      const loadTestResults = await this.runLoadTests();
      metrics.request_latency = loadTestResults.latencies;
      metrics.throughput = loadTestResults.throughput;
      metrics.errors = loadTestResults.errors;

      // Measure CPU usage
      metrics.cpu_usage = await this.measureCpuUsage();

      await this.stopServer();
    } catch (error) {
      console.error(`❌ Error benchmarking ${config.name}:`, error.message);
      metrics.errors++;
    }

    return metrics;
  }

  /**
   * Start the server with specific environment variables
   */
  async startServer(envVars) {
    const command = 'node dist/index.js';
    const env = {
      ...process.env,
      ...this.baseFeatureEnv,
      METRICS_ENABLED: 'true',
      METRICS_PORT: String(this.healthPort),
      ...envVars
    };
    
    // Start server in background
    this.serverProcess = exec(command, { env });
    
    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Wait for server to be ready
   */
  async waitForServer() {
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(this.healthUrl);
        if (response.ok) {
          return;
        }
      } catch (error) {
        // Server not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    throw new Error('Server failed to start within timeout');
  }

  /**
   * Stop the server
   */
  async stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Measure memory usage of the server process
   */
  async measureMemoryUsage() {
    try {
      const { stdout } = await execAsync('ps -eo pid,rss,comm | grep node');
      const lines = stdout.trim().split('\n');
      let totalMemory = 0;

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          totalMemory += parseInt(parts[1]) * 1024; // Convert KB to bytes
        }
      }

      return totalMemory;
    } catch (error) {
      console.warn('Could not measure memory usage:', error.message);
      return 0;
    }
  }

  /**
   * Measure CPU usage
   */
  async measureCpuUsage() {
    try {
      const { stdout } = await execAsync('ps -eo pid,pcpu,comm | grep node');
      const lines = stdout.trim().split('\n');
      let totalCpu = 0;

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          totalCpu += parseFloat(parts[1]);
        }
      }

      return totalCpu;
    } catch (error) {
      console.warn('Could not measure CPU usage:', error.message);
      return 0;
    }
  }

  /**
   * Run load tests against the server
   */
  async runLoadTests() {
    const results = {
      latencies: [],
      throughput: 0,
      errors: 0
    };

    const testDuration = 30000; // 30 seconds
    const concurrentRequests = 10;
    const startTime = Date.now();
    let requestCount = 0;

    console.log('  🔄 Running load tests...');

    while (Date.now() - startTime < testDuration) {
      const promises = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(this.makeTestRequest());
      }

      try {
        const latencies = await Promise.all(promises);
        results.latencies.push(...latencies.filter(l => l > 0));
        requestCount += concurrentRequests;
      } catch (error) {
        results.errors++;
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    results.throughput = requestCount / (testDuration / 1000); // requests per second
    
    console.log(`    📈 Requests: ${requestCount}, Errors: ${results.errors}`);
    
    return results;
  }

  /**
   * Make a test request to the server
   */
  async makeTestRequest() {
    const start = performance.now();
    
    try {
      const response = await fetch(this.healthUrl, {
        timeout: 5000
      });
      
      if (!response.ok) {
        return -1; // Error
      }
      
      return performance.now() - start;
    } catch (error) {
      return -1; // Error
    }
  }

  /**
   * Generate comprehensive performance report
   */
  async generateReport() {
    console.log('\n📊 PERFORMANCE BENCHMARK RESULTS');
    console.log('=====================================\n');

    const artifactLabels = {
      commitSha: await getCommitShaLabel(),
      runtimeMode: getRuntimeModeLabel(),
    };
    const report = {
      timestamp: new Date().toISOString(),
      artifactLabels,
      baseline: this.baselineMetrics,
      results: this.results,
      analysis: this.analyzeResults()
    };

    // Console output
    for (const result of this.results) {
      console.log(`🔍 ${result.config}`);
      console.log(`   Startup Time: ${result.metrics.startup_time.toFixed(2)}ms`);
      console.log(`   Memory Usage: ${(result.metrics.memory_usage / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Avg Latency: ${this.calculateAverageLatency(result.metrics.request_latency).toFixed(2)}ms`);
      console.log(`   Throughput: ${result.metrics.throughput.toFixed(2)} req/s`);
      console.log(`   CPU Usage: ${result.metrics.cpu_usage.toFixed(2)}%`);
      console.log(`   Errors: ${result.metrics.errors}\n`);
    }

    // Performance impact analysis
    console.log('📈 PERFORMANCE IMPACT ANALYSIS');
    console.log('===============================\n');
    
    if (this.baselineMetrics) {
      for (const result of this.results) {
        if (result.config !== 'Baseline (No Enterprise Features)') {
          const impact = this.calculateImpact(result.metrics, this.baselineMetrics);
          console.log(`${result.config}:`);
          console.log(`   Startup overhead: ${impact.startup_time > 0 ? '+' : ''}${impact.startup_time.toFixed(1)}%`);
          console.log(`   Memory overhead: ${impact.memory_usage > 0 ? '+' : ''}${impact.memory_usage.toFixed(1)}%`);
          console.log(`   Latency impact: ${impact.request_latency > 0 ? '+' : ''}${impact.request_latency.toFixed(1)}%`);
          console.log(`   Throughput impact: ${impact.throughput > 0 ? '+' : ''}${impact.throughput.toFixed(1)}%\n`);
        }
      }
    }

    // Save detailed report
    const reportPath = 'performance-benchmark-report.json';
    const labeledReportPath = path.join(
      process.cwd(),
      `performance-benchmark-report-${artifactLabels.runtimeMode}-${artifactLabels.commitSha}.json`
    );
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    if (labeledReportPath !== path.join(process.cwd(), reportPath)) {
      await fs.writeFile(labeledReportPath, JSON.stringify(report, null, 2));
    }

    console.log('💾 Detailed report saved to: performance-benchmark-report.json');
    if (labeledReportPath !== path.join(process.cwd(), reportPath)) {
      console.log(`🏷️  Labeled report saved to: ${labeledReportPath}`);
    }
    console.log('\n🎯 RECOMMENDATIONS');
    console.log('==================');
    this.generateRecommendations();
  }

  /**
   * Calculate average latency from array of latencies
   */
  calculateAverageLatency(latencies) {
    if (latencies.length === 0) return 0;
    const validLatencies = latencies.filter(l => l > 0);
    return validLatencies.reduce((sum, l) => sum + l, 0) / validLatencies.length;
  }

  /**
   * Calculate performance impact compared to baseline
   */
  calculateImpact(metrics, baseline) {
    return {
      startup_time: ((metrics.startup_time - baseline.startup_time) / baseline.startup_time) * 100,
      memory_usage: ((metrics.memory_usage - baseline.memory_usage) / baseline.memory_usage) * 100,
      request_latency: ((this.calculateAverageLatency(metrics.request_latency) - this.calculateAverageLatency(baseline.request_latency)) / this.calculateAverageLatency(baseline.request_latency)) * 100,
      throughput: ((metrics.throughput - baseline.throughput) / baseline.throughput) * 100
    };
  }

  /**
   * Analyze results and generate insights
   */
  analyzeResults() {
    // Implementation for detailed analysis
    return {
      most_efficient: 'TBD based on results',
      highest_overhead: 'TBD based on results',
      recommended_config: 'TBD based on results'
    };
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations() {
    console.log('• For development: Enable only authentication and graceful shutdown');
    console.log('• For staging: Enable authentication, sanitization, and compression');
    console.log('• For production: Enable all features except debug logging');
    console.log('• Monitor memory usage when enabling compression with large responses');
    console.log('• Rate limiting has minimal performance impact but high security value');
    console.log('• Circuit breakers add resilience with negligible performance cost');
  }
}

// Main execution
async function main() {
  const benchmark = new PerformanceBenchmark();
  
  try {
    await benchmark.runBenchmarks();
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

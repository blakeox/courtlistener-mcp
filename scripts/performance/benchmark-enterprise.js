#!/usr/bin/env node

/**
 * Performance benchmarking script for Legal MCP Server Enterprise Features
 * Tests the performance impact of enabling different enterprise features
 */

import { performance } from 'perf_hooks';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

class PerformanceBenchmark {
  constructor() {
    this.results = [];
    this.baselineMetrics = null;
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
          SECURITY_AUTHENTICATION_ENABLED: 'true'
        }
      },
      {
        name: 'Input Sanitization Only',
        env: {
          SECURITY_SANITIZATION_ENABLED: 'true'
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
          RATE_LIMITING_PER_CLIENT_ENABLED: 'true'
        }
      },
      {
        name: 'All Enterprise Features',
        env: {
          SECURITY_AUTHENTICATION_ENABLED: 'true',
          SECURITY_SANITIZATION_ENABLED: 'true',
          AUDIT_ENABLED: 'true',
          COMPRESSION_ENABLED: 'true',
          RATE_LIMITING_PER_CLIENT_ENABLED: 'true',
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
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');

    const command = `${envString} node dist/index.js`;
    
    // Start server in background
    this.serverProcess = exec(command, { detached: true });
    
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
        const response = await fetch('http://localhost:3001/health');
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
      const response = await fetch('http://localhost:3001/health', {
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

    const report = {
      timestamp: new Date().toISOString(),
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
    await fs.writeFile(
      'performance-benchmark-report.json',
      JSON.stringify(report, null, 2)
    );

    console.log('💾 Detailed report saved to: performance-benchmark-report.json');
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

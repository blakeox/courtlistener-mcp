/**
 * Enhanced Error Handling Demo
 * Demonstrates the comprehensive error handling system with Express integration
 */

import { Logger } from './infrastructure/logger.js';
import { MetricsCollector } from './infrastructure/metrics.js';
import { CircuitBreaker } from './infrastructure/circuit-breaker.js';
import { EnhancedExpressServer } from './infrastructure/enhanced-express-server.js';

const config = {
  log: {
    level: 'info' as const,
    format: 'json' as const,
    enabled: true,
  },
};

async function runEnhancedDemo() {
  console.log('🚀 Starting Enhanced Error Handling Demo...\n');

  // Initialize core services
  const logger = new Logger(config.log, 'EnhancedDemo');
  const metrics = new MetricsCollector(logger);
  const circuitBreaker = new CircuitBreaker(
    'demo-service',
    {
      enabled: true,
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 5000,
      resetTimeout: 60000,
      monitoringWindow: 60000,
    },
    logger,
  );

  // Create enhanced Express server
  const server = new EnhancedExpressServer(logger, metrics, circuitBreaker, {
    port: 3001,
    enableErrorReporting: true,
    enableDocumentation: true,
    enableHealthChecks: true,
    enableMetrics: true,
    errorHandling: {
      enableStackTrace: true,
      enableDetailedErrors: true,
      alertThresholds: {
        criticalErrorsPerMinute: 3,
        highErrorsPerMinute: 10,
        totalErrorsPerMinute: 50,
      },
    },
  });

  try {
    // Start the server
    await server.start();

    console.log('✅ Enhanced Express Server started successfully!');
    console.log('🌐 Available endpoints:');
    console.log('   📋 Root: http://localhost:3001/');
    console.log('   📖 Documentation: http://localhost:3001/docs');
    console.log('   💖 Health Check: http://localhost:3001/health');
    console.log('   📊 Metrics: http://localhost:3001/metrics');
    console.log('   🛠️  Admin Dashboard: http://localhost:3001/admin');

    console.log('\n🎯 Demo API Endpoints:');
    console.log('   ✅ Success: http://localhost:3001/api/success');
    console.log('   🔍 Validation: POST http://localhost:3001/api/validate');
    console.log('   🔐 Protected: http://localhost:3001/api/protected');
    console.log('   ❓ Not Found: http://localhost:3001/api/missing/123');
    console.log('   ⏱️  Rate Limited: http://localhost:3001/api/rate-limited');
    console.log('   🔧 Circuit Breaker: http://localhost:3001/api/circuit-breaker');
    console.log('   💥 Error Demo: http://localhost:3001/api/error');

    console.log('\n📊 Error Reporting Endpoints:');
    console.log('   📈 Error Reports: http://localhost:3001/admin/errors');
    console.log('   📉 Error Trends: http://localhost:3001/admin/errors/trends');
    console.log('   📋 Error Metrics: http://localhost:3001/admin/errors/metrics');
    console.log('   💾 Export Reports: http://localhost:3001/admin/errors/export');

    console.log('\n🧪 Test the error handling by making requests to the demo endpoints:');
    console.log('');
    console.log('# Test validation error:');
    console.log('curl -X POST http://localhost:3001/api/validate \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{"name": "x", "email": "invalid"}\'');
    console.log('');
    console.log('# Test authentication error:');
    console.log('curl http://localhost:3001/api/protected');
    console.log('');
    console.log('# Test not found error:');
    console.log('curl http://localhost:3001/api/missing/999');
    console.log('');
    console.log('# Test internal error:');
    console.log('curl http://localhost:3001/api/error');
    console.log('');
    console.log('# View error reports:');
    console.log('curl http://localhost:3001/admin/errors');
    console.log('');

    // Demonstrate error reporting
    setTimeout(async () => {
      console.log('🔬 Demonstrating error reporting...');

      try {
        // Simulate some errors for demonstration
        const { ValidationError, AuthenticationError } =
          await import('./infrastructure/error-types.js');
        const errorHandler = server.getErrorHandler();
        const services = errorHandler.getServices();

        // Report some demo errors
        const demoErrors = [
          new ValidationError('Demo validation error', [
            { field: 'email', message: 'Invalid email format', value: 'invalid-email' },
          ]),
          new AuthenticationError('Demo authentication error'),
          new ValidationError('Another validation error', [
            { field: 'age', message: 'Age must be positive', value: -5 },
          ]),
        ];

        demoErrors.forEach((error) => {
          services.reporting.reportError(error);
        });

        console.log('📊 Generated demo error reports. Check http://localhost:3001/admin/errors');
      } catch (error) {
        console.warn('⚠️  Error demonstration failed:', error);
      }
    }, 2000);

    // Graceful shutdown handling
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down Enhanced Express Server...');
      await server.stop();
      console.log('✅ Server stopped gracefully');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down Enhanced Express Server...');
      await server.stop();
      console.log('✅ Server stopped gracefully');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start enhanced demo', error as Error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runEnhancedDemo().catch(console.error);
}

export { runEnhancedDemo };

# Enterprise Test Suite Documentation

## Overview

This comprehensive test suite validates all enterprise middleware features of the Legal MCP Server. The tests are organized into logical folders for easy navigation and maintenance.

## Test Structure

```
test/
├── utils/
│   └── test-helpers.js          # Shared testing utilities and mocks
├── enterprise/
│   ├── middleware/              # Individual middleware component tests
│   │   ├── test-authentication.js
│   │   ├── test-sanitization.js
│   │   ├── test-rate-limiting.js
│   │   ├── test-audit-logging.js
│   │   ├── test-compression.js
│   │   ├── test-circuit-breaker.js
│   │   └── test-graceful-shutdown.js
│   ├── integration/             # Cross-component integration tests
│   │   └── test-middleware-integration.js
│   └── performance/             # Performance and scalability tests
│       └── test-performance.js
└── run-enterprise-tests.js      # Comprehensive test runner
```

## Running Tests

### Quick Start
```bash
# Run all enterprise tests with detailed reporting
npm run test:enterprise:full

# Run all tests (including enterprise)
npm run test:all
```

### Individual Test Categories
```bash
# Middleware tests
npm run test:enterprise:middleware

# Individual middleware components
npm run test:enterprise:auth
npm run test:enterprise:sanitization
npm run test:enterprise:rate-limiting
npm run test:enterprise:audit
npm run test:enterprise:compression
npm run test:enterprise:circuit-breaker
npm run test:enterprise:graceful-shutdown

# Integration tests
npm run test:enterprise:integration

# Performance tests
npm run test:enterprise:performance
```

### Manual Test Execution
```bash
# Run specific test files directly
node test/enterprise/middleware/test-authentication.js
node test/enterprise/integration/test-middleware-integration.js
node test/enterprise/performance/test-performance.js

# Run the comprehensive test suite
node test/run-enterprise-tests.js
```

## Test Coverage

### 🛡️ Middleware Components (7 test suites)

#### Authentication & Authorization
- **File**: `test/enterprise/middleware/test-authentication.js`
- **Coverage**: API key validation, client identification, security features
- **Key Tests**:
  - Valid API key authentication
  - Invalid/missing API key handling
  - Client identification and tracking
  - Rate limit integration
  - Security event logging
  - Performance under load

#### Input Sanitization & Security
- **File**: `test/enterprise/middleware/test-sanitization.js`
- **Coverage**: XSS protection, SQL injection prevention, malicious code blocking
- **Key Tests**:
  - XSS attack prevention
  - SQL injection blocking
  - Script execution prevention
  - Schema validation
  - Configuration customization
  - Performance impact assessment

#### Rate Limiting & Throttling
- **File**: `test/enterprise/middleware/test-rate-limiting.js`
- **Coverage**: Per-client limits, burst handling, penalties, whitelisting
- **Key Tests**:
  - Basic rate limiting enforcement
  - Burst request handling
  - Client-specific configurations
  - Penalty system for violations
  - Whitelist functionality
  - Sliding window algorithm
  - Memory usage optimization

#### Audit Logging & Compliance
- **File**: `test/enterprise/middleware/test-audit-logging.js`
- **Coverage**: Request/response tracking, security events, compliance features
- **Key Tests**:
  - Request/response logging
  - Security event tracking
  - Compliance data export
  - Log rotation and cleanup
  - Performance optimization
  - Storage efficiency

#### Response Compression
- **File**: `test/enterprise/middleware/test-compression.js`
- **Coverage**: Gzip/Brotli compression, threshold handling, optimization
- **Key Tests**:
  - Gzip compression functionality
  - Brotli compression support
  - Size threshold handling
  - Content-type filtering
  - Performance benchmarking
  - Memory usage validation

#### Circuit Breaker Pattern
- **File**: `test/enterprise/middleware/test-circuit-breaker.js`
- **Coverage**: Failure detection, state transitions, recovery scenarios
- **Key Tests**:
  - Failure threshold detection
  - State transitions (Closed → Open → Half-Open)
  - Automatic recovery
  - Manual reset functionality
  - Monitoring and metrics
  - Configuration validation

#### Graceful Shutdown
- **File**: `test/enterprise/middleware/test-graceful-shutdown.js`
- **Coverage**: Request draining, cleanup callbacks, timeout handling
- **Key Tests**:
  - Signal handling (SIGTERM, SIGINT)
  - Active request draining
  - Cleanup callback execution
  - Timeout enforcement
  - Resource cleanup
  - Status monitoring

### 🔗 Integration Tests (1 test suite)

#### Middleware Integration
- **File**: `test/enterprise/integration/test-middleware-integration.js`
- **Coverage**: End-to-end middleware interaction, request processing pipeline
- **Key Tests**:
  - Full request processing pipeline
  - Middleware order and interactions
  - Error propagation between components
  - Performance under realistic load
  - Security event correlation
  - Configuration consistency

### ⚡ Performance Tests (1 test suite)

#### Performance & Scalability
- **File**: `test/enterprise/performance/test-performance.js`
- **Coverage**: Throughput, latency, memory usage, scalability analysis
- **Key Tests**:
  - Baseline performance measurement
  - Concurrent request handling
  - Memory usage profiling
  - Latency distribution analysis
  - Throughput scaling tests
  - Resource utilization monitoring

## Test Reports

### Automated Reporting
The test runner generates comprehensive reports in multiple formats:

- **JSON Report**: `test-output/enterprise-test-report.json`
  - Machine-readable detailed results
  - Error stack traces and metadata
  - Performance metrics and timing data

- **Markdown Report**: `test-output/enterprise-test-report.md`
  - Human-readable summary
  - Test suite breakdown
  - Performance insights and recommendations

### Report Contents
- **Summary Statistics**: Total tests, pass/fail rates, duration
- **Category Breakdown**: Results by middleware, integration, performance
- **Detailed Results**: Per-suite results with error details
- **Performance Insights**: Duration analysis and optimization recommendations
- **Coverage Estimates**: Feature coverage by category
- **Recommendations**: Actionable insights for improvement

## Mock Implementations

### Comprehensive Mocking Strategy
All tests use realistic mock implementations that mirror actual functionality:

- **MockLogger**: Captures and validates logging behavior
- **MockRequest/Response**: Simulates HTTP request/response cycles
- **MockDatabase**: Simulates audit log storage
- **MockMetrics**: Tracks performance and usage metrics
- **MockCache**: Simulates caching behavior
- **Performance Profilers**: Measure real resource usage

### Test Data & Fixtures
- **Safe Test Data**: Valid requests and responses
- **Malicious Payloads**: XSS, SQL injection, script injection attempts
- **Performance Datasets**: Various payload sizes and complexity levels
- **Configuration Scenarios**: Different middleware configurations

## Best Practices

### Test Organization
- ✅ **Logical Grouping**: Tests organized by functionality and scope
- ✅ **Clear Naming**: Descriptive test and file names
- ✅ **Modular Design**: Reusable test utilities and helpers
- ✅ **Consistent Structure**: Standardized test format across all files

### Test Quality
- ✅ **Comprehensive Coverage**: Both positive and negative test cases
- ✅ **Edge Case Testing**: Boundary conditions and error scenarios
- ✅ **Performance Validation**: Resource usage and timing checks
- ✅ **Security Testing**: Vulnerability and attack simulation

### Maintenance
- ✅ **Documentation**: Clear test purpose and expected behavior
- ✅ **Mock Realism**: Mocks that accurately represent real components
- ✅ **Independent Tests**: No dependencies between test cases
- ✅ **Cleanup**: Proper resource cleanup after each test

## Troubleshooting

### Common Issues

#### Test Failures
1. **Authentication Tests Failing**
   - Check API key configurations
   - Verify client identification logic
   - Review security event logging

2. **Performance Tests Slow**
   - Increase test timeouts
   - Check system resource availability
   - Review concurrent test execution

3. **Integration Tests Failing**
   - Verify middleware order configuration
   - Check component compatibility
   - Review error propagation logic

#### Running Tests
1. **Module Import Errors**
   - Ensure Node.js version compatibility (ES modules)
   - Check file path references
   - Verify test utilities are available

2. **Permission Issues**
   - Ensure test output directory is writable
   - Check file system permissions
   - Verify log file creation rights

### Debug Mode
Enable verbose logging for detailed test execution information:

```bash
# Set debug environment
export DEBUG=legal-mcp:test
npm run test:enterprise:full

# Or run with Node.js debug flags
node --inspect test/run-enterprise-tests.js
```

## Extending Tests

### Adding New Test Cases
1. **Create Test File**: Follow the naming convention `test-[component].js`
2. **Use Test Helpers**: Import utilities from `test/utils/test-helpers.js`
3. **Follow Structure**: Use consistent test organization and assertions
4. **Update Runner**: Add new tests to the comprehensive test runner

### Custom Test Categories
1. **Create Directory**: Add new category under `test/enterprise/`
2. **Implement Tests**: Follow existing patterns and conventions
3. **Update Scripts**: Add npm scripts for the new category
4. **Document**: Update this documentation with the new tests

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run Enterprise Tests
  run: npm run test:enterprise:full

- name: Upload Test Reports
  uses: actions/upload-artifact@v3
  with:
    name: enterprise-test-reports
    path: test-output/
```

### Test Automation
- **Pre-commit**: Run relevant tests before commits
- **Pull Request**: Full test suite on PR creation
- **Deployment**: Comprehensive testing before production deployment

## Performance Benchmarks

### Expected Performance Metrics
- **Authentication**: < 10ms per request
- **Sanitization**: < 5ms per request  
- **Rate Limiting**: < 2ms per request
- **Compression**: 60-80% size reduction
- **Circuit Breaker**: < 1ms overhead
- **Audit Logging**: < 15ms per request

### Scaling Expectations
- **Concurrent Users**: 1000+ simultaneous connections
- **Request Throughput**: 10,000+ requests per minute
- **Memory Usage**: < 500MB under normal load
- **Response Time**: 95th percentile < 200ms

## Security Testing

### Attack Simulation
- **XSS Attacks**: Multiple vector testing
- **SQL Injection**: Various payload types
- **Code Injection**: Script execution attempts
- **Rate Limit Bypass**: Attack pattern simulation
- **Authentication Bypass**: Token manipulation attempts

### Compliance Validation
- **Audit Trails**: Complete request/response logging
- **Data Retention**: Configurable retention policies
- **Access Controls**: Authentication and authorization
- **Security Events**: Real-time threat detection

---

## Quick Reference

### Essential Commands
```bash
# Full test suite
npm run test:enterprise:full

# Security-focused tests  
npm run test:enterprise:auth
npm run test:enterprise:sanitization

# Performance validation
npm run test:enterprise:performance

# Integration validation
npm run test:enterprise:integration
```

### Key Files
- **Test Runner**: `test/run-enterprise-tests.js`
- **Test Utilities**: `test/utils/test-helpers.js`
- **Reports**: `test-output/enterprise-test-report.*`

---

*This test suite ensures your Legal MCP Server enterprise features are production-ready with comprehensive validation of security, performance, and reliability features.*

# Unit Testing Guidelines for Legal MCP Server

## Overview

This document provides guidelines for writing and maintaining unit tests for the
Legal MCP Server codebase.

## Test Structure

### File Organization

- Unit tests are located in `test/unit/`
- Test files follow the naming convention: `test-{component}.ts`
- Each source file should have a corresponding test file

### Test Naming Convention

- Test files: `test-{component}.ts`
- Test suites: `describe('{Component Name}', () => {})`
- Test cases: `it('should {expected behavior}', () => {})`

## Testing Priorities

### 🔥 CRITICAL (Must Test)

1. **Core Business Logic**
   - API integration (CourtListener)
   - Caching mechanisms
   - Metrics collection
   - Error handling

2. **Security Components**
   - Authentication middleware
   - Input sanitization
   - Rate limiting

3. **Performance Critical**
   - Cache TTL/LRU logic
   - Rate limiting algorithms
   - Memory management

### ⚡ HIGH (Should Test)

1. **Server Infrastructure**
   - HTTP server endpoints
   - Enterprise server middleware
   - Configuration management

2. **Integration Points**
   - Middleware pipeline
   - Tool handlers
   - Error propagation

### 🟡 MEDIUM (Nice to Test)

1. **Utilities**
   - Helper functions
   - Data transformations
   - Logging utilities

## Writing Effective Tests

### Test Structure Pattern

```javascript
describe('Component Name', () => {
  let component;
  let mockDependencies;

  beforeEach(() => {
    // Setup mocks and test instance
    mockDependencies = createMocks();
    component = new Component(mockDependencies);
  });

  describe('Feature Group', () => {
    it('should handle normal case', () => {
      // Arrange
      const input = {
        /* test data */
      };

      // Act
      const result = component.method(input);

      // Assert
      assert.strictEqual(result.expected, 'value');
    });

    it('should handle edge case', () => {
      // Test edge cases and error conditions
    });
  });
});
```

### Mocking Guidelines

#### Mock External Dependencies

- Always mock external APIs
- Mock file system operations
- Mock network calls
- Mock timing functions

#### Mock Example

```javascript
class MockLogger {
  constructor() {
    this.logs = [];
  }

  info(msg, meta) {
    this.logs.push({ level: 'info', msg, meta });
  }

  error(msg, meta) {
    this.logs.push({ level: 'error', msg, meta });
  }
}
```

### Test Coverage Goals

| Component         | Target Coverage | Priority |
| ----------------- | --------------- | -------- |
| CourtListener API | 90%+            | CRITICAL |
| Metrics Collector | 95%+            | CRITICAL |
| Cache Manager     | 90%+            | CRITICAL |
| Enterprise Server | 80%+            | HIGH     |
| HTTP Server       | 85%+            | HIGH     |
| Configuration     | 70%+            | MEDIUM   |

## Running Tests

### Command Reference

```bash
# Run all unit tests
npm run test:unit

# Install the Chromium browser used by the SPA Playwright harness
pnpm exec playwright install chromium

# Run heuristic source-to-test coverage analysis
npm run test:coverage

# Run the targeted SPA auth/browser-facing Vitest suite
npm run test:spa:auth

# Run the browser-based SPA harness against the local Vite app
npm run test:spa:e2e

# Run the auth-focused Playwright browser suite
npm run test:spa:e2e:auth

# Run the hosted auth release gate used by CI/release
pnpm run ci:auth-release-gate

# Run the default repository test suite (unit + integration + targeted SPA auth/browser)
npm run test:all

# Analyze untested code candidates
npm run test:analysis

# Enforce c8 thresholds used by CI
npm run coverage:check
```

### CI/CD Integration

- All tests must pass before merging
- Coverage reports should be generated
- Hosted auth changes should stay green under `pnpm run ci:auth-release-gate`
- CI now enforces `npm run test:spa:auth`, the default `npm run test` /
  `npm run test:all` include the targeted SPA auth/browser suites, and the auth
  release gate also runs `npm run test:spa:e2e:auth`
- `npm run test:spa:e2e` runs Playwright against the real local Vite SPA; the
  auth suite mostly mocks `/api/*` and `/mcp` for deterministic browser
  coverage, but now also includes a real local worker-route auth/session/logout
  flow plus a real `/authorize -> /auth/approve` browser approval journey
- `npm run test:coverage` is a gap-finding heuristic, not a substitute for `c8`
  line/branch coverage
- Failed tests should block deployment

## Best Practices

### 1. Test Isolation

- Each test should be independent
- Clean up after each test
- Use beforeEach/afterEach for setup/teardown

### 2. Test Data

- Use realistic test data
- Create data fixtures for complex objects
- Avoid hardcoded values where possible

### 3. Async Testing

```javascript
// Correct async test
it('should handle async operation', async () => {
  const result = await component.asyncMethod();
  assert.strictEqual(result.status, 'success');
});
```

### 4. Error Testing

- Test both success and failure cases
- Test edge cases and boundary conditions
- Verify error messages and types

### 5. Performance Testing

- Test response time expectations
- Test memory usage for large datasets
- Test concurrent operations

## Maintenance

### Regular Tasks

1. **Weekly**: Review test coverage reports
2. **Monthly**: Update test dependencies
3. **Per Release**: Run full test suite
4. **After Changes**: Update related tests

### Test Debt Management

- Prioritize fixing broken tests
- Remove obsolete tests
- Refactor test code for maintainability

## Resources

### Testing Tools

- **Node.js Test Runner**: Built-in testing framework
- **Playwright**: Browser harness for real SPA routing, storage, and auth-state
  flows
- **c8**: Code coverage tool
- **Sinon**: Mocking and stubbing library

### Documentation

- [Node.js Test Runner](https://nodejs.org/api/test.html)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

**Remember**: Good tests are an investment in code quality and developer
productivity!

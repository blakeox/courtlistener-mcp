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
   - Worker authentication and OAuth routes
   - MCP protocol boundary and input validation
   - Durable Object-backed rate limiting

3. **Performance Critical**
   - Cache TTL/LRU logic
   - Rate limiting algorithms
   - Memory management

### ⚡ HIGH (Should Test)

1. **Server Infrastructure**
   - Cloudflare Worker entrypoints and route composition
   - Stateless MCP v2 Streamable HTTP transport
   - Configuration and binding contracts

2. **Integration Points**
   - Worker service bindings and Cloudflare resources
   - Tool handlers
   - Error and result-schema propagation

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
      const input = {/* test data */};

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

| Component           | Target Coverage | Priority |
| ------------------- | --------------- | -------- |
| CourtListener API   | 90%+            | CRITICAL |
| Metrics Collector   | 95%+            | CRITICAL |
| Cache Manager       | 90%+            | CRITICAL |
| Workers runtime     | 85%+            | HIGH     |
| MCP v2 transport    | 90%+            | HIGH     |
| Local Worker parity | 85%+            | HIGH     |
| Configuration       | 70%+            | MEDIUM   |

## Running Tests

### Command Reference

```bash
# Run all unit tests
pnpm run test:unit

# Install the Chromium browser used by the SPA Playwright harness
pnpm exec playwright install chromium

# Run heuristic source-to-test coverage analysis
pnpm run test:coverage

# Run the targeted SPA auth/browser-facing Vitest suite
pnpm run test:spa:auth

# Run a focused SPA Vitest slice under the real SPA config
pnpm run test:spa:focus -- src/web-spa/src/__tests__/shell.test.tsx

# Run the browser-based SPA harness against the local Vite app
pnpm run test:spa:e2e

# Run design-token smoke checks (landing, theme toggle, buttons, eyebrows)
pnpm run test:spa:design

# Lint SPA styles for token-only CSS and no Tailwind utilities
pnpm run ci:check:design-system

# Run the auth-focused Playwright browser suite
pnpm run test:spa:e2e:auth

# Run the hosted auth release gate used by CI/release
pnpm run ci:auth-release-gate

# Run Cloudflare Workers runtime tests and a Wrangler dry-run bundle
pnpm run test:workers

# Run focused MCP v2 protocol and Worker transport contracts
pnpm run test:mcp:surface
pnpm run test:transport:http

# Verify generated bindings and Cloudflare IaC ownership
pnpm run cloudflare:check:types
pnpm run cloudflare:check:iac
pnpm run cloudflare:check:startup

# Run the default repository test suite (unit + integration + targeted SPA auth/browser)
pnpm run test:all

# Analyze untested code candidates
pnpm run test:analysis

# Enforce c8 thresholds used by CI
pnpm run coverage:check
```

### CI/CD Integration

- All tests must pass before merging
- Coverage reports should be generated
- Hosted auth changes should stay green under `pnpm run ci:auth-release-gate`
- CI now enforces `pnpm run test:spa:auth`, the default `pnpm run test` /
  `pnpm run test:all` include the targeted SPA auth/browser suites, and the auth
  release gate also runs `pnpm run test:spa:e2e:auth`
- For focused SPA work, prefer `pnpm run test:spa:focus -- <file...>` over
  root-level `vitest` commands so `src/web-spa/vitest.config.ts` and
  `vitest.setup.ts` always apply
- `pnpm run test:spa:e2e` runs Playwright against the real local Vite SPA; the
  auth suite mostly mocks `/api/*` and `/mcp` for deterministic browser
  coverage, but now also includes a real local worker-route auth/session/logout
  flow plus a real `/oauth/authorize -> /oauth/approve` browser approval journey
- `pnpm run test:coverage` is a gap-finding heuristic, not a substitute for `c8`
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

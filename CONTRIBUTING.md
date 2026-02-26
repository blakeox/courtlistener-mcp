# Contributing to CourtListener MCP

Thank you for your interest in contributing! This guide will help you understand the architecture and best practices.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or 20+
- npm or yarn
- TypeScript knowledge
- Familiarity with Zod schemas

### Setup
```bash
# Clone the repository
git clone https://github.com/blakeox/courtlistener-mcp.git
cd courtlistener-mcp

# Install dependencies
npm install

# Install git hooks (Lefthook)
pnpm run hooks:install

# Build the project
npm run build

# Run tests
npm test
```

---

## 🏗️ Architecture Overview

See `ARCHITECTURE.md` for comprehensive architecture documentation.

**Key Principles**:
1. **100% Type Safety** - No `any` types
2. **Decorator-Based** - Use `@withDefaults` for cross-cutting concerns
3. **Zod Validation** - All input validated via Zod schemas
4. **Pure Business Logic** - Handlers focus only on business logic

---

## 📝 Adding a New Handler

### Step 1: Define Your Schema

```typescript
// In src/domains/<domain>/handlers.ts
import { z } from 'zod';

// Define Zod schema for validation
const myNewHandlerSchema = z.object({
  required_param: z.string(),
  optional_param: z.number().int().min(1).max(100).optional(),
});
```

### Step 2: Create Your Handler

```typescript
// Extend TypedToolHandler
export class MyNewHandler extends TypedToolHandler<typeof myNewHandlerSchema> {
  readonly name = 'my_new_tool';
  readonly description = 'What this tool does';
  readonly category = 'domain_name'; // e.g., 'cases', 'search', etc.
  protected readonly schema = myNewHandlerSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  // Use @withDefaults for automatic caching, timing, error handling
  @withDefaults({ cache: { ttl: 3600 } }) // Optional: configure TTL
  async execute(
    input: z.infer<typeof myNewHandlerSchema>, // ← Automatically typed!
    context: ToolContext
  ): Promise<CallToolResult> {
    // Pure business logic - everything else is automatic!
    const result = await this.apiClient.someMethod(input);
    
    return this.success({
      summary: 'A human-readable summary',
      data: result,
    });
  }
}
```

### Step 3: Register Your Handler

```typescript
// In the same file
export function registerMyDomainHandlers(
  registry: ToolHandlerRegistry,
  apiClient: CourtListenerAPI
): void {
  registry.register(new MyNewHandler(apiClient));
  // ... other handlers
}
```

### Step 4: Wire It Up

```typescript
// In src/server/best-practice-server.ts or bootstrap function
import { registerMyDomainHandlers } from './domains/my-domain/handlers.js';

// In setup
registerMyDomainHandlers(registry, apiClient);
```

---

## ✅ Handler Checklist

When creating a handler, ensure:

- [ ] **Schema defined** using Zod
- [ ] **Extends `TypedToolHandler<typeof schema>`**
- [ ] **Has `readonly name, description, category`**
- [ ] **Protected `schema` property assigned**
- [ ] **Constructor injects dependencies**
- [ ] **`@withDefaults` decorator applied** (with optional config)
- [ ] **Execute method**:
  - [ ] Input is typed as `z.infer<typeof schema>`
  - [ ] Returns `Promise<CallToolResult>`
  - [ ] Contains only business logic
  - [ ] Uses `this.success()` or `this.error()` for responses
- [ ] **Registered** in tool registry
- [ ] **Tests written**

---

## 🎨 Best Practices

### 1. Type Safety
```typescript
// ✅ Good - Full type inference
const schema = z.object({ id: z.string() });
class MyHandler extends TypedToolHandler<typeof schema> {
  async execute(input: z.infer<typeof schema>, context: ToolContext) {
    // input.id is typed as string!
  }
}

// ❌ Bad - Using any
async execute(input: any, context: any) {
  // No type safety
}
```

### 2. Using Decorators
```typescript
// ✅ Good - Use @withDefaults for automatic concerns
@withDefaults({ cache: { ttl: 3600 } })
async execute(input, context) {
  const result = await this.apiClient.getData();
  return this.success(result);
}

// ❌ Bad - Manual caching/timing/errors
async execute(input, context) {
  const cached = context.cache.get('key', input);
  if (cached) return this.success(cached);
  
  const timer = context.logger.startTimer();
  try {
    const result = await this.apiClient.getData();
    context.cache.set('key', input, result);
    timer.end();
    return this.success(result);
  } catch (error) {
    context.logger.error('Failed', error);
    throw error;
  }
}
```

### 3. Using Utilities
```typescript
// ✅ Good - Use pagination utilities
import { createPaginationInfo } from '../common/pagination-utils.js';

return this.success({
  results: response.results,
  pagination: createPaginationInfo(response, input.page, input.page_size)
});

// ❌ Bad - Manual pagination
return this.success({
  results: response.results,
  pagination: {
    page: input.page,
    count: response.count,
    total_pages: Math.ceil(response.count / input.page_size),
    has_next: input.page * input.page_size < response.count,
    has_previous: input.page > 1,
  }
});
```

### 4. Using Query Builders
```typescript
// ✅ Good - Fluent, type-safe query building
import { QueryBuilder } from '../infrastructure/query-builder.js';

const params = QueryBuilder.opinions()
  .query('privacy rights')
  .court('scotus')
  .dateRange('2020-01-01', '2024-01-01')
  .paginate(1, 50)
  .build();

// ❌ Bad - Loose object construction
const params = {
  q: 'privacy rights',
  court: 'scotus',
  date_filed_after: '2020-01-01',
  date_filed_before: '2024-01-01',
  page: 1,
  page_size: 50,
};
```

---

## 🧪 Testing

### Unit Test Template
```typescript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('MyNewHandler', () => {
  let handler: MyNewHandler;
  let mockApiClient: MockCourtListenerAPI;
  let context: ToolContext;

  beforeEach(() => {
    mockApiClient = new MockCourtListenerAPI();
    handler = new MyNewHandler(mockApiClient);
    context = createMockContext();
  });

  it('should handle valid input', async () => {
    const input = { required_param: 'test' };
    const result = await handler.handle(input, context);
    
    assert.strictEqual(result.isError, false);
    assert.ok(result.content);
  });

  it('should validate input schema', async () => {
    const invalid = { wrong_param: 'test' };
    const result = await handler.handle(invalid, context);
    
    assert.strictEqual(result.isError, true);
  });
});
```

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npx tsx --test test/unit/test-my-handler.ts

# Run with coverage
npm run test:coverage
```

---

## 📦 Project Structure

```
src/
├── server/              # MCP server and handler base classes
├── domains/             # Domain-specific handlers (add yours here!)
├── infrastructure/      # Core services (cache, logger, etc.)
├── middleware/          # Request middleware
└── common/              # Shared utilities and types

test/
├── unit/                # Unit tests
├── integration/         # Integration tests
└── utils/               # Test utilities
```

---

## 🔄 Development Workflow

### 1. Create Feature Branch
```bash
git checkout -b feature/my-new-handler
```

### 2. Implement Handler
- Follow the handler template above
- Use `@withDefaults` decorator
- Focus on business logic only

### 3. Write Tests
- Unit tests for handler logic
- Integration tests if needed
- Maintain 100% test pass rate

### 4. Build & Test
```bash
npm run build    # Should pass with 0 errors
npm test         # Should pass 100%
npm run lint     # Should pass
```

### 5. Commit
```bash
git add .
git commit -m "feat(domain): add my new handler

- Description of what it does
- Any notable details"
```

### 6. Push & PR
```bash
git push origin feature/my-new-handler
# Create PR on GitHub
```

---

## 🎯 Code Style

### TypeScript
- **Always** use explicit types for public APIs
- **Prefer** `const` over `let`
- **Use** async/await over promises
- **Avoid** `any` types (use `unknown` if needed)

### Naming Conventions
- **Handlers**: `<Verb><Noun>Handler` (e.g., `GetCaseDetailsHandler`)
- **Schemas**: `<camelCase>Schema` (e.g., `getCaseDetailsSchema`)
- **Methods**: `camelCase`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`

### File Organization
- One handler class per file OR related handlers grouped by domain
- Schemas at top of file
- Handlers below schemas
- Registration function at bottom

---

## 🐛 Debugging

### Enable Debug Logging
```bash
export LOG_LEVEL=debug
npm run start
```

### Common Issues

**Issue**: Handler not found  
**Solution**: Ensure handler is registered in tool registry

**Issue**: TypeScript errors  
**Solution**: Check schema types match handler input types

**Issue**: Validation errors  
**Solution**: Check Zod schema matches expected input

**Issue**: Build errors  
**Solution**: Run `npm run build` to see full error details

---

## 📚 Additional Resources

- [Architecture Documentation](./ARCHITECTURE.md)
- [Refactoring Roadmap](./REFACTORING_ROADMAP.md)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Zod Documentation](https://zod.dev/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

## ❓ Questions?

Open an issue on GitHub or contact the maintainers.

---

## 🎉 Thank You!

Your contributions make this project better for everyone!

---

*Last updated: November 3, 2025*

# Comprehensive Refactoring Roadmap

**Date**: November 1, 2024  
**Project**: CourtListener MCP Server  
**Status**: 📋 **PLANNING**

---

## 🎯 Executive Summary

This roadmap identifies opportunities for further refactoring to improve:

- **Type Safety**: Replace 253 `any` types with specific types
- **Code Duplication**: Extract common patterns from 3,106 lines of handler code
- **Complexity**: Refactor 10+ functions over 100 lines
- **Maintainability**: Standardize validation, schema generation, and error
  handling

**Estimated Effort**: 4-6 days  
**Risk Level**: Low (incremental, testable changes)  
**Expected Impact**: High (improved maintainability, type safety, and developer
experience)

---

## 📊 Current State Analysis

### Code Metrics

- **Total Source Files**: 75 TypeScript files
- **Total Test Files**: 57 TypeScript files
- **Largest Files**: 10 files over 500 lines
- **Complex Functions**: 10+ functions over 100 lines
- **Type Safety Issues**: 253 `any` types found
- **Handler Code**: 3,106 lines across 8 domain files

### Identified Issues

#### 1. Type Safety (Critical Priority)

```bash
Found 253 `any` types across:
  - src/middleware/sanitization.ts: 9 instances
  - src/middleware/audit.ts: 4 instances
  - src/infrastructure/*: 45 instances
  - src/domains/*/handlers.ts: 150+ instances
  - src/endpoints/*: 15 instances
```

#### 2. Code Duplication (High Priority)

- **Validation Patterns**: Every handler has near-identical `validate()` methods
- **Schema Generation**: Every handler has similar `getSchema()` methods
- **Error Handling**: Repetitive try-catch-return patterns
- **Caching Logic**: Duplicate cache check/set patterns

#### 3. Large Files (Medium Priority)

```
src/domains/enhanced/handlers.ts    871 lines
src/infrastructure/openapi-generator.ts    858 lines
src/enterprise-server.ts    819 lines
src/infrastructure/performance-monitor.ts    731 lines
src/infrastructure/async-patterns.ts    638 lines
src/courtlistener.ts    634 lines
src/worker.ts    616 lines
src/tool-definitions.ts    569 lines
src/server/best-practice-server.ts    558 lines
src/infrastructure/enhanced-express-server.ts    548 lines
```

#### 4. Complex Functions (Medium Priority)

```
src/tool-definitions.ts:15    519 lines (massive!)
src/infrastructure/openapi-generator.ts:158    268 lines
src/enterprise-server.ts:242    169 lines
src/domains/search/handlers.ts:57    147 lines
```

---

## 🔴 Phase 1: Type Safety Improvements (Days 1-2)

### Priority 1.1: Replace `any` in Core Infrastructure

**Estimated Time**: 4-6 hours

#### Middleware - Sanitization (9 instances)

**File**: `src/middleware/sanitization.ts`

**Current Issues**:

```typescript
sanitized: any;
sanitize(input: any, path: string = 'root'): SanitizationResult
private sanitizeValue(value: any, ...): any
```

**Proposed Fix**:

```typescript
// Define proper recursive types
export type SanitizableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SanitizableValue[]
  | { [key: string]: SanitizableValue };

export interface SanitizationResult {
  sanitized: SanitizableValue;
  warnings: string[];
  blocked: boolean;
}

export class InputSanitizer {
  sanitize(input: unknown, path = 'root'): SanitizationResult {
    // Type-safe implementation with proper type guards
    if (this.isBlocked(input)) {
      return { sanitized: null, warnings: [], blocked: true };
    }

    const sanitized = this.sanitizeValue(input, path, 0, result);
    return { sanitized, warnings: result.warnings, blocked: false };
  }

  private sanitizeValue(
    value: unknown,
    path: string,
    depth: number,
    result: SanitizationResult,
  ): SanitizableValue {
    // Use type guards for safe handling
    if (isString(value)) return this.sanitizeString(value);
    if (isNumber(value)) return value;
    if (isBoolean(value)) return value;
    if (isNull(value) || isUndefined(value)) return null;
    if (isArray(value)) return this.sanitizeArray(value, path, depth, result);
    if (isObject(value)) return this.sanitizeObject(value, path, depth, result);

    return null; // Unknown types become null
  }
}
```

**Impact**: ✅ Type-safe sanitization, better IDE support, prevents runtime
errors

---

#### Middleware - Audit (4 instances)

**File**: `src/middleware/audit.ts`

**Current Issues**:

```typescript
requestArgs?: any;
responseData?: any;
private removeSensitiveFields(data: any): any
```

**Proposed Fix**:

```typescript
// Use specific types for audit data
export interface AuditEventData {
  requestArgs?: Record<string, unknown>;
  responseData?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AuditEvent extends AuditEventData {
  timestamp: string;
  toolName: string;
  userId?: string;
  success: boolean;
  duration: number;
}

export class AuditLoggingMiddleware {
  private removeSensitiveFields(
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized = { ...data };

    for (const field of this.sensitiveFields) {
      delete sanitized[field];
    }

    return sanitized;
  }

  private truncateData(data: Record<string, unknown>): Record<string, unknown> {
    // Type-safe truncation logic
  }
}
```

**Impact**: ✅ Clear audit data structure, type-safe field removal

---

#### Infrastructure - Error Types (13 instances)

**File**: `src/infrastructure/error-types.ts`

**Current Issues**:

```typescript
value?: any;
validationErrors: Array<{ field: string; message: string; value?: any }>
apiResponse?: any;
addData(key: string, value: any): this
```

**Proposed Fix**:

```typescript
// Use unknown for user-provided values, then validate
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
  expectedType?: string;
}

export class ConfigurationError extends BaseError {
  public readonly validationErrors: ValidationError[];

  constructor(
    message: string,
    validationErrors: ValidationError[] = [],
    context?: ErrorContext,
  ) {
    super(message, 'CONFIGURATION_ERROR', context);
    this.validationErrors = validationErrors;
  }
}

export class ApiError extends BaseError {
  public readonly apiResponse?: {
    status: number;
    statusText: string;
    data: unknown;
  };

  addData(key: string, value: unknown): this {
    this.context = this.context || {};
    this.context[key] = value;
    return this;
  }
}
```

**Impact**: ✅ Type-safe error handling, better error context

---

### Priority 1.2: Replace `any` in Domain Handlers (150+ instances)

**Estimated Time**: 6-8 hours

**Strategy**: Create reusable validation base class

**Current Pattern** (repeated in every handler):

```typescript
export class SomeHandler extends BaseToolHandler {
  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({ ... });
      const validated = schema.parse(input);
      return { success: true, data: validated };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    // implementation
  }

  getSchema(): any {
    return { type: 'object', properties: { ... } };
  }
}
```

**Proposed Pattern**:

```typescript
// New generic base handler with type inference
export abstract class TypedToolHandler<
  TInput = unknown,
  TOutput = unknown,
> extends BaseToolHandler {
  // Abstract Zod schema - subclasses define this
  protected abstract readonly schema: z.ZodType<TInput>;

  // Automatic validation with type inference
  validate(input: unknown): Result<TInput, Error> {
    try {
      const validated = this.schema.parse(input);
      return { success: true, data: validated };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  // Type-safe execute with inferred types
  abstract execute(
    input: TInput,
    context: ToolContext,
  ): Promise<CallToolResult<TOutput>>;

  // Auto-generate JSON Schema from Zod schema
  getSchema(): JSONSchema {
    return zodToJsonSchema(this.schema);
  }
}

// Usage example - fully typed!
export class SearchOpinionsHandler extends TypedToolHandler<
  SearchOpinionsInput,
  SearchOpinionsOutput
> {
  protected readonly schema = z.object({
    query: z.string().optional(),
    court: z.string().optional(),
    page: z.number().int().min(1).default(1),
    page_size: z.number().int().min(1).max(100).default(20),
  });

  // Input is automatically typed as SearchOpinionsInput!
  async execute(
    input: z.infer<typeof this.schema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    // Fully type-safe implementation
    // TypeScript knows exactly what properties input has
  }
}
```

**Benefits**:

- ✅ **Type Safety**: Input automatically typed from Zod schema
- ✅ **DRY**: No more repeated validation boilerplate
- ✅ **Auto-generation**: JSON Schema generated from Zod
- ✅ **IDE Support**: Full autocomplete and type checking
- ✅ **Maintainability**: Change schema, validation updates automatically

**Files to Update** (150+ instances eliminated):

- `src/domains/cases/handlers.ts` - 3 handlers
- `src/domains/courts/handlers.ts` - 3 handlers
- `src/domains/dockets/handlers.ts` - 5 handlers
- `src/domains/enhanced/handlers.ts` - 8 handlers
- `src/domains/miscellaneous/handlers.ts` - 4 handlers
- `src/domains/opinions/handlers.ts` - 4 handlers
- `src/domains/oral-arguments/handlers.ts` - 2 handlers
- `src/domains/search/handlers.ts` - 3 handlers

**Impact**:

- ✅ Eliminate ~900 lines of boilerplate code
- ✅ Full type safety across all handlers
- ✅ Automatic schema generation
- ✅ Consistent validation patterns

---

### Priority 1.3: Infrastructure Type Safety

**Estimated Time**: 2-3 hours

#### Enhanced API Client (12 instances)

**File**: `src/infrastructure/enhanced-api-client.ts`

**Issues**:

```typescript
async searchOpinions(params: any, priority: number = 0): Promise<any>
async searchCases(params: any, priority: number = 0): Promise<any>
```

**Fix**: Define proper interfaces for all API methods:

```typescript
export interface SearchParams {
  query?: string;
  court?: string;
  page?: number;
  page_size?: number;
  [key: string]: unknown; // Allow additional params
}

export interface SearchResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export class EnhancedCourtListenerAPIClient {
  async searchOpinions(
    params: SearchParams,
    priority: number = 0,
  ): Promise<SearchResponse<Opinion>> {
    // Type-safe implementation
  }

  async searchCases(
    params: SearchParams,
    priority: number = 0,
  ): Promise<SearchResponse<Case>> {
    // Type-safe implementation
  }
}
```

#### OpenAPI Generator (5 instances)

**File**: `src/infrastructure/openapi-generator.ts`

**Issues**:

```typescript
public addPath(path: string, method: string, operation: any): void
private convertToYaml(obj: any, indent: number): string
```

**Fix**: Use proper OpenAPI types:

```typescript
import { OpenAPIV3 } from 'openapi-types';

export class OpenAPIGenerator {
  public addPath(
    path: string,
    method: string,
    operation: OpenAPIV3.OperationObject,
  ): void {
    // Type-safe path operations
  }

  private convertToYaml(obj: OpenAPIV3.Document, indent: number): string {
    // Type-safe YAML conversion
  }
}
```

---

## 🟡 Phase 2: Reduce Code Duplication (Days 3-4)

### Priority 2.1: Extract Common Handler Patterns

**Estimated Time**: 6-8 hours

**Problem**: 3,106 lines of handler code with repeated patterns

#### Common Patterns to Extract:

##### Pattern 1: Caching Logic (Repeated 32 times)

**Current** (repeated in every handler):

```typescript
async execute(input: TInput, context: ToolContext): Promise<CallToolResult> {
  const cacheKey = 'some_handler';
  const cached = context.cache?.get<any>(cacheKey, input);
  if (cached) {
    context.logger.info('Served from cache', { requestId: context.requestId });
    return this.success(cached);
  }

  // ... do work ...

  context.cache?.set(cacheKey, input, result, 3600);
  return this.success(result);
}
```

**Proposed**: Extract to mixin or decorator:

```typescript
// src/server/handler-decorators.ts
export function withCache(ttl: number = 3600) {
  return function <T extends TypedToolHandler>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: T,
      input: unknown,
      context: ToolContext,
    ) {
      const cacheKey = this.name;
      const cached = context.cache?.get(cacheKey, input);

      if (cached) {
        context.logger.info('Served from cache', {
          tool: this.name,
          requestId: context.requestId,
        });
        return this.success(cached);
      }

      const result = await originalMethod.call(this, input, context);

      if (result.isError === false) {
        context.cache?.set(cacheKey, input, result.content, ttl);
      }

      return result;
    };

    return descriptor;
  };
}

// Usage - clean and declarative!
export class SearchOpinionsHandler extends TypedToolHandler {
  @withCache(3600)
  async execute(input: SearchInput, context: ToolContext) {
    // No cache logic needed - handled by decorator
    const results = await this.apiClient.searchOpinions(input);
    return this.success(results);
  }
}
```

##### Pattern 2: Error Logging (Repeated 32 times)

**Current**:

```typescript
catch (error) {
  context.logger.error('Failed to ...', error as Error, {
    requestId: context.requestId,
    someParam: input.someParam,
  });
  return this.error((error as Error).message, { someParam: input.someParam });
}
```

**Proposed**: Extract to helper method in `BaseToolHandler`:

```typescript
export abstract class BaseToolHandler {
  protected handleError(
    error: unknown,
    context: ToolContext,
    additionalContext?: Record<string, unknown>
  ): CallToolResult {
    const err = error instanceof Error ? error : new Error(String(error));

    context.logger.error(`Failed to execute ${this.name}`, err, {
      requestId: context.requestId,
      tool: this.name,
      ...additionalContext,
    });

    return this.error(err.message, additionalContext);
  }
}

// Usage
catch (error) {
  return this.handleError(error, context, { court: input.court });
}
```

##### Pattern 3: Response Formatting (Repeated 32 times)

**Proposed**: Extract to `ResponseBuilder` (already exists, expand it):

```typescript
// src/common/response-builder.ts
export class ResponseBuilder {
  static paginated<T>(
    results: T[],
    count: number,
    page: number,
    pageSize: number,
  ): PaginatedResponse<T> {
    return {
      results,
      count,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(count / pageSize),
      has_next: page * pageSize < count,
      has_previous: page > 1,
    };
  }

  static withMetadata<T>(
    data: T,
    metadata: ResponseMetadata,
  ): EnhancedResponse<T> {
    return {
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        cached: false,
        ...metadata,
      },
    };
  }
}
```

**Impact**:

- ✅ Reduce handler code by ~40% (1,200+ lines)
- ✅ Consistent patterns across all handlers
- ✅ Easier to add new handlers
- ✅ Centralized logic for improvements

---

### Priority 2.2: Consolidate Schema Definitions

**Estimated Time**: 4-6 hours

**Problem**: `tool-definitions.ts` is 569 lines of manual schema definitions
that duplicate Zod schemas in handlers

**Current State**:

- Handlers define Zod schemas for validation
- `tool-definitions.ts` manually defines JSON schemas for MCP
- These can drift out of sync

**Proposed Solution**: Auto-generate tool definitions from handlers

```typescript
// src/server/tool-registry.ts (enhanced)
export class ToolHandlerRegistry {
  private handlers = new Map<string, TypedToolHandler>();

  // Register handler (existing)
  register(handler: TypedToolHandler): void {
    this.handlers.set(handler.name, handler);
  }

  // NEW: Generate tool definitions from registered handlers
  generateToolDefinitions(): EnhancedTool[] {
    return Array.from(this.handlers.values()).map((handler) => ({
      name: handler.name,
      description: handler.description,
      category: handler.category,
      complexity: handler.complexity || 'simple',
      rateLimitWeight: handler.rateLimitWeight || 1,
      inputSchema: handler.getSchema(), // Auto-generated from Zod
      examples: handler.examples || [],
    }));
  }

  // NEW: Generate OpenAPI spec from handlers
  generateOpenAPISpec(): OpenAPIV3.Document {
    const generator = new OpenAPIGenerator();

    for (const handler of this.handlers.values()) {
      generator.addPath(`/tools/${handler.name}`, 'post', {
        summary: handler.description,
        tags: [handler.category],
        requestBody: {
          content: {
            'application/json': {
              schema: handler.getSchema(),
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
        },
      });
    }

    return generator.getSpec();
  }
}
```

**Benefits**:

- ✅ Single source of truth (Zod schemas)
- ✅ No drift between validation and documentation
- ✅ Auto-update schemas when handlers change
- ✅ Can delete `tool-definitions.ts` (569 lines removed)

---

## 🟢 Phase 3: Reduce Complexity (Day 5)

### Priority 3.1: Split Large Files

**Estimated Time**: 3-4 hours

#### Split `domains/enhanced/handlers.ts` (871 lines)

**Current**: 8 handlers in one file

**Proposed**: Split into focused files:

```
src/domains/enhanced/
├── handlers/
│   ├── index.ts              (barrel export)
│   ├── bankruptcy.ts         (GetBankruptcyDataHandler)
│   ├── bulk-data.ts          (GetBulkDataHandler)
│   ├── case-analysis.ts      (GetComprehensiveCaseAnalysisHandler)
│   ├── citations.ts          (ValidateCitationsHandler)
│   ├── financial.ts          (GetFinancialDisclosureDetailsHandler)
│   ├── judge-profile.ts      (GetComprehensiveJudgeProfileHandler)
│   ├── recap.ts              (GetEnhancedRECAPDataHandler)
│   └── visualization.ts      (GetVisualizationDataHandler)
├── schemas.ts                (shared Zod schemas)
└── types.ts                  (shared types)
```

**Benefits**:

- ✅ Easier to navigate (8 files × ~100 lines each)
- ✅ Better git history (changes isolated)
- ✅ Parallel development (no merge conflicts)
- ✅ Faster IDE performance

#### Split `infrastructure/openapi-generator.ts` (858 lines)

**Proposed**:

```
src/infrastructure/openapi/
├── generator.ts         (main class, ~200 lines)
├── schemas.ts           (schema generation, ~250 lines)
├── paths.ts             (path operations, ~200 lines)
├── yaml-converter.ts    (YAML conversion, ~150 lines)
└── types.ts             (OpenAPI types)
```

---

### Priority 3.2: Refactor Long Functions

**Estimated Time**: 2-3 hours

#### Target: `tool-definitions.ts::getEnhancedToolDefinitions()` (519 lines!)

**Current**: One massive function with 32 tool definitions

**Proposed**: Split into domain-specific files:

```typescript
// src/tool-definitions/index.ts
export function getEnhancedToolDefinitions(): EnhancedTool[] {
  return [
    ...getSearchTools(),
    ...getCaseTools(),
    ...getCourtTools(),
    ...getDocketTools(),
    ...getOpinionTools(),
    ...getEnhancedTools(),
  ];
}

// src/tool-definitions/search.ts
export function getSearchTools(): EnhancedTool[] {
  return [
    {
      name: 'search_cases',
      description: '...',
      // ... definition
    },
    {
      name: 'search_opinions',
      description: '...',
      // ... definition
    },
  ];
}

// Or better yet - generate from handlers!
export function getEnhancedToolDefinitions(): EnhancedTool[] {
  const registry = container.resolve<ToolHandlerRegistry>('toolRegistry');
  return registry.generateToolDefinitions();
}
```

**Impact**: Delete 519-line function, replace with 3-line auto-generation

---

## 🔵 Phase 4: Advanced Improvements (Day 6)

### Priority 4.1: Implement Query Builder Pattern

**Estimated Time**: 3-4 hours

**Problem**: API client methods take loose `params` objects

**Proposed**: Type-safe fluent query builder:

```typescript
// src/infrastructure/query-builder.ts
export class OpinionQueryBuilder {
  private params: Record<string, unknown> = {};

  query(text: string): this {
    this.params.query = text;
    return this;
  }

  court(courtId: string): this {
    this.params.court = courtId;
    return this;
  }

  dateRange(after: string, before?: string): this {
    this.params.date_filed_after = after;
    if (before) this.params.date_filed_before = before;
    return this;
  }

  paginate(page: number, pageSize: number = 20): this {
    this.params.page = page;
    this.params.page_size = pageSize;
    return this;
  }

  build(): SearchParams {
    return this.params as SearchParams;
  }
}

// Usage - much more readable!
const params = new OpinionQueryBuilder()
  .query('privacy rights')
  .court('scotus')
  .dateRange('2020-01-01', '2024-01-01')
  .paginate(1, 50)
  .build();

const results = await apiClient.searchOpinions(params);
```

---

### Priority 4.2: Add Request/Response Logging Middleware

**Estimated Time**: 2-3 hours

**Proposed**: Structured logging for all tool calls:

```typescript
// src/middleware/request-logger.ts
export class RequestLoggerMiddleware extends BaseMiddleware {
  readonly name = 'request-logger';

  async process(
    context: RequestContext,
    next: () => Promise<unknown>,
  ): Promise<unknown> {
    const startTime = Date.now();

    this.logger.info('Request started', {
      requestId: context.requestId,
      tool: context.metadata.toolName,
      userId: context.userId,
    });

    try {
      const result = await next();

      this.logger.info('Request completed', {
        requestId: context.requestId,
        duration: Date.now() - startTime,
        success: true,
      });

      return result;
    } catch (error) {
      this.logger.error('Request failed', error as Error, {
        requestId: context.requestId,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }
}
```

---

### Priority 4.3: Implement Graceful Degradation

**Estimated Time**: 2-3 hours

**Proposed**: Fallback strategies when services fail:

```typescript
// src/infrastructure/fallback-strategies.ts
export interface FallbackStrategy<T> {
  canFallback(error: Error): boolean;
  execute(context: ToolContext): Promise<T>;
}

export class CachedResponseFallback<T> implements FallbackStrategy<T> {
  constructor(private cacheKey: string) {}

  canFallback(error: Error): boolean {
    return error instanceof ApiError && error.statusCode >= 500;
  }

  async execute(context: ToolContext): Promise<T> {
    // Try to return stale cache data
    const stale = context.cache?.getStale<T>(this.cacheKey);
    if (stale) {
      context.logger.warn('Using stale cache due to API error');
      return stale;
    }
    throw new Error('No fallback available');
  }
}

export class BaseToolHandler {
  protected fallbackStrategies: FallbackStrategy<unknown>[] = [];

  protected async executeWithFallback<T>(
    operation: () => Promise<T>,
    context: ToolContext,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      for (const strategy of this.fallbackStrategies) {
        if (strategy.canFallback(error as Error)) {
          try {
            return (await strategy.execute(context)) as T;
          } catch (fallbackError) {
            // Continue to next strategy
          }
        }
      }
      throw error; // No fallback worked
    }
  }
}
```

---

## 📈 Phase 5: Performance Optimizations (Stretch Goals)

### Priority 5.1: Implement Response Streaming

**Benefit**: Better UX for large result sets

```typescript
export interface StreamingHandler {
  streamExecute(
    input: unknown,
    context: ToolContext,
  ): AsyncIterableIterator<Partial<CallToolResult>>;
}

export class SearchOpinionsHandler implements StreamingHandler {
  async *streamExecute(input: SearchInput, context: ToolContext) {
    // Stream metadata first
    yield {
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Searching opinions...',
        },
      ],
    };

    // Stream results as they arrive
    for await (const batch of this.apiClient.streamOpinions(input)) {
      yield {
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify(batch, null, 2),
          },
        ],
      };
    }
  }
}
```

---

### Priority 5.2: Add Result Pagination Caching

**Benefit**: Cache individual pages for better hit rate

```typescript
export class PaginationCache {
  set<T>(
    baseKey: string,
    page: number,
    pageSize: number,
    data: T[],
    ttl: number,
  ): void {
    const pageKey = `${baseKey}:page:${page}:size:${pageSize}`;
    this.cache.set(pageKey, data, ttl);
  }

  get<T>(baseKey: string, page: number, pageSize: number): T[] | null {
    const pageKey = `${baseKey}:page:${page}:size:${pageSize}`;
    return this.cache.get<T[]>(pageKey);
  }
}
```

---

## ✅ Success Metrics

### Code Quality Metrics

- [ ] **Type Safety**: Reduce `any` types from 253 → <20
- [ ] **Code Duplication**: Reduce handler code from 3,106 → <2,000 lines
- [ ] **File Size**: No files over 600 lines
- [ ] **Function Complexity**: No functions over 100 lines
- [ ] **Test Coverage**: Maintain 100% passing tests

### Developer Experience Metrics

- [ ] **Build Time**: Maintain or improve (<5s)
- [ ] **IDE Performance**: Better autocomplete and type hints
- [ ] **Onboarding**: New handlers take <30 min to create
- [ ] **Documentation**: Auto-generated from code

### Maintainability Metrics

- [ ] **Bug Rate**: Reduce type-related bugs by 80%
- [ ] **Change Velocity**: Faster feature implementation
- [ ] **Code Reviews**: Shorter, more focused reviews

---

## 🚀 Implementation Strategy

### Approach

1. **Incremental**: One phase at a time, fully tested
2. **Non-Breaking**: All changes backward compatible
3. **Measured**: Run benchmarks before/after
4. **Validated**: 100% test pass rate maintained

### Risk Mitigation

- **Create feature branch** for each phase
- **Run full test suite** after each change
- **Performance benchmarks** to catch regressions
- **Rollback plan** if issues arise

### Daily Progress Tracking

```markdown
## Day 1: Type Safety - Infrastructure

- [ ] Middleware sanitization types
- [ ] Middleware audit types
- [ ] Error types refactor
- [ ] Tests: 24/24 passing ✅

## Day 2: Type Safety - Handlers

- [ ] Create TypedToolHandler base class
- [ ] Migrate 8 handlers to typed version
- [ ] Update tests
- [ ] Tests: 24/24 passing ✅

## Day 3: Reduce Duplication - Patterns

- [ ] Extract caching decorator
- [ ] Extract error handling helpers
- [ ] Expand ResponseBuilder
- [ ] Tests: 24/24 passing ✅

## Day 4: Reduce Duplication - Schemas

- [ ] Auto-generate tool definitions
- [ ] Delete tool-definitions.ts
- [ ] Update documentation endpoint
- [ ] Tests: 24/24 passing ✅

## Day 5: Reduce Complexity

- [ ] Split large files
- [ ] Refactor long functions
- [ ] Update imports
- [ ] Tests: 24/24 passing ✅

## Day 6: Advanced Improvements

- [ ] Query builder pattern
- [ ] Request logging middleware
- [ ] Fallback strategies
- [ ] Tests: 24/24 passing ✅
```

---

## 📚 Reference Implementation

### Example: Complete Handler Transformation

**Before** (Current):

```typescript
export class SearchOpinionsHandler extends BaseToolHandler {
  readonly name = 'search_opinions';
  readonly description = 'Search legal opinions';
  readonly category = 'search';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        query: z.string().optional(),
        court: z.string().optional(),
        page: z.number().int().min(1).optional(),
        page_size: z.number().int().min(1).max(100).optional(),
      });
      const validated = schema.parse(input);
      return { success: true, data: validated };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        court: { type: 'string', description: 'Court ID' },
        page: { type: 'number', description: 'Page number' },
        page_size: { type: 'number', description: 'Results per page' },
      },
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    const cacheKey = 'search_opinions';
    const cached = context.cache?.get<any>(cacheKey, input);
    if (cached) {
      context.logger.info('Served from cache', {
        requestId: context.requestId,
      });
      return this.success(cached);
    }

    try {
      context.logger.info('Searching opinions', {
        query: input.query,
        requestId: context.requestId,
      });

      const results = await this.apiClient.searchOpinions(input);

      const response = {
        count: results.count,
        results: results.results,
      };

      context.cache?.set(cacheKey, input, response, 3600);
      return this.success(response);
    } catch (error) {
      context.logger.error('Failed to search opinions', error as Error, {
        query: input.query,
        requestId: context.requestId,
      });
      return this.error((error as Error).message, { query: input.query });
    }
  }
}
```

**After** (Refactored):

```typescript
// Define types once
const searchOpinionsSchema = z.object({
  query: z.string().optional(),
  court: z.string().optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(20),
});

type SearchOpinionsInput = z.infer<typeof searchOpinionsSchema>;

interface SearchOpinionsOutput {
  count: number;
  results: Opinion[];
}

// Clean, type-safe handler
export class SearchOpinionsHandler extends TypedToolHandler<
  SearchOpinionsInput,
  SearchOpinionsOutput
> {
  readonly name = 'search_opinions';
  readonly description = 'Search legal opinions';
  readonly category = 'search';
  protected readonly schema = searchOpinionsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withCache(3600)
  @withMetrics()
  async execute(
    input: SearchOpinionsInput,
    context: ToolContext,
  ): Promise<CallToolResult<SearchOpinionsOutput>> {
    return this.executeWithFallback(async () => {
      context.logger.info('Searching opinions', {
        query: input.query,
        requestId: context.requestId,
      });

      const results = await this.apiClient.searchOpinions(input);

      return this.success({
        count: results.count,
        results: results.results,
      });
    }, context);
  }
}
```

**Improvements**:

- ✅ **78 lines → 38 lines** (51% reduction)
- ✅ **Fully typed** (no `any` types)
- ✅ **No boilerplate** (validation, caching, error handling extracted)
- ✅ **Declarative** (decorators show intent)
- ✅ **Auto-generated schema** (from Zod)
- ✅ **Fallback support** (graceful degradation)

---

## 🎯 Conclusion

This roadmap provides a clear path to:

- **Improve type safety** (253 → <20 `any` types)
- **Reduce duplication** (40% code reduction)
- **Lower complexity** (no files >600 lines)
- **Enhance maintainability** (consistent patterns)

**Estimated Total Effort**: 4-6 days  
**Risk Level**: Low (incremental, testable)  
**Expected ROI**: High (long-term maintainability)

---

**Ready to begin Phase 1?** 🚀

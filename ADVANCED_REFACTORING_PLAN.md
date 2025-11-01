# Advanced Refactoring Plan - Phase 3

**Focus**: Type Safety, Performance, and Advanced Patterns  
**Priority**: High-impact improvements for production readiness  
**Estimated Effort**: 2-3 days

---

## 🎯 Discovered Opportunities

### Analysis Results
- **Remaining `any` types**: 21 instances
- **Complex functions**: Several 100+ line functions
- **Middleware patterns**: Could be more standardized
- **Test organization**: Could mirror src/ structure better
- **Performance**: Some optimization opportunities

---

## 🔴 Critical: Replace Remaining `any` Types (21 instances)

### 1.1 Middleware - Sanitization (9 instances)

**File**: `src/middleware/sanitization.ts`

**Current Issues**:
```typescript
sanitized: any;
sanitize(input: any, path: string = 'root'): SanitizationResult
private sanitizeValue(value: any, path: string, depth: number, result: SanitizationResult): any
```

**Proposed Fix**:
```typescript
// Define proper types
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
    // Type-safe implementation
  }
  
  private sanitizeValue(
    value: unknown, 
    path: string, 
    depth: number, 
    result: SanitizationResult
  ): SanitizableValue {
    // Recursive sanitization with proper types
  }
}
```

---

### 1.2 Middleware - Audit (4 instances)

**File**: `src/middleware/audit.ts`

**Current Issues**:
```typescript
requestArgs?: any;
responseData?: any;
private removeSensitiveFields(data: any): any
```

**Proposed Fix**:
```typescript
// Use Record for structured data
requestArgs?: Record<string, unknown>;
responseData?: unknown; // Or specific response type

private removeSensitiveFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  // Type-safe field removal
}
```

---

### 1.3 Infrastructure - OpenAPI Generator (2 instances)

**File**: `src/infrastructure/openapi-generator.ts`

**Current Issues**:
```typescript
public addPath(path: string, method: string, operation: any): void
private convertToYaml(obj: any, indent: number): string
```

**Proposed Fix**:
```typescript
// Define OpenAPI types
export interface OpenAPIOperation {
  summary?: string;
  description?: string;
  parameters?: OpenAPIParameter[];
  responses?: Record<string, OpenAPIResponse>;
  tags?: string[];
}

public addPath(path: string, method: string, operation: OpenAPIOperation): void {
  // Type-safe OpenAPI operations
}

private convertToYaml(obj: Record<string, unknown>, indent: number): string {
  // Type-safe YAML conversion
}
```

---

### 1.4 Infrastructure - Performance Monitor (4 instances)

**File**: `src/infrastructure/performance-monitor.ts`

**Current Issues**:
```typescript
data?: any;
metrics: any;
performance: any;
```

**Proposed Fix**:
```typescript
// Define specific types
export interface PerformanceData {
  operation: string;
  duration: number;
  memory?: NodeJS.MemoryUsage;
  custom?: Record<string, unknown>;
}

export interface PerformanceMetrics {
  requests: number;
  averageResponseTime: number;
  errorRate: number;
  // ... other metrics
}
```

---

### 1.5 Logger - Metadata (2 instances)

**File**: `src/infrastructure/logger.ts`

**Current Issues**:
```typescript
metadata?: Record<string, any>
```

**Proposed Fix**:
```typescript
// Use unknown for better type safety
metadata?: Record<string, unknown>

// Or create specific metadata type
export interface LogMetadata {
  requestId?: string;
  userId?: string;
  duration?: number;
  [key: string]: unknown;
}
```

---

## 🟡 High Priority: Extract Complex Functions

### 2.1 Bootstrap - registerToolHandlers()

**File**: `src/infrastructure/bootstrap.ts`  
**Current**: 178 lines, highly complex function

**Proposed Refactoring**:
```typescript
// Split into domain-specific registration
function registerSearchHandlers() {
  container.register('SearchOpinionsHandler', { ... });
  container.register('SearchCasesHandler', { ... });
}

function registerCaseHandlers() {
  container.register('GetCaseDetailsHandler', { ... });
  container.register('GetRelatedCasesHandler', { ... });
}

// ... other domain registrations

function registerToolHandlers(): void {
  registerSearchHandlers();
  registerCaseHandlers();
  registerOpinionHandlers();
  registerCourtHandlers();
  registerDocketHandlers();
  registerMiscellaneousHandlers();
  registerOralArgumentHandlers();
  registerEnhancedHandlers();
}
```

**Benefits**:
- Easier to read and maintain
- Each domain registration is isolated
- Can test domain registrations independently

---

### 2.2 Sanitization - sanitizeValue()

**File**: `src/middleware/sanitization.ts`  
**Current**: Complex recursive function with many cases

**Proposed Refactoring**:
```typescript
// Extract type-specific sanitizers
class ValueSanitizer {
  sanitizeString(value: string, path: string, result: SanitizationResult): string
  sanitizeArray(value: unknown[], path: string, depth: number, result: SanitizationResult): unknown[]
  sanitizeObject(value: object, path: string, depth: number, result: SanitizationResult): object
}

// Main sanitizer uses strategy pattern
private sanitizeValue(value: unknown, path: string, depth: number, result: SanitizationResult): unknown {
  if (typeof value === 'string') return this.valueSanitizer.sanitizeString(value, path, result);
  if (Array.isArray(value)) return this.valueSanitizer.sanitizeArray(value, path, depth, result);
  if (typeof value === 'object') return this.valueSanitizer.sanitizeObject(value, path, depth, result);
  // ...
}
```

---

## 🟢 Medium Priority: Create Missing Abstractions

### 3.1 Middleware Base Class

**Problem**: Middleware classes have similar patterns but no shared base

**Proposed Solution**:
```typescript
// src/middleware/base-middleware.ts
export abstract class BaseMiddleware {
  protected readonly logger: Logger;
  abstract readonly name: string;
  
  constructor(logger: Logger) {
    this.logger = logger.child(this.constructor.name);
  }
  
  abstract process(context: RequestContext, next: () => Promise<unknown>): Promise<unknown>;
  
  protected logProcess(message: string, metadata?: Record<string, unknown>): void {
    this.logger.debug(message, { middleware: this.name, ...metadata });
  }
}

// Usage
export class AuthenticationMiddleware extends BaseMiddleware {
  readonly name = 'authentication';
  
  async process(context: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
    this.logProcess('Processing authentication', { requestId: context.requestId });
    // ... auth logic
  }
}
```

**Benefits**:
- Consistent middleware interface
- Shared logging patterns
- Easier to add new middleware
- Better type safety

---

### 3.2 Response Builder Pattern

**Problem**: Handlers manually construct CallToolResult responses

**Proposed Solution**:
```typescript
// src/common/response-builder.ts
export class ResponseBuilder {
  static success(data: unknown, metadata?: Record<string, unknown>): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, data, ...metadata }, null, 2),
        },
      ],
    };
  }
  
  static error(message: string, details?: Record<string, unknown>): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: message, ...details }, null, 2),
        },
      ],
      isError: true,
    };
  }
  
  static paginated<T>(
    data: T[],
    pagination: { page: number; total: number; hasNext: boolean }
  ): CallToolResult {
    return this.success(data, { pagination });
  }
}
```

**Benefits**:
- Consistent response formatting
- Easier to modify response structure
- Better type safety
- Centralized response logic

---

### 3.3 Create Repository Pattern for API

**Problem**: CourtListenerAPI is large and does everything

**Proposed Solution**:
```typescript
// src/repositories/case-repository.ts
export class CaseRepository {
  constructor(
    private api: CourtListenerAPI,
    private cache: CacheManager
  ) {}
  
  async findById(id: CaseId): Promise<Case> {
    // Caching + API logic
  }
  
  async search(params: CaseSearchParams): Promise<PaginatedResult<Case>> {
    // Search logic
  }
}

// src/repositories/court-repository.ts
export class CourtRepository {
  async findById(id: CourtId): Promise<Court> { ... }
  async list(filters?: CourtFilters): Promise<Court[]> { ... }
}

// Use in handlers
export class GetCaseDetailsHandler extends BaseToolHandler {
  constructor(private caseRepo: CaseRepository) {
    super();
  }
  
  async execute(input: GetCaseInput): Promise<CallToolResult> {
    const caseData = await this.caseRepo.findById(brandCaseId(input.id));
    return ResponseBuilder.success(caseData);
  }
}
```

**Benefits**:
- Single Responsibility Principle
- Easier to test (mock repositories)
- Clearer separation of concerns
- Better code organization

---

## 🔵 Low Priority: Advanced Patterns

### 4.1 Result Type Everywhere

**Problem**: Some functions throw errors, others return Results inconsistently

**Proposed Solution**:
```typescript
// Standardize on Result type for all operations
async function fetchCase(id: CaseId): Promise<Result<Case, ApplicationError>> {
  try {
    const case = await api.get(`/cases/${id}`);
    return success(case);
  } catch (error) {
    return failure(ErrorFactory.fromUnknown(error, { caseId: id }));
  }
}

// Use in handlers
const result = await this.fetchCase(id);
if (result.success) {
  return ResponseBuilder.success(result.value);
} else {
  return ResponseBuilder.error(result.error.message, { code: result.error.code });
}
```

---

### 4.2 Add Event Emitter for Observability

**Proposed Solution**:
```typescript
// src/infrastructure/event-emitter.ts
export type EventType = 
  | 'request:started'
  | 'request:completed'
  | 'request:failed'
  | 'cache:hit'
  | 'cache:miss'
  | 'circuit:opened'
  | 'circuit:closed';

export interface Event {
  type: EventType;
  timestamp: Date;
  data: Record<string, unknown>;
}

export class EventEmitter {
  private listeners = new Map<EventType, Set<(event: Event) => void>>();
  
  on(type: EventType, handler: (event: Event) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }
  
  emit(type: EventType, data: Record<string, unknown>): void {
    const event: Event = { type, timestamp: new Date(), data };
    this.listeners.get(type)?.forEach(handler => handler(event));
  }
}

// Usage in server
const events = container.get<EventEmitter>('events');
events.on('request:started', (event) => {
  metrics.recordRequestStart();
});
```

---

### 4.3 Add Request/Response Interceptors

**Proposed Solution**:
```typescript
// src/infrastructure/interceptors.ts
export interface Interceptor {
  name: string;
  before?(context: RequestContext): Promise<void>;
  after?(context: RequestContext, result: unknown): Promise<unknown>;
  error?(context: RequestContext, error: Error): Promise<void>;
}

export class InterceptorChain {
  private interceptors: Interceptor[] = [];
  
  use(interceptor: Interceptor): this {
    this.interceptors.push(interceptor);
    return this;
  }
  
  async execute<T>(
    context: RequestContext,
    operation: () => Promise<T>
  ): Promise<T> {
    // Execute before interceptors
    for (const interceptor of this.interceptors) {
      await interceptor.before?.(context);
    }
    
    try {
      let result = await operation();
      
      // Execute after interceptors
      for (const interceptor of this.interceptors) {
        if (interceptor.after) {
          result = await interceptor.after(context, result) as T;
        }
      }
      
      return result;
    } catch (error) {
      // Execute error interceptors
      for (const interceptor of this.interceptors) {
        await interceptor.error?.(context, error as Error);
      }
      throw error;
    }
  }
}

// Built-in interceptors
export class LoggingInterceptor implements Interceptor {
  name = 'logging';
  
  constructor(private logger: Logger) {}
  
  async before(context: RequestContext): Promise<void> {
    this.logger.info('Request started', { requestId: context.requestId });
  }
  
  async after(context: RequestContext, result: unknown): Promise<unknown> {
    this.logger.info('Request completed', { requestId: context.requestId });
    return result;
  }
}

export class MetricsInterceptor implements Interceptor {
  name = 'metrics';
  
  constructor(private metrics: MetricsCollector) {}
  
  async after(context: RequestContext): Promise<unknown> {
    const duration = Date.now() - context.startTime;
    this.metrics.recordRequest(duration, false);
  }
}
```

---

### 4.4 Create Service Health Check Pattern

**Proposed Solution**:
```typescript
// src/infrastructure/health/health-check.interface.ts
export interface HealthCheckable {
  name: string;
  check(): Promise<HealthStatus>;
}

export interface HealthStatus {
  healthy: boolean;
  message?: string;
  details?: Record<string, unknown>;
  lastChecked: Date;
}

// Implementations
export class CacheHealthCheck implements HealthCheckable {
  name = 'cache';
  
  constructor(private cache: CacheManager) {}
  
  async check(): Promise<HealthStatus> {
    const stats = this.cache.getStats();
    return {
      healthy: true,
      details: stats,
      lastChecked: new Date(),
    };
  }
}

export class ApiHealthCheck implements HealthCheckable {
  name = 'court-listener-api';
  
  constructor(private api: CourtListenerAPI) {}
  
  async check(): Promise<HealthStatus> {
    try {
      await this.api.healthCheck(); // Ping endpoint
      return {
        healthy: true,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        message: 'API unreachable',
        details: { error: (error as Error).message },
        lastChecked: new Date(),
      };
    }
  }
}

// Aggregator
export class HealthCheckAggregator {
  private checks: HealthCheckable[] = [];
  
  register(check: HealthCheckable): void {
    this.checks.push(check);
  }
  
  async checkAll(): Promise<Record<string, HealthStatus>> {
    const results: Record<string, HealthStatus> = {};
    
    await Promise.all(
      this.checks.map(async (check) => {
        results[check.name] = await check.check();
      })
    );
    
    return results;
  }
  
  isHealthy(results: Record<string, HealthStatus>): boolean {
    return Object.values(results).every(status => status.healthy);
  }
}
```

---

## 📋 Implementation Priority

| Priority | Task | Files | Effort | Impact |
|----------|------|-------|--------|--------|
| 🔴 1 | Replace `any` in Sanitization | 1 | 2h | High |
| 🔴 2 | Replace `any` in Audit | 1 | 1h | High |
| 🔴 3 | Replace `any` in Logger | 1 | 1h | High |
| 🟡 4 | Replace `any` in OpenAPI | 1 | 2h | Medium |
| 🟡 5 | Replace `any` in Performance Monitor | 1 | 1h | Medium |
| 🟡 6 | Extract registerToolHandlers() | 1 | 2h | Medium |
| 🟡 7 | Create BaseMiddleware abstract class | 1 | 1h | Medium |
| 🟡 8 | Create ResponseBuilder | 1 | 1h | Medium |
| 🟢 9 | Create Repository Pattern | 8 | 4h | Low |
| 🟢 10 | Add Event Emitter | 1 | 2h | Low |
| 🟢 11 | Add Interceptors | 1 | 3h | Low |
| 🟢 12 | Enhanced Health Checks | 1 | 2h | Low |

---

## 🚀 Quick Wins (Start Here)

1. **Replace `any` in Logger** (1 hour)
   - Change metadata to `Record<string, unknown>`
   - High visibility, easy fix

2. **Create BaseMiddleware** (1 hour)
   - Extract common patterns
   - Improves all middleware

3. **Create ResponseBuilder** (1 hour)
   - Centralize response formatting
   - Used by all handlers

4. **Replace `any` in Sanitization** (2 hours)
   - Biggest type safety improvement
   - Critical for security

---

## 📝 Implementation Strategy

### Week 1: Type Safety
- Day 1: Replace `any` in Logger and Audit
- Day 2: Replace `any` in Sanitization
- Day 3: Replace `any` in OpenAPI and Performance Monitor

### Week 2: Abstractions
- Day 1: Create BaseMiddleware
- Day 2: Create ResponseBuilder
- Day 3: Extract registerToolHandlers()

### Week 3: Advanced Patterns (Optional)
- Day 1: Repository pattern
- Day 2: Event emitter
- Day 3: Interceptors and health checks

---

## 🎯 Expected Outcomes

### Type Safety
- **100% type-safe** - No `any` in production code
- **Runtime validation** - Type guards everywhere
- **Compile-time safety** - Strict TypeScript

### Code Quality
- **Reduced complexity** - Smaller, focused functions
- **Better abstraction** - Base classes and interfaces
- **Consistent patterns** - Shared abstractions

### Maintainability
- **Easier to modify** - Clear abstractions
- **Easier to test** - Smaller units
- **Easier to understand** - Better organization

---

## ⚠️ Considerations

### Breaking Changes
- Changing `any` to specific types may require caller updates
- Response format changes would be breaking
- Repository pattern would reorganize API client

### Testing
- Update tests for type changes
- Add tests for new abstractions
- Verify backwards compatibility

### Performance
- Event emitters add overhead (minimal)
- Interceptors add overhead (minimal)
- Type checking has no runtime cost

---

## 📚 References

- [TypeScript Best Practices](https://typescript-eslint.io/rules/)
- [Clean Code Principles](https://github.com/ryanmcdermott/clean-code-javascript)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)

---

**Ready to implement? Start with the Quick Wins!**


# Phase 2: Reduce Duplication - Started!

**Date**: November 3, 2025  
**Status**: 🔄 **IN PROGRESS**  
**Progress**: Decorators created (Step 1/4)

---

## 🎯 Phase 2 Goals

**Primary Goal**: Reduce code duplication by ~40% through pattern extraction

### Targets:
1. ✅ Create handler decorators for common patterns
2. 🔄 Apply decorators to existing handlers  
3. 📋 Extract pagination logic
4. 📋 Create common error handling utilities
5. 📋 Measure and validate code reduction

**Estimated Impact**: ~1,500 lines of code reduction

---

## ✅ What's Been Completed

### 1. Handler Decorators Created

**File**: `src/server/handler-decorators.ts` (237 lines)

Created four powerful decorators to eliminate repetitive patterns:

#### `@withCache({ ttl?: number, key?: string })`
Automatically handles caching logic that was repeated 32 times:
```typescript
// Before (repeated in every handler):
const cacheKey = 'handler_name';
const cached = context.cache?.get<any>(cacheKey, input);
if (cached) {
  context.logger.info('Served from cache', { requestId: context.requestId });
  return this.success(cached);
}
// ... do work ...
context.cache?.set(cacheKey, input, result, 3600);

// After (one line!):
@withCache({ ttl: 3600 })
async execute(input: TInput, context: ToolContext) {
  // Just implement core logic!
}
```

#### `@withTiming({ name?: string })`
Automatically handles timing/metrics tracking:
```typescript
// Before (repeated in every handler):
const timer = context.logger.startTimer('handler_name');
try {
  // ... work ...
  const duration = timer.end();
  context.metrics?.recordSuccess(duration, false);
} catch (error) {
  const duration = timer.endWithError(error);
  context.metrics?.recordFailure(duration);
}

// After (one line!):
@withTiming()
async execute(input: TInput, context: ToolContext) {
  // Just implement core logic!
}
```

#### `@withErrorHandling(message?: string)`
Automatically handles error logging and responses:
```typescript
// Before (repeated in every handler):
try {
  // ... work ...
} catch (error) {
  context.logger.error('Failed to...', error as Error, {
    requestId: context.requestId,
  });
  return this.error('Failed to...', {
    message: (error as Error).message,
  });
}

// After (one line!):
@withErrorHandling('Failed to fetch data')
async execute(input: TInput, context: ToolContext) {
  // Just implement core logic - errors handled automatically!
}
```

#### `@withDefaults(config?)`
Combines all three decorators into one:
```typescript
// Ultimate simplification!
@withDefaults({ cache: { ttl: 7200 } })
async execute(input: TInput, context: ToolContext) {
  // Just implement the core logic!
  // - Caching handled automatically
  // - Timing tracked automatically
  // - Errors logged automatically
  return this.success(result);
}
```

---

## 📊 Expected Impact

### Code Reduction by Handler Type:

**Simple Handlers** (e.g., `GetCaseDetailsHandler`):
- Before: ~30 lines (including boilerplate)
- After: ~15 lines (decorator + core logic)
- **Reduction**: ~15 lines per handler

**Complex Handlers** (e.g., `AdvancedSearchHandler`):
- Before: ~60 lines (including boilerplate)
- After: ~35 lines (decorator + core logic)
- **Reduction**: ~25 lines per handler

**Total Expected**:
- 32 handlers × ~20 lines average = **~640 lines removed**
- Additional pattern extraction = **~400 lines**
- **Total Phase 2**: ~1,000 lines reduction

---

## 🔄 Next Steps

### Step 2: Apply Decorators to Handlers

Domains to update:
- [ ] `src/domains/cases/handlers.ts` (3 handlers)
- [ ] `src/domains/courts/handlers.ts` (3 handlers)
- [ ] `src/domains/dockets/handlers.ts` (5 handlers)
- [ ] `src/domains/enhanced/handlers.ts` (8 handlers)
- [ ] `src/domains/miscellaneous/handlers.ts` (4 handlers)
- [ ] `src/domains/opinions/handlers.ts` (4 handlers)
- [ ] `src/domains/oral-arguments/handlers.ts` (2 handlers)
- [ ] `src/domains/search/handlers.ts` (3 handlers)

### Step 3: Extract Common Utilities

- [ ] Pagination utility
- [ ] Search parameter builder
- [ ] Response formatter
- [ ] Error message standardizer

### Step 4: Measure & Validate

- [ ] Run full test suite
- [ ] Measure actual line reduction
- [ ] Verify no performance regression
- [ ] Update documentation

---

## 📈 Progress Tracking

| Metric | Target | Current | Progress |
|--------|--------|---------|----------|
| Decorators created | 4 | 4 | ✅ 100% |
| Handlers updated | 32 | 0 | ⏳ 0% |
| Utilities extracted | 4 | 0 | ⏳ 0% |
| Lines reduced | ~1,000 | 0 | ⏳ 0% |
| Tests passing | 100% | TBD | ⏳ |

---

## 🎓 Design Principles

### Why Decorators?

1. **DRY Principle**: Write once, use everywhere
2. **Separation of Concerns**: Business logic separate from cross-cutting concerns
3. **Composability**: Decorators can be combined
4. **Maintainability**: Change behavior in one place
5. **Testability**: Core logic easier to test
6. **Type Safety**: Full TypeScript support

### Decorator Pattern Benefits:

```typescript
// Before: Boilerplate everywhere
class Handler1 { execute() { /* 30 lines with boilerplate */ } }
class Handler2 { execute() { /* 30 lines with boilerplate */ } }
class Handler3 { execute() { /* 30 lines with boilerplate */ } }
// Total: 90 lines, hard to maintain

// After: Boilerplate extracted
@withDefaults()
class Handler1 { execute() { /* 10 lines of core logic */ } }
@withDefaults()
class Handler2 { execute() { /* 10 lines of core logic */ } }
@withDefaults()
class Handler3 { execute() { /* 10 lines of core logic */ } }
// Total: 30 lines + 1 decorator definition (237 lines used by ALL)
// Saved: 60 lines for just 3 handlers!
```

---

## 🏗️ Architecture Improvements

### Before Phase 2:
```
Handler
├── validate() [boilerplate]
├── getSchema() [boilerplate]  ← Removed in Phase 1!
└── execute()
    ├── Caching logic [boilerplate]
    ├── Timing logic [boilerplate]
    ├── Error handling [boilerplate]
    └── Core business logic
```

### After Phase 1:
```
TypedToolHandler<Schema>
├── validate() [automatic]
├── getSchema() [automatic]
└── execute()
    ├── Caching logic [boilerplate]
    ├── Timing logic [boilerplate]
    ├── Error handling [boilerplate]
    └── Core business logic
```

### After Phase 2 (Goal):
```
@withDefaults()
TypedToolHandler<Schema>
├── validate() [automatic]
├── getSchema() [automatic]
└── execute()
    └── Core business logic ONLY!
```

**Result**: Handlers become pure business logic!

---

## 🔗 Related Documents

- `REFACTORING_ROADMAP.md` - Complete 6-phase plan
- `PHASE_1_100_PERCENT_COMPLETE.md` - Phase 1 completion
- `src/server/handler-decorators.ts` - Decorator implementation

---

## 💡 Example: Before & After

### Before Decorators:
```typescript
export class GetCaseDetailsHandler extends TypedToolHandler<typeof getCaseDetailsSchema> {
  async execute(input: z.infer<typeof getCaseDetailsSchema>, context: ToolContext) {
    // Timer setup
    const timer = context.logger.startTimer('get_case_details');
    
    try {
      // Caching check
      const cacheKey = 'case_details';
      const cached = context.cache?.get<any>(cacheKey, input);
      if (cached) {
        context.logger.info('Served from cache', { requestId: context.requestId });
        recordSuccess(context, timer, true);
        return this.success(cached);
      }
      
      // Core logic
      const caseDetails = await this.apiClient.getCaseDetails(input.cluster_id);
      
      // Caching save
      context.cache?.set(cacheKey, input, caseDetails, 3600);
      
      // Metrics
      recordSuccess(context, timer, false);
      return this.success(caseDetails);
    } catch (error) {
      // Error handling
      recordFailure(context, timer, error as Error);
      context.logger.error('Failed to fetch case details', error as Error, {
        clusterId: input.cluster_id,
        requestId: context.requestId,
      });
      return this.error('Failed to fetch case details', {
        message: (error as Error).message,
      });
    }
  }
}
```
**Lines**: ~35 lines (only 2 lines are core logic!)

### After Decorators:
```typescript
export class GetCaseDetailsHandler extends TypedToolHandler<typeof getCaseDetailsSchema> {
  @withDefaults({ cache: { ttl: 3600 } })
  async execute(input: z.infer<typeof getCaseDetailsSchema>, context: ToolContext) {
    // Core logic only!
    const caseDetails = await this.apiClient.getCaseDetails(input.cluster_id);
    return this.success(caseDetails);
  }
}
```
**Lines**: ~8 lines (all core logic!)

**Reduction**: 35 → 8 lines (**77% reduction!**)

---

## ✨ Phase 2 Started!

Decorators created and ready to eliminate ~1,000 lines of boilerplate! 🚀

*Last updated: November 3, 2025*


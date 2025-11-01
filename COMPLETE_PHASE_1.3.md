# Complete Phase 1.3 Migration Guide

**Current Progress**: 16/32 handlers (50%)  
**Remaining**: 16 handlers in 3 domains  
**Estimated Time**: 90-120 minutes

---

## 🎯 Quick Completion Guide

### Pattern to Apply

For **EVERY handler** in the remaining files, follow this exact pattern:

#### Step 1: Extract Zod Schemas (Top of File)
```typescript
// At the top, after imports
const handlerNameSchema = z.object({
  // Copy from existing validate() method
});
```

#### Step 2: Update Imports
```typescript
// Change
import { BaseToolHandler, Result } from '...';

// To
import { TypedToolHandler } from '...';
```

#### Step 3: Transform Each Handler
```typescript
// BEFORE
export class SomeHandler extends BaseToolHandler {
  validate(input: any): Result<any, Error> {
    // DELETE THIS ENTIRE METHOD
  }
  
  getSchema(): any {
    // DELETE THIS ENTIRE METHOD
  }
  
  async execute(input: any, context: ToolContext) {
    // Keep this, just update signature
  }
}

// AFTER
export class SomeHandler extends TypedToolHandler<typeof someSchema> {
  protected readonly schema = someSchema;
  
  async execute(
    input: z.infer<typeof someSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    // Same implementation
  }
}
```

#### Step 4: Fix Type Errors
Common fixes:
```typescript
// String → Number conversions
await this.apiClient.method(parseInt(input.id));

// Or keep as string if API accepts it
await this.apiClient.method(input.id);
```

---

## 📋 Remaining Files to Migrate

### 1. Dockets Domain (5 handlers)
**File**: `src/domains/dockets/handlers.ts` (447 lines)

Handlers:
1. `GetDocketsHandler`
2. `GetDocketHandler`  
3. `GetRecapDocumentsHandler`
4. `GetRecapDocumentHandler`
5. `GetDocketEntriesHandler`

**Time**: 40-50 minutes

---

### 2. Search Domain (3 handlers)
**File**: `src/domains/search/handlers.ts`

Handlers:
1. `SearchOpinionsHandler`
2. `AdvancedSearchHandler`
3. `SearchCasesHandler`

**Time**: 30-40 minutes

---

### 3. Enhanced Domain (8 handlers)
**File**: `src/domains/enhanced/handlers.ts` (871 lines!)

Handlers:
1. `GetComprehensiveCaseAnalysisHandler`
2. `GetComprehensiveJudgeProfileHandler`
3. `ValidateCitationsHandler`
4. `GetVisualizationDataHandler`
5. `GetFinancialDisclosureDetailsHandler`
6. `GetBankruptcyDataHandler`
7. `GetBulkDataHandler`
8. `GetEnhancedRECAPDataHandler`

**Time**: 60-80 minutes

---

## ⚡ Fast Migration Process

### Per Domain:

1. **Read entire file**
2. **Extract all Zod schemas to top** (before any class)
3. **Update imports** (remove `Result`, `BaseToolHandler`; add `TypedToolHandler`)
4. **For each handler**:
   - Change `extends BaseToolHandler` → `extends TypedToolHandler<typeof schema>`
   - Add `protected readonly schema = schemaName;`
   - Delete `validate()` method entirely
   - Delete `getSchema()` method entirely
   - Update `execute()` signature to use `z.infer<typeof schema>`
5. **Build**: `npm run build`
6. **Fix any type errors** (usually `parseInt()` needed)
7. **Test**: `npm run test:unit`
8. **Commit**: `git commit -m "feat(phase-1.3): migrate [domain] handlers"`

---

## 🔧 Common Patterns in Remaining Files

### Dockets
- All use `docket_id: z.union([z.string(), z.number()]).transform(String)`
- Most have pagination (page, page_size)

### Search  
- Complex schemas with many optional fields
- `.refine()` for custom validation
- `.superRefine()` for complex checks

### Enhanced
- Very large handlers (50-100 lines each)
- Complex transformation logic
- Multiple API calls per handler

---

## ✅ Testing After Each Domain

```bash
npm run build
npm run test:unit
git add -A
git commit -m "feat(phase-1.3): migrate [domain] handlers ([current]/32)"
```

---

## 📊 Expected Final Results

When complete:

- **32/32 handlers migrated** ✅
- **~96 `any` types eliminated** ✅
- **~960 lines of boilerplate removed** ✅
- **32 Zod schemas extracted** ✅
- **Full type safety across all tools** ✅

---

## 🎯 Success Criteria

After all migrations:

- [ ] Build passes: `npm run build`
- [ ] All tests pass: `npm run test:unit`
- [ ] No `any` types in `execute()` methods
- [ ] All handlers extend `TypedToolHandler`
- [ ] All schemas extracted to top of files

---

## 💡 Tips for Speed

1. **Do entire domain at once** (not handler-by-handler)
2. **Copy-paste the pattern** - it's identical for all
3. **Use search-replace** for repetitive changes
4. **Build after each domain** to catch errors early
5. **Commit frequently** to track progress

---

## 🚀 You've Got This!

You've already done 16/32 (50%) successfully. The pattern is proven and consistent. The remaining 16 handlers follow the exact same pattern!

**Estimated Completion**: 90-120 minutes from now

**Final Result**: Phase 1.3 COMPLETE! 🎉

---

## 📝 Commit Messages Template

```bash
# After Dockets
git commit -m "feat(phase-1.3): migrate dockets handlers (21/32 - 65.6%)"

# After Search  
git commit -m "feat(phase-1.3): migrate search handlers (24/32 - 75%)"

# After Enhanced
git commit -m "feat(phase-1.3): COMPLETE! All 32 handlers migrated (100%)

- Migrated final 8 enhanced handlers
- Eliminated ~96 'any' types total
- Removed ~960 lines of boilerplate
- Full type safety across all 32 tools

Phase 1.3 COMPLETE! 🎉"
```

---

**Ready to finish strong! 💪**


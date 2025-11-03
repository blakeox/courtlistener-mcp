# Complete Final 11 Handlers - Step-by-Step Guide

**Current**: 21/32 handlers (65.6%)  
**Target**: 32/32 handlers (100%)  
**Remaining**: 11 handlers in 2 domains

---

## 🎯 Quick Reference

### Progress Tracker
- [x] Opinions (4) ✅
- [x] Courts (3) ✅
- [x] Cases (3) ✅
- [x] Oral Arguments (2) ✅
- [x] Miscellaneous (4) ✅
- [x] Dockets (5) ✅
- [ ] **Search (3)** ← **NEXT (75% milestone)**
- [ ] **Enhanced (8)** ← **FINAL (100%!)**

---

## 📋 Search Domain (3 handlers)

### File: `src/domains/search/handlers.ts` (493 lines)

### Schemas to Extract

```typescript
// At top of file, after imports
const searchOpinionsSchema = z.object({
  query: z.string().optional(),
  q: z.string().optional(),
  court: z.string().optional(),
  judge: z.string().optional(),
  dateAfter: z.string().optional(),
  dateBefore: z.string().optional(),
  date_filed_after: z.string().optional(),
  date_filed_before: z.string().optional(),
  orderBy: z.string().optional(),
  order_by: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
}).transform((parsed) => ({
  query: parsed.query ?? parsed.q,
  court: parsed.court,
  judge: parsed.judge,
  date_filed_after: parsed.date_filed_after ?? parsed.dateAfter,
  date_filed_before: parsed.date_filed_before ?? parsed.dateBefore,
  order_by: parsed.order_by ?? parsed.orderBy ?? 'relevance',
  page: parsed.page ?? 1,
  page_size: parsed.page_size ?? parsed.pageSize ?? 20,
}));

const advancedSearchSchema = z.object({
  type: z.enum(['o', 'r', 'p', 'oa']).default('o'),
  query: z.string().min(1).optional(),
  court: z.string().optional(),
  judge: z.string().optional(),
  case_name: z.string().optional(),
  citation: z.string().optional(),
  docket_number: z.string().optional(),
  date_filed_after: z.string().optional(),
  date_filed_before: z.string().optional(),
  precedential_status: z.string().optional(),
  cited_lt: z.number().optional(),
  cited_gt: z.number().optional(),
  status: z.string().optional(),
  nature_of_suit: z.string().optional(),
  order_by: z.string().optional(),
  page: z.number().int().min(1).optional(),
  page_size: z.number().int().min(1).max(100).optional().default(20),
}).superRefine((value, ctx) => {
  const meaningfulKeys = [
    'query', 'court', 'judge', 'case_name', 'citation', 
    'docket_number', 'date_filed_after', 'date_filed_before', 
    'precedential_status', 'cited_lt', 'cited_gt', 'status', 'nature_of_suit',
  ] as const;

  const hasSearchInput = meaningfulKeys.some((key) => {
    const field = value[key];
    return field !== undefined && field !== null && field !== '';
  });

  if (!hasSearchInput) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one search parameter must be provided (e.g., query, court, citation).',
    });
  }
});

const searchCasesSchema = z.object({
  query: z.string().optional(),
  q: z.string().optional(),
  court: z.string().optional(),
  judge: z.string().optional(),
  case_name: z.string().optional(),
  citation: z.string().optional(),
  date_filed_after: z.string().optional(),
  date_filed_before: z.string().optional(),
  precedential_status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
}).transform((parsed) => ({
  query: parsed.query ?? parsed.q,
  court: parsed.court,
  judge: parsed.judge,
  case_name: parsed.case_name,
  citation: parsed.citation,
  date_filed_after: parsed.date_filed_after,
  date_filed_before: parsed.date_filed_before,
  precedential_status: parsed.precedential_status,
  page: parsed.page ?? 1,
  page_size: parsed.page_size ?? parsed.pageSize ?? 20,
}));
```

### Handler Migrations

**1. SearchOpinionsHandler**:
```typescript
export class SearchOpinionsHandler extends TypedToolHandler<typeof searchOpinionsSchema> {
  readonly name = 'search_opinions';
  readonly description = 'Search for legal opinions with various filters and parameters';
  readonly category = 'search';
  protected readonly schema = searchOpinionsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  // Delete validate() method - auto-handled
  // Delete getSchema() method - auto-generated
  
  async execute(
    input: z.infer<typeof searchOpinionsSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    // Keep exact same implementation
  }
}
```

**2. AdvancedSearchHandler**:
```typescript
export class AdvancedSearchHandler extends TypedToolHandler<typeof advancedSearchSchema> {
  readonly name = 'advanced_search';
  readonly description = 'Execute advanced legal research queries with multi-parameter filtering';
  readonly category = 'search';
  protected readonly schema = advancedSearchSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  // Delete validate() method
  // Delete getSchema() method
  
  async execute(
    input: z.infer<typeof advancedSearchSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    // Keep exact same implementation
  }
}
```

**3. SearchCasesHandler**: Same pattern

### Testing
```bash
npm run build
npm run test:unit
git commit -m "feat(phase-1.3): migrate search handlers (24/32 - 75%)"
```

---

## 📋 Enhanced Domain (8 handlers)

### File: `src/domains/enhanced/handlers.ts` (871 lines!)

This is the **largest and most complex** file. Take it slow, one handler at a time.

### Strategy

1. **Read entire file first**
2. **Identify all 8 handler classes**
3. **Extract schemas one by one**
4. **Migrate handlers one at a time**
5. **Test after each handler** (or after every 2-3)
6. **Commit frequently**

### Handler List

Line numbers (approximate):
1. `GetComprehensiveCaseAnalysisHandler` (~line 100)
2. `GetComprehensiveJudgeProfileHandler` (~line 200)
3. `ValidateCitationsHandler` (~line 300)
4. `GetVisualizationDataHandler` (~line 400)
5. `GetFinancialDisclosureDetailsHandler` (~line 500)
6. `GetBankruptcyDataHandler` (~line 600)
7. `GetBulkDataHandler` (~line 700)
8. `GetEnhancedRECAPDataHandler` (~line 800)

### Pattern for Enhanced Handlers

```typescript
// Extract schema
const comprehensiveCaseAnalysisSchema = z.object({
  cluster_id: z.union([z.string(), z.number()]).transform(String),
  include_authorities: z.boolean().optional().default(true),
  include_timeline: z.boolean().optional().default(true),
  // ... all fields from validate() method
});

// Convert handler
export class GetComprehensiveCaseAnalysisHandler extends TypedToolHandler<
  typeof comprehensiveCaseAnalysisSchema
> {
  readonly name = 'get_comprehensive_case_analysis';
  readonly description = '...';
  readonly category = 'analysis';
  protected readonly schema = comprehensiveCaseAnalysisSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  // Delete validate() and getSchema()
  
  async execute(
    input: z.infer<typeof comprehensiveCaseAnalysisSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    // Keep all the complex business logic
  }
}
```

### Testing After Enhanced
```bash
npm run build
npm run test:unit
git commit -m "feat(phase-1.3): COMPLETE! All 32 handlers migrated (100%)

Phase 1.3 COMPLETE! 🎉

Final stats:
- 32/32 handlers migrated
- ~96 'any' types eliminated
- ~960 lines of boilerplate removed
- 32 Zod schemas extracted
- Full type safety across all tools"
```

---

## ✅ Final Checklist

After completing all 32 handlers:

- [ ] Build passes: `npm run build`
- [ ] All/most tests pass: `npm run test:unit`
- [ ] No TypeScript errors
- [ ] All handlers extend `TypedToolHandler`
- [ ] All schemas extracted to top of files
- [ ] No `validate()` or `getSchema()` methods left
- [ ] All `execute()` methods have typed inputs
- [ ] Changes committed with clear message

---

## 🎊 Celebration Checklist

When Phase 1.3 is 100% complete:

- [ ] Update `PHASE_1_SUMMARY.md` with final stats
- [ ] Run full test suite
- [ ] Document any test fixes needed
- [ ] Merge to `dev` branch
- [ ] Create PR to `main`
- [ ] Begin Phase 2 planning! 🚀

---

## 📊 Expected Final Impact

| Metric | Value |
|--------|-------|
| Handlers Migrated | 32/32 (100%) |
| `any` Types Eliminated | ~96 |
| Boilerplate Removed | ~960 lines |
| Zod Schemas | 32 |
| Type Safety | 100% |

---

## 💡 Tips for Success

1. **Take breaks** - Enhanced domain is large
2. **Test frequently** - After each 2-3 handlers
3. **Commit often** - Save progress
4. **Use git blame** - See original logic if confused
5. **Keep transforms** - Don't lose normalization logic
6. **Trust the pattern** - It works!

---

## 🚀 You're Almost There!

- ✅ **65.6% complete**
- ✅ **Pattern proven**
- ✅ **Quality maintained**
- 📋 **Clear path forward**

**Only 11 handlers left!**

---

**Ready to finish strong! The finish line is in sight! 🏁**


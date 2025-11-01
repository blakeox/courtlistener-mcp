# TypeScript Migration Guide for Tests

## ✅ Setup Complete

I've set up TypeScript support for your tests! Here's what's been configured:

### 1. **Installed `tsx`** (Modern TypeScript Runner)
- Fast TypeScript execution without compilation
- Supports both `.js` and `.ts` files
- Works seamlessly with Node.js test runner

### 2. **Created `tsconfig.test.json`**
- Extends main `tsconfig.json`
- Includes both test files and source files
- Supports incremental migration (`.js` and `.ts` can coexist)

### 3. **Created Example TypeScript Test**
- `test/unit/test-cache.example.ts` - Shows how to write TypeScript tests

## 🚀 How to Run TypeScript Tests

### Option 1: Using tsx directly
```bash
npx tsx test/unit/test-cache.example.ts
```

### Option 2: Update test runner (recommended)

Update your test runner to handle both `.js` and `.ts` files:

```javascript
// In test/runners/run-unit-tests.js
const testFiles = fs.readdirSync(testDir)
  .filter(file => 
    (file.startsWith('test-') && (file.endsWith('.js') || file.endsWith('.ts')))
  );
```

Then run tests with:
```bash
NODE_OPTIONS="--loader tsx" npm run test:unit
```

Or add to package.json:
```json
{
  "scripts": {
    "test:unit:ts": "NODE_OPTIONS='--loader tsx' node test/runners/run-unit-tests.js"
  }
}
```

## 📝 Migration Steps

### Step 1: Migrate one test file at a time

1. Copy `.js` test to `.ts`
2. Add types to imports:
   ```typescript
   import type { CacheManager } from '../../src/infrastructure/cache.js';
   ```
3. Add types to mocks and variables
4. Replace `any` with proper types
5. Test the migration

### Step 2: Update test runner

Once tests are migrated, update the runner to prefer `.ts` files:

```javascript
// Prefer .ts files if both exist
.filter(file => {
  const tsVersion = file.replace('.js', '.ts');
  if (fs.existsSync(path.join(testDir, tsVersion))) {
    return false; // Skip .js if .ts exists
  }
  return true;
});
```

### Step 3: Update CI/CD

If you have CI/CD, ensure it can run TypeScript tests:

```yaml
# .github/workflows/ci.yml
- name: Install dependencies
  run: npm install

- name: Run tests
  run: NODE_OPTIONS="--loader tsx" npm run test:unit
```

## 🎯 Benefits You'll See Immediately

### 1. Type Safety in Tests
```typescript
// ❌ Before (JavaScript)
const cache = new CacheManager(config, logger);
cache.set('endpoint', {}, data); // No type checking

// ✅ After (TypeScript)
const cache = new CacheManager(config, logger);
cache.set<string>('endpoint', {}, data); // Type-safe!
```

### 2. Better IDE Support
- Autocomplete for test methods
- Type checking for mocks
- Go to definition works
- Better refactoring

### 3. Catch Errors Early
```typescript
// TypeScript catches this at compile time:
const result = cache.get<number>('endpoint', {});
result.toUpperCase(); // ❌ Error: number has no toUpperCase method
```

## 📊 Migration Priority

### High Priority (Migrate First)
1. **Unit tests** - Simple, clear benefit
2. **Test utilities** - Used by many tests
3. **Integration tests** - Critical for catching type issues

### Medium Priority
4. **Enterprise tests** - Complex but important
5. **Performance tests** - Less critical

### Low Priority (Optional)
6. **Scripts** - Can stay JavaScript
7. **Demo files** - Not production code

## 🔄 Incremental Migration Strategy

### Phase 1: Setup ✅ DONE
- TypeScript config for tests
- Example TypeScript test
- `tsx` installed

### Phase 2: Migrate Test Utilities
Start with shared test utilities - benefits all tests

### Phase 3: Migrate Unit Tests (One by one)
1. Start with simplest tests
2. Migrate related tests together
3. Test after each migration

### Phase 4: Update Test Runner
Make runner handle both `.js` and `.ts` gracefully

### Phase 5: Migrate Integration Tests
Same process as unit tests

## 💡 Tips

### 1. Use Type Imports
```typescript
// ✅ Good - Only imports types
import type { CacheManager } from '../../src/infrastructure/cache.js';

// ✅ Good - Runtime + types
import { CacheManager } from '../../dist/infrastructure/cache.js';
```

### 2. Type Your Mocks
```typescript
// ✅ Good
class MockLogger implements Logger {
  logs: Array<{ level: string; msg: string }> = [];
  // ... implement all Logger methods
}
```

### 3. Use Generic Types
```typescript
// ✅ Good - Type-safe cache operations
const result = cache.get<MyData>('endpoint', {});
```

## ❓ FAQ

### Q: Can I mix .js and .ts tests?
**A:** Yes! The config supports both during migration.

### Q: Do I need to compile tests?
**A:** No! `tsx` runs TypeScript directly.

### Q: Will this slow down tests?
**A:** No, `tsx` is very fast and caches compiled output.

### Q: What about existing JavaScript tests?
**A:** They continue to work! Migrate incrementally.

## 🎉 Ready to Start?

1. Try the example: `npx tsx test/unit/test-cache.example.ts`
2. Pick a simple test to migrate
3. Follow the example pattern
4. Test and verify

Happy migrating! 🚀


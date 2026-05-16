export const spaAuthVitestFiles = Object.freeze([
  'src/web-spa/src/__tests__/api.test.ts',
  'src/web-spa/src/__tests__/auth-provider.test.tsx',
  'src/web-spa/src/__tests__/auth-routing.test.tsx',
  'src/web-spa/src/__tests__/contexts.test.tsx',
  'src/web-spa/src/__tests__/hooks2.test.ts',
  'src/web-spa/src/__tests__/lib.test.ts',
  'src/web-spa/src/__tests__/pages.test.tsx',
  'src/web-spa/src/__tests__/mcp-runtime-readiness.test.ts',
  'src/web-spa/src/__tests__/shell.test.tsx',
  'src/web-spa/src/__tests__/shell-heartbeat.integration.test.tsx',
]);

export const spaAuthPlaywrightSpecs = Object.freeze([
  'src/web-spa/e2e/operator-console.spec.ts',
  'src/web-spa/e2e/auth-routing.spec.ts',
  'src/web-spa/e2e/real-auth-flow.spec.ts',
  'src/web-spa/e2e/session-recovery.spec.ts',
]);

export function buildSpaAuthVitestCommand() {
  return buildSpaVitestCommand(spaAuthVitestFiles);
}

export function buildSpaVitestCommand(filesOrArgs = []) {
  return [
    'pnpm',
    'exec',
    'vitest',
    'run',
    '--config',
    'src/web-spa/vitest.config.ts',
    ...filesOrArgs,
  ];
}

export function buildSpaAuthPlaywrightCommand() {
  return ['pnpm', 'exec', 'playwright', 'test', ...spaAuthPlaywrightSpecs];
}

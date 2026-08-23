import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.mcp.test.jsonc' },
      miniflare: {
        bindings: {
          COURTLISTENER_API_KEY: 'workers-runtime-test-key',
          CODEMODE_ENABLED: 'false',
        },
      },
    }),
  ],
  test: {
    include: ['test/workers/mcp-runtime.smoke.test.ts'],
  },
});

import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.edge.test.jsonc' },
      miniflare: {
        bindings: {
          COURTLISTENER_API_KEY: 'workers-runtime-test-key',
          CODEMODE_ENABLED: 'false',
        },
        serviceBindings: {
          MCP_SERVICE: 'courtlistener-mcp-mcp-test',
        },
        workers: [
          {
            name: 'courtlistener-mcp-mcp-test',
            scriptPath: '.tmp/workers-test/mcp/worker-mcp.js',
            modules: true,
            compatibilityDate: '2026-08-18',
            compatibilityFlags: ['nodejs_als'],
            bindings: {
              COURTLISTENER_API_KEY: 'workers-runtime-test-key',
              CODEMODE_ENABLED: 'false',
            },
            kvNamespaces: {
              ASYNC_JOBS_KV: '00000000000000000000000000000002',
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['test/workers/edge-mcp-binding.smoke.test.ts'],
  },
});

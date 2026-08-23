import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('MCP Worker runtime smoke', () => {
  it('runs inside workerd with the configured KV bindings', async () => {
    const runtimeEnv = env as unknown as {
      ASYNC_JOBS_KV: KVNamespace;
    };

    expect(runtimeEnv.ASYNC_JOBS_KV).toBeDefined();

    const key = `workers-runtime-${crypto.randomUUID()}`;
    await runtimeEnv.ASYNC_JOBS_KV.put(key, 'ok');
    await expect(runtimeEnv.ASYNC_JOBS_KV.get(key)).resolves.toBe('ok');
  });

  it('serves the MCP readiness contract from the Worker entrypoint', async () => {
    const runtimeExports = exports as unknown as {
      default: { fetch(input: string): Promise<Response> };
    };
    const response = await runtimeExports.default.fetch('https://mcp.test/ready');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ready',
      worker_role: 'mcp',
      checks: {
        runtime: { status: 'pass' },
        mcp_v2: { status: 'pass' },
        async_queue: { status: 'pass' },
      },
    });
  });
});

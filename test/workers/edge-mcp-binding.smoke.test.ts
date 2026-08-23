import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

type ReadinessPayload = {
  status?: string;
  worker_role?: string;
  checks?: {
    runtime?: { status?: string };
    mcp_service_binding?: { status?: string };
    mcp_worker?: { status?: string; details?: { worker_role?: string } };
  };
};

describe('Edge to MCP service binding', () => {
  it('probes the MCP Worker through MCP_SERVICE', async () => {
    const runtimeExports = exports as unknown as {
      default: { fetch(input: string): Promise<Response> };
    };
    const response = await runtimeExports.default.fetch('https://edge.test/ready');
    const payload = (await response.json()) as ReadinessPayload;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'ready',
      worker_role: 'edge',
      checks: {
        runtime: { status: 'pass' },
        mcp_service_binding: { status: 'pass' },
        mcp_worker: {
          status: 'pass',
          details: { worker_role: 'mcp' },
        },
      },
    });
  });
});

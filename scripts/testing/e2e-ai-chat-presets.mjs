#!/usr/bin/env node

/**
 * E2E verification for /api/ai-chat preset scenarios.
 *
 * Required env:
 *   E2E_BASE_URL
 *   E2E_API_TOKEN
 *
 * Optional env:
 *   E2E_MCP_TOKEN (defaults to E2E_API_TOKEN)
 */

const cfg = {
  baseUrl: requiredEnv('E2E_BASE_URL').replace(/\/+$/, ''),
  apiToken: requiredEnv('E2E_API_TOKEN').trim(),
  mcpToken: (process.env.E2E_MCP_TOKEN || requiredEnv('E2E_API_TOKEN')).trim(),
};

async function main() {
  console.log('Starting /api/ai-chat preset integration checks');
  console.log(`Base URL: ${cfg.baseUrl}`);

  const successScenarios = [
    {
      name: 'Broad case search preset',
      request: {
        message:
          'Find appellate cases discussing qualified immunity for police and summarize key trends.',
        toolName: 'search_cases',
        mode: 'cheap',
        testMode: true,
      },
      expectedTool: 'search_cases',
    },
    {
      name: 'Citation lookup preset',
      request: {
        message: '410 U.S. 113',
        toolName: 'lookup_citation',
        mode: 'cheap',
        testMode: true,
      },
      expectedTool: 'lookup_citation',
    },
    {
      name: 'Opinion trend preset',
      request: {
        message: 'Recent appellate opinions about qualified immunity in excessive force cases',
        toolName: 'search_opinions',
        mode: 'cheap',
        testMode: true,
      },
      expectedTool: 'search_opinions',
    },
  ];

  for (const scenario of successScenarios) {
    await step(scenario.name, async () => {
      const response = await callAiChat(scenario.request);
      assert(response.status === 200, `Expected 200, got ${response.status}: ${stringify(response.body)}`);
      assert(typeof response.body === 'object' && response.body !== null, 'Expected JSON object response body');

      const body = response.body;
      assert(body.tool === scenario.expectedTool, `Expected tool=${scenario.expectedTool}, got ${String(body.tool)}`);
      assert(body.mode === 'cheap', `Expected mode=cheap, got ${String(body.mode)}`);
      assert(body.test_mode === true, `Expected test_mode=true, got ${String(body.test_mode)}`);
      assert(typeof body.fallback_used === 'boolean', 'Expected fallback_used boolean');
      assert(typeof body.session_id === 'string' && body.session_id.length > 0, 'Expected non-empty session_id');
      assert(typeof body.ai_response === 'string' && body.ai_response.trim().length > 0, 'Expected non-empty ai_response');
      assert(body.mcp_result !== undefined, 'Expected mcp_result field');
    });
  }

  await step('Error handling: invalid request schema', async () => {
    const response = await callAiChat({
      message: 'Schema failure test',
      mcpToken: cfg.mcpToken,
      // invalid type on purpose
      testMode: 'yes',
    });
    assert(response.status === 400, `Expected 400, got ${response.status}: ${stringify(response.body)}`);
    assert(
      response.body?.error_code === 'invalid_request_schema',
      `Expected error_code=invalid_request_schema, got ${String(response.body?.error_code)}`,
    );
  });

  console.log('\nAll /api/ai-chat preset checks passed');
}

async function callAiChat(payload) {
  const response = await fetch(`${cfg.baseUrl}/api/ai-chat`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.apiToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mcpToken: cfg.mcpToken,
      mode: 'cheap',
      ...payload,
    }),
  });

  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function step(name, fn) {
  process.stdout.write(`- ${name} ... `);
  await fn();
  console.log('ok');
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

main().catch((error) => {
  console.error('\nPreset integration checks failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});


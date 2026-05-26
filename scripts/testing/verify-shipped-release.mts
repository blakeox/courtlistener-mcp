#!/usr/bin/env node
/**
 * Post-deploy smoke for recent search/courts/smart_search hardening.
 * Mock checks always run. Live CourtListener calls are optional and only run when
 * COURTLISTENER_API_KEY is set (local/CI). Hosted operators verify tools in Cursor or
 * the portal after signing in and supplying credentials in the Account UI.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ListCourtsHandler } from '../../src/domains/courts/handlers.ts';
import { LegalMCPServer } from '../../src/index.ts';
import { Logger } from '../../src/infrastructure/logger.ts';
import type { ToolContext } from '../../src/server/tool-handler.ts';

const hasApiKey = Boolean(process.env.COURTLISTENER_API_KEY?.trim());

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

class SilentLogger extends Logger {
  constructor() {
    super({ level: 'error', format: 'json', enabled: false }, 'Silent');
  }

  child(): SilentLogger {
    return new SilentLogger();
  }
}

function makeContext(): ToolContext {
  return {
    logger: new SilentLogger().child('VerifyShipped'),
    requestId: 'verify-shipped',
  };
}

async function callTool(
  server: LegalMCPServer,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  return server.handleToolCall({ name, arguments: args });
}

async function verifyListCourtsPaginationMock(): Promise<void> {
  const api = {
    async listCourts(params: Record<string, unknown>): Promise<{
      count: number;
      results: Array<{ id: string; full_name: string; jurisdiction: string }>;
    }> {
      assert(params.court_type === undefined, 'court_type must not be sent to API');
      return {
        count: 99,
        results: [
          { id: 'scotus', full_name: 'Supreme Court of the United States', jurisdiction: 'F' },
          { id: 'ca9', full_name: 'Court of Appeals for the Ninth Circuit', jurisdiction: 'F' },
        ],
      };
    },
  };

  const handler = new ListCourtsHandler(api);
  const validated = handler.validate({ court_type: 'supreme' });
  assert(validated.success, 'validation failed');
  if (!validated.success) {
    return;
  }

  const result = await handler.execute(validated.data, makeContext());
  const payload = JSON.parse(result.content[0].text) as {
    courts: Array<{ id: string }>;
    pagination: {
      count?: number;
      total_pages?: number;
      has_next?: boolean;
      nextCursor?: string;
    };
  };

  assert(payload.courts.length === 1, 'expected one supreme court after filter');
  assert(payload.courts[0].id === 'scotus', 'expected scotus');
  assert(payload.pagination.count === undefined, 'count should be omitted when court_type set');
  assert(
    payload.pagination.total_pages === undefined,
    'total_pages should be omitted when court_type set',
  );
  assert(payload.pagination.has_next === undefined, 'has_next should be omitted');
  assert(payload.pagination.nextCursor === undefined, 'nextCursor should be omitted');
}

async function verifyLiveTools(server: LegalMCPServer): Promise<void> {
  const citation = '410 U.S. 113';

  const lookup = await callTool(server, 'lookup_citation', { citation });
  assert(!lookup.isError, lookup.content?.[0]?.text ?? 'lookup_citation failed');
  const lookupText = lookup.content[0].text;
  assert(
    !lookupText.includes('401') && !lookupText.toLowerCase().includes('unauthorized'),
    'lookup_citation returned auth error',
  );

  const search = await callTool(server, 'search_cases', { citation, limit: 3 });
  assert(!search.isError, search.content?.[0]?.text ?? 'search_cases failed');
  const searchPayload = JSON.parse(search.content[0].text) as { results?: unknown[] };
  assert(
    Array.isArray(searchPayload.results) && searchPayload.results.length > 0,
    'search_cases by citation returned no results',
  );

  const smart = await callTool(server, 'smart_search', {
    query: 'Roe v Wade abortion',
    max_results: 2,
  });
  assert(!smart.isError, smart.content?.[0]?.text ?? 'smart_search failed');
  const smartText = smart.content[0].text;
  assert(!smartText.includes('undefined'), 'smart_search output contains undefined');
  assert(smartText.includes('Smart Search Results'), 'unexpected smart_search format');
}

async function main(): Promise<void> {
  const checks: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'list_courts pagination metadata (mock)',
      run: verifyListCourtsPaginationMock,
    },
  ];

  if (hasApiKey) {
    const server = new LegalMCPServer();
    checks.push({
      name: 'live CourtListener tools',
      run: () => verifyLiveTools(server),
    });
  }

  let failed = 0;
  for (const check of checks) {
    process.stdout.write(`⏳ ${check.name}... `);
    try {
      await check.run();
      process.stdout.write('ok\n');
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`FAIL\n   ${message}\n`);
    }
  }

  if (!hasApiKey) {
    console.log(
      '\n⚠️  Live CourtListener checks skipped (no COURTLISTENER_API_KEY in this shell).',
    );
    console.log(
      '   For hosted verification: sign in at /app/account, enter your credential in the UI, then test tools in Cursor.',
    );
  }

  if (failed > 0) {
    process.exitCode = 1;
    console.error(`\n${failed} check(s) failed.`);
    return;
  }

  console.log('\nAll verify-shipped-release checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

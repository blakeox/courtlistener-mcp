#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildLowCostSummary,
  buildMcpSystemPrompt,
  extractMcpContext,
  formatMcpDataForLlm,
} from '../../src/server/worker-ai-response-runtime.js';

describe('worker AI response runtime', () => {
  it('builds specialized court prompts', () => {
    const prompt = buildMcpSystemPrompt('list_courts', false);

    assert.match(prompt, /\*\*Courts Overview\*\*/);
    assert.match(prompt, /Court Listing/);
  });

  it('formats structured MCP search payloads', () => {
    const formatted = formatMcpDataForLlm('search_cases', {
      data: {
        summary: 'Two cases found',
        search_parameters: { query: 'qualified immunity' },
        pagination: { total_results: 2, current_page: 1, total_pages: 1 },
        results: [
          {
            case_name: 'Pearson v. Callahan',
            court: 'SCOTUS',
            date_filed: '2009-01-21',
            citation: '555 U.S. 223',
            citation_count: 120,
            absolute_url: '/opinion/123/pearson-v-callahan/',
          },
        ],
      },
    });

    assert.ok(formatted);
    assert.match(formatted ?? '', /Summary: Two cases found/);
    assert.match(formatted ?? '', /Pearson v\. Callahan/);
    assert.match(formatted ?? '', /555 U\.S\. 223/);
  });

  it('extracts readable context from content text payloads', () => {
    const context = extractMcpContext(
      'search_cases',
      {
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                data: {
                  results: [
                    {
                      case_name: 'Harlow v. Fitzgerald',
                      court: 'SCOTUS',
                      citation: '457 U.S. 800',
                    },
                  ],
                },
              }),
            },
          ],
        },
      },
      2000,
    );

    assert.match(context, /Tool: search_cases/);
    assert.match(context, /Harlow v\. Fitzgerald/);
  });

  it('falls back to a compact raw-data summary when formatting fails', () => {
    const summary = buildLowCostSummary('find standing cases', 'search_cases', {
      unexpected: true,
      nested: { count: 2 },
    });

    assert.match(summary, /Ran `search_cases` for: "find standing cases"/);
    assert.match(summary, /\*\*Raw Data\*\*:/);
  });
});

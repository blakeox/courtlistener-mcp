/**
 * Unit tests for pure functions from worker.ts.
 * These functions are module-scoped in the worker, so we duplicate them here
 * for direct unit testing. Keep in sync with src/worker.ts.
 */
import { describe, it, expect } from 'vitest';

// ─── Duplicated pure functions from worker.ts ───────────────────

function aiToolFromPrompt(message: string): { tool: string; reason: string } {
  const normalized = message.toLowerCase();
  if (/\d+\s+(u\.?s\.?|s\.?\s*ct\.?|f\.\s*\d|f\.?\s*supp)/i.test(message) || normalized.includes('v.')) {
    return { tool: 'lookup_citation', reason: 'Query contains a legal citation pattern (e.g., "v." or reporter reference).' };
  }
  if (normalized.includes('opinion') || normalized.includes('holding') || normalized.includes('ruling')) {
    return { tool: 'search_opinions', reason: 'Query mentions opinions, holdings, or rulings.' };
  }
  if (normalized.includes('judge') && (normalized.includes('profile') || normalized.includes('background') || normalized.includes('record'))) {
    return { tool: 'get_comprehensive_judge_profile', reason: 'Query asks for a judge profile or background.' };
  }
  if (normalized.includes('court') && (normalized.includes('list') || normalized.includes('which') || normalized.includes('all'))) {
    return { tool: 'list_courts', reason: 'Query asks to list or identify courts.' };
  }
  if (normalized.includes('docket') || normalized.includes('filing')) {
    return { tool: 'get_docket_entries', reason: 'Query mentions dockets or filings.' };
  }
  if (normalized.includes('citation') && (normalized.includes('valid') || normalized.includes('check') || normalized.includes('verify'))) {
    return { tool: 'validate_citations', reason: 'Query asks to validate or check citations.' };
  }
  if (normalized.includes('argument') || normalized.includes('precedent') || normalized.includes('legal analysis')) {
    return { tool: 'analyze_legal_argument', reason: 'Query involves legal argument analysis or precedent research.' };
  }
  return { tool: 'search_cases', reason: 'Default: general case search for broad legal queries.' };
}

function aiToolArguments(toolName: string, prompt: string): Record<string, unknown> {
  if (toolName === 'lookup_citation') {
    return { citation: prompt };
  }
  if (toolName === 'validate_citations') {
    return { text: prompt };
  }
  if (toolName === 'analyze_legal_argument') {
    return { argument: prompt, keywords: prompt.split(/\s+/).slice(0, 5) };
  }
  if (toolName === 'list_courts') {
    return {};
  }
  if (toolName === 'get_comprehensive_judge_profile' || toolName === 'get_judge') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { judge_id: idMatch[1] } : { query: prompt };
  }
  if (toolName === 'get_docket_entries') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { docket_id: idMatch[1] } : { query: prompt };
  }
  if (toolName === 'get_case_details' || toolName === 'get_comprehensive_case_analysis') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { cluster_id: idMatch[1] } : { query: prompt };
  }
  if (toolName === 'get_opinion_text') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { opinion_id: idMatch[1] } : { query: prompt };
  }
  if (toolName === 'get_citation_network') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { opinion_id: idMatch[1], depth: 2 } : { query: prompt };
  }
  return {
    query: prompt,
    page_size: 5,
    order_by: 'score desc',
  };
}

function buildLowCostSummary(
  message: string,
  toolName: string,
  mcpPayload: unknown,
): string {
  const payloadText = JSON.stringify(mcpPayload);
  const compact = payloadText.length > 1200 ? `${payloadText.slice(0, 1200)}...` : payloadText;
  return [
    `Summary: Ran \`${toolName}\` for your request.`,
    `User question: ${message}`,
    'What MCP returned (truncated):',
    compact,
    'Next follow-up query: Ask for a narrower court, date range, or citation for more precise results.',
  ].join('\n\n');
}

function extractMcpContext(toolName: string, mcpPayload: unknown, maxLen: number): string {
  try {
    const payload = mcpPayload as Record<string, unknown>;
    const result = payload?.result as Record<string, unknown> | undefined;
    const content = result?.content as Array<{ type?: string; text?: string }> | undefined;

    if (Array.isArray(content) && content.length > 0) {
      const texts = content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text!)
        .join('\n\n');
      if (texts.length > 0) {
        const trimmed = texts.length > maxLen ? `${texts.slice(0, maxLen)}... [truncated]` : texts;
        return `Tool: ${toolName}\n\nData returned:\n${trimmed}`;
      }
    }

    const raw = JSON.stringify(mcpPayload);
    return `Tool: ${toolName}\n\nRaw response:\n${raw.length > maxLen ? `${raw.slice(0, maxLen)}... [truncated]` : raw}`;
  } catch {
    const raw = JSON.stringify(mcpPayload);
    return `Tool: ${toolName}\n\nRaw response:\n${raw.slice(0, maxLen)}`;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasValidMcpRpcShape(payload: unknown): boolean {
  if (!isPlainObject(payload)) return false;
  if ('error' in payload && isPlainObject(payload.error)) return true;
  if ('result' in payload) return true;
  return false;
}

// ─── Tests ──────────────────────────────────────────────────────

describe('aiToolFromPrompt', () => {
  it('detects citation pattern with "v."', () => {
    const result = aiToolFromPrompt('Roe v. Wade');
    expect(result.tool).toBe('lookup_citation');
    expect(result.reason).toContain('citation');
  });

  it('detects citation pattern with U.S. reporter', () => {
    const result = aiToolFromPrompt('410 U.S. 113');
    expect(result.tool).toBe('lookup_citation');
  });

  it('detects citation pattern with F. Supp', () => {
    const result = aiToolFromPrompt('123 F. Supp 456');
    expect(result.tool).toBe('lookup_citation');
  });

  it('detects citation pattern with S. Ct.', () => {
    const result = aiToolFromPrompt('123 S.Ct. 456');
    expect(result.tool).toBe('lookup_citation');
  });

  it('detects opinion queries', () => {
    const result = aiToolFromPrompt('Find the opinion on free speech');
    expect(result.tool).toBe('search_opinions');
    expect(result.reason).toContain('opinions');
  });

  it('detects holding queries', () => {
    const result = aiToolFromPrompt('What was the holding in this case?');
    expect(result.tool).toBe('search_opinions');
  });

  it('detects ruling queries', () => {
    const result = aiToolFromPrompt('Recent ruling on data privacy');
    expect(result.tool).toBe('search_opinions');
  });

  it('detects judge profile queries', () => {
    const result = aiToolFromPrompt('Judge Smith profile and background');
    expect(result.tool).toBe('get_comprehensive_judge_profile');
    expect(result.reason).toContain('judge');
  });

  it('detects judge record queries', () => {
    const result = aiToolFromPrompt('What is judge Roberts record on civil rights');
    expect(result.tool).toBe('get_comprehensive_judge_profile');
  });

  it('detects list courts queries', () => {
    const result = aiToolFromPrompt('List all courts in the federal system');
    expect(result.tool).toBe('list_courts');
    expect(result.reason).toContain('courts');
  });

  it('detects which courts queries', () => {
    const result = aiToolFromPrompt('Which courts handle patent cases?');
    expect(result.tool).toBe('list_courts');
  });

  it('detects docket queries', () => {
    const result = aiToolFromPrompt('Show me the docket entries');
    expect(result.tool).toBe('get_docket_entries');
    expect(result.reason).toContain('docket');
  });

  it('detects filing queries', () => {
    const result = aiToolFromPrompt('Recent filings in this case');
    expect(result.tool).toBe('get_docket_entries');
  });

  it('detects citation validation queries', () => {
    const result = aiToolFromPrompt('Check if this citation is valid');
    expect(result.tool).toBe('validate_citations');
    expect(result.reason).toContain('validate');
  });

  it('detects verify citation queries', () => {
    const result = aiToolFromPrompt('Verify these citations for accuracy');
    expect(result.tool).toBe('validate_citations');
  });

  it('detects legal argument queries', () => {
    const result = aiToolFromPrompt('Analyze the legal argument for equal protection');
    expect(result.tool).toBe('analyze_legal_argument');
    expect(result.reason).toContain('argument');
  });

  it('detects precedent queries', () => {
    const result = aiToolFromPrompt('Find precedent for this issue');
    expect(result.tool).toBe('analyze_legal_argument');
  });

  it('detects legal analysis queries', () => {
    const result = aiToolFromPrompt('Provide a legal analysis of the Fourth Amendment');
    expect(result.tool).toBe('analyze_legal_argument');
  });

  it('defaults to search_cases for general queries', () => {
    const result = aiToolFromPrompt('Find cases about free speech in schools');
    expect(result.tool).toBe('search_cases');
    expect(result.reason).toContain('Default');
  });

  it('defaults to search_cases for empty-ish queries', () => {
    const result = aiToolFromPrompt('constitutional law');
    expect(result.tool).toBe('search_cases');
  });
});

describe('aiToolArguments', () => {
  it('returns citation for lookup_citation', () => {
    const result = aiToolArguments('lookup_citation', '410 U.S. 113');
    expect(result).toEqual({ citation: '410 U.S. 113' });
  });

  it('returns text for validate_citations', () => {
    const result = aiToolArguments('validate_citations', 'The court in 410 U.S. 113 held...');
    expect(result).toEqual({ text: 'The court in 410 U.S. 113 held...' });
  });

  it('returns argument and keywords for analyze_legal_argument', () => {
    const result = aiToolArguments('analyze_legal_argument', 'equal protection under the law');
    expect(result.argument).toBe('equal protection under the law');
    expect(result.keywords).toEqual(['equal', 'protection', 'under', 'the', 'law']);
  });

  it('limits keywords to 5 words', () => {
    const result = aiToolArguments('analyze_legal_argument', 'one two three four five six seven');
    expect((result.keywords as string[]).length).toBe(5);
  });

  it('returns empty object for list_courts', () => {
    expect(aiToolArguments('list_courts', 'anything')).toEqual({});
  });

  it('extracts judge_id from prompt for get_comprehensive_judge_profile', () => {
    const result = aiToolArguments('get_comprehensive_judge_profile', 'Judge with ID 12345');
    expect(result).toEqual({ judge_id: '12345' });
  });

  it('falls back to query for get_comprehensive_judge_profile without ID', () => {
    const result = aiToolArguments('get_comprehensive_judge_profile', 'Judge Roberts');
    expect(result).toEqual({ query: 'Judge Roberts' });
  });

  it('extracts judge_id for get_judge', () => {
    const result = aiToolArguments('get_judge', 'Get judge 999');
    expect(result).toEqual({ judge_id: '999' });
  });

  it('extracts docket_id for get_docket_entries', () => {
    const result = aiToolArguments('get_docket_entries', 'Docket 54321');
    expect(result).toEqual({ docket_id: '54321' });
  });

  it('falls back to query for get_docket_entries without ID', () => {
    const result = aiToolArguments('get_docket_entries', 'Smith v Jones');
    expect(result).toEqual({ query: 'Smith v Jones' });
  });

  it('extracts cluster_id for get_case_details', () => {
    const result = aiToolArguments('get_case_details', 'Case 67890');
    expect(result).toEqual({ cluster_id: '67890' });
  });

  it('extracts cluster_id for get_comprehensive_case_analysis', () => {
    const result = aiToolArguments('get_comprehensive_case_analysis', 'Analyze case 11111');
    expect(result).toEqual({ cluster_id: '11111' });
  });

  it('extracts opinion_id for get_opinion_text', () => {
    const result = aiToolArguments('get_opinion_text', 'Opinion 42');
    expect(result).toEqual({ opinion_id: '42' });
  });

  it('extracts opinion_id with depth for get_citation_network', () => {
    const result = aiToolArguments('get_citation_network', 'Network for opinion 55');
    expect(result).toEqual({ opinion_id: '55', depth: 2 });
  });

  it('falls back to query for get_citation_network without ID', () => {
    const result = aiToolArguments('get_citation_network', 'free speech network');
    expect(result).toEqual({ query: 'free speech network' });
  });

  it('returns default search params for unknown tools', () => {
    const result = aiToolArguments('search_cases', 'free speech');
    expect(result).toEqual({ query: 'free speech', page_size: 5, order_by: 'score desc' });
  });

  it('returns default search params for search_opinions', () => {
    const result = aiToolArguments('search_opinions', 'data privacy');
    expect(result).toEqual({ query: 'data privacy', page_size: 5, order_by: 'score desc' });
  });
});

describe('buildLowCostSummary', () => {
  it('includes tool name and user question', () => {
    const result = buildLowCostSummary('Find cases about privacy', 'search_cases', { result: {} });
    expect(result).toContain('search_cases');
    expect(result).toContain('Find cases about privacy');
  });

  it('includes follow-up suggestion', () => {
    const result = buildLowCostSummary('test', 'search_cases', {});
    expect(result).toContain('Next follow-up query');
  });

  it('truncates large payloads at 1200 chars', () => {
    const largePayload = { data: 'x'.repeat(2000) };
    const result = buildLowCostSummary('test', 'search_cases', largePayload);
    expect(result).toContain('...');
  });

  it('does not truncate small payloads', () => {
    const smallPayload = { data: 'small' };
    const result = buildLowCostSummary('test', 'search_cases', smallPayload);
    expect(result).not.toContain('...');
  });

  it('formats as sections separated by double newlines', () => {
    const result = buildLowCostSummary('q', 'tool', {});
    const sections = result.split('\n\n');
    expect(sections.length).toBe(5);
  });
});

describe('extractMcpContext', () => {
  it('extracts text content from standard MCP response', () => {
    const payload = {
      result: {
        content: [
          { type: 'text', text: 'Case: Roe v. Wade, 410 U.S. 113 (1973)' },
          { type: 'text', text: 'Holding: Right to privacy includes abortion.' },
        ],
      },
    };
    const result = extractMcpContext('search_cases', payload, 5000);
    expect(result).toContain('Tool: search_cases');
    expect(result).toContain('Data returned:');
    expect(result).toContain('Roe v. Wade');
    expect(result).toContain('Right to privacy');
  });

  it('joins multiple text content items with double newlines', () => {
    const payload = {
      result: {
        content: [
          { type: 'text', text: 'First item' },
          { type: 'text', text: 'Second item' },
        ],
      },
    };
    const result = extractMcpContext('tool', payload, 5000);
    expect(result).toContain('First item\n\nSecond item');
  });

  it('filters out non-text content types', () => {
    const payload = {
      result: {
        content: [
          { type: 'image', text: 'should not appear' },
          { type: 'text', text: 'visible text' },
        ],
      },
    };
    const result = extractMcpContext('tool', payload, 5000);
    expect(result).toContain('visible text');
    expect(result).not.toContain('should not appear');
  });

  it('truncates text content exceeding maxLen', () => {
    const longText = 'a'.repeat(200);
    const payload = {
      result: {
        content: [{ type: 'text', text: longText }],
      },
    };
    const result = extractMcpContext('tool', payload, 50);
    expect(result).toContain('... [truncated]');
    expect(result.length).toBeLessThan(longText.length);
  });

  it('falls back to raw JSON when no text content', () => {
    const payload = {
      result: {
        content: [],
      },
    };
    const result = extractMcpContext('tool', payload, 5000);
    expect(result).toContain('Raw response:');
  });

  it('falls back to raw JSON when result has no content array', () => {
    const payload = { result: { data: 'something' } };
    const result = extractMcpContext('tool', payload, 5000);
    expect(result).toContain('Raw response:');
    expect(result).toContain('something');
  });

  it('falls back to raw JSON for non-standard payload', () => {
    const payload = { error: { code: -32600, message: 'Invalid' } };
    const result = extractMcpContext('tool', payload, 5000);
    expect(result).toContain('Raw response:');
    expect(result).toContain('Invalid');
  });

  it('truncates raw JSON fallback exceeding maxLen', () => {
    const payload = { data: 'x'.repeat(200) };
    const result = extractMcpContext('tool', payload, 50);
    expect(result).toContain('... [truncated]');
  });

  it('handles null payload gracefully', () => {
    const result = extractMcpContext('tool', null, 5000);
    expect(result).toContain('Tool: tool');
    expect(result).toContain('null');
  });
});

describe('isPlainObject', () => {
  it('returns true for plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ key: 'val' })).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(isPlainObject([])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isPlainObject('string')).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});

describe('hasValidMcpRpcShape', () => {
  it('returns true for result payloads', () => {
    expect(hasValidMcpRpcShape({ result: { content: [] } })).toBe(true);
    expect(hasValidMcpRpcShape({ result: null })).toBe(true);
  });

  it('returns true for error payloads', () => {
    expect(hasValidMcpRpcShape({ error: { code: -32600, message: 'Invalid' } })).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(hasValidMcpRpcShape([])).toBe(false);
  });

  it('returns false for null', () => {
    expect(hasValidMcpRpcShape(null)).toBe(false);
  });

  it('returns false for empty objects', () => {
    expect(hasValidMcpRpcShape({})).toBe(false);
  });

  it('returns false when error is not an object', () => {
    expect(hasValidMcpRpcShape({ error: 'string error' })).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(hasValidMcpRpcShape('string')).toBe(false);
    expect(hasValidMcpRpcShape(123)).toBe(false);
  });
});

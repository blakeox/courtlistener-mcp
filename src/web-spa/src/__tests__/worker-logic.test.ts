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
    return { argument: prompt, search_query: prompt };
  }
  if (toolName === 'list_courts') {
    return {};
  }
  if (toolName === 'get_comprehensive_judge_profile' || toolName === 'get_judge') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { judge_id: idMatch[1] } : { judge_id: '1' };
  }
  if (toolName === 'get_docket_entries') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { docket: idMatch[1] } : { docket: '1' };
  }
  if (toolName === 'get_case_details' || toolName === 'get_comprehensive_case_analysis') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { cluster_id: idMatch[1] } : { cluster_id: '1' };
  }
  if (toolName === 'get_opinion_text') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { opinion_id: idMatch[1] } : { opinion_id: '1' };
  }
  if (toolName === 'get_citation_network') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { opinion_id: idMatch[1], depth: 2 } : { opinion_id: '1', depth: 2 };
  }
  if (toolName === 'smart_search') {
    return { query: prompt, max_results: 5 };
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
  try {
    const payload = mcpPayload as Record<string, unknown>;
    const result = payload?.result as Record<string, unknown> | undefined;
    const content = result?.content as Array<{ type?: string; text?: string }> | undefined;
    if (Array.isArray(content) && content.length > 0) {
      const textItem = content.find((c) => c.type === 'text' && c.text);
      if (textItem?.text) {
        const parsed = JSON.parse(textItem.text);
        if (parsed && typeof parsed === 'object') {
          const formatted = formatMcpDataForLlm(toolName, parsed);
          if (formatted) {
            return [
              `**Summary**: Searched CourtListener using \`${toolName}\` for: "${message}"`,
              '',
              `**What MCP Returned**:`,
              formatted.slice(0, 3000),
              '',
              '**Suggested Follow-up**: Try narrowing by court, date range, or specific citation for more targeted results.',
            ].join('\n');
          }
        }
      }
    }
  } catch { /* fall through */ }

  const payloadText = JSON.stringify(mcpPayload);
  const compact = payloadText.length > 1200 ? `${payloadText.slice(0, 1200)}...` : payloadText;
  return [
    `**Summary**: Ran \`${toolName}\` for: "${message}"`,
    '',
    '**What MCP Returned** (raw):',
    compact,
    '',
    '**Suggested Follow-up**: Try narrowing by court, date range, or specific citation for more targeted results.',
  ].join('\n');
}

function extractMcpContext(toolName: string, mcpPayload: unknown, maxLen: number): string {
  try {
    const payload = mcpPayload as Record<string, unknown>;
    const result = payload?.result as Record<string, unknown> | undefined;
    const content = result?.content as Array<{ type?: string; text?: string }> | undefined;

    if (Array.isArray(content) && content.length > 0) {
      const textItem = content.find((c) => c.type === 'text' && c.text);
      if (textItem?.text) {
        try {
          const parsed = JSON.parse(textItem.text);
          if (parsed && typeof parsed === 'object') {
            const formatted = formatMcpDataForLlm(toolName, parsed);
            if (formatted) {
              const trimmed = formatted.length > maxLen ? `${formatted.slice(0, maxLen)}... [truncated]` : formatted;
              return `Tool: ${toolName}\n\n${trimmed}`;
            }
          }
        } catch {
          const texts = content
            .filter((c) => c.type === 'text' && c.text)
            .map((c) => c.text!)
            .join('\n\n');
          if (texts.length > 0) {
            const trimmed = texts.length > maxLen ? `${texts.slice(0, maxLen)}... [truncated]` : texts;
            return `Tool: ${toolName}\n\nData returned:\n${trimmed}`;
          }
        }
      }
    }

    const raw = JSON.stringify(mcpPayload);
    return `Tool: ${toolName}\n\nRaw response:\n${raw.length > maxLen ? `${raw.slice(0, maxLen)}... [truncated]` : raw}`;
  } catch {
    const raw = JSON.stringify(mcpPayload);
    return `Tool: ${toolName}\n\nRaw response:\n${raw.slice(0, maxLen)}`;
  }
}

function formatMcpDataForLlm(toolName: string, data: Record<string, unknown>): string | null {
  const lines: string[] = [];
  const results = data.data as Record<string, unknown> | unknown[] | undefined;
  const pagination = data.pagination as Record<string, unknown> | undefined;

  if (results && typeof results === 'object' && !Array.isArray(results)) {
    const nested = results as Record<string, unknown>;
    const summary = nested.summary as string | undefined;
    const items = nested.results as unknown[] | undefined;
    const searchParams = nested.search_parameters as Record<string, unknown> | undefined;
    const innerPagination = nested.pagination as Record<string, unknown> | undefined;

    // Handle analysis results nested under data.analysis (e.g., analyze_legal_argument)
    const nestedAnalysis = nested.analysis as Record<string, unknown> | undefined;
    if (nestedAnalysis && typeof nestedAnalysis === 'object') {
      if (nestedAnalysis.summary) lines.push(`Analysis: ${nestedAnalysis.summary}`);
      if (nestedAnalysis.query_used) lines.push(`Query: ${nestedAnalysis.query_used}`);
      if (typeof nestedAnalysis.total_found === 'number') lines.push(`Total opinions found: ${nestedAnalysis.total_found}`);

      const topCases = nestedAnalysis.top_cases as unknown[] | undefined;
      if (Array.isArray(topCases) && topCases.length > 0) {
        lines.push(`\nTop ${topCases.length} relevant cases:`);
        for (let i = 0; i < topCases.length; i++) {
          lines.push(formatSearchResult(i + 1, topCases[i] as Record<string, unknown>));
        }
      }
    }

    if (summary) lines.push(`Summary: ${summary}`);
    if (searchParams?.query) lines.push(`Search query: ${searchParams.query}`);

    const pag = innerPagination || pagination;
    if (pag) {
      lines.push(`Total results: ${pag.totalResults ?? pag.total_results ?? 'unknown'}, Page ${pag.currentPage ?? pag.current_page ?? 1} of ${pag.totalPages ?? pag.total_pages ?? '?'}`);
    }

    if (Array.isArray(items) && items.length > 0) {
      lines.push(`\nTop ${items.length} results:`);
      for (let i = 0; i < items.length; i++) {
        const item = items[i] as Record<string, unknown>;
        lines.push(formatSearchResult(i + 1, item));
      }
    }
  }

  if (Array.isArray(results) && results.length > 0) {
    if (pagination) {
      lines.push(`Total results: ${pagination.totalResults ?? pagination.total_results ?? 'unknown'}, Page ${pagination.currentPage ?? pagination.current_page ?? 1}`);
    }
    lines.push(`\nTop ${results.length} results:`);
    for (let i = 0; i < results.length; i++) {
      const item = results[i] as Record<string, unknown>;
      lines.push(formatSearchResult(i + 1, item));
    }
  }

  // Analysis results (e.g., analyze_legal_argument)
  if (data.analysis && typeof data.analysis === 'object') {
    const analysis = data.analysis as Record<string, unknown>;
    if (analysis.summary) lines.push(`Analysis: ${analysis.summary}`);
    if (analysis.query_used) lines.push(`Query: ${analysis.query_used}`);
    if (typeof analysis.total_found === 'number') lines.push(`Total opinions found: ${analysis.total_found}`);

    const topCases = analysis.top_cases as unknown[] | undefined;
    if (Array.isArray(topCases) && topCases.length > 0) {
      lines.push(`\nTop ${topCases.length} relevant cases:`);
      for (let i = 0; i < topCases.length; i++) {
        const item = topCases[i] as Record<string, unknown>;
        lines.push(formatSearchResult(i + 1, item));
      }
    } else if (!lines.some(l => l.startsWith('Top '))) {
      lines.push(JSON.stringify(analysis, null, 2));
    }
  }

  if (lines.length === 0) return null;
  return lines.join('\n');
}

function formatSearchResult(num: number, item: Record<string, unknown>): string {
  const parts: string[] = [];
  const caseName = item.case_name || item.caseName || item.name || item.case_name_short || '';
  const court = item.court || item.court_id || '';
  const dateFiled = item.date_filed || item.dateFiled || '';
  const citation =
    item.federal_cite_one || item.state_cite_one || item.neutral_cite ||
    item.citation || item.citation_string || '';
  const citationCount = item.citation_count ?? item.citationCount;
  const status = item.precedential_status || item.status || '';
  const url = item.absolute_url || item.url || '';
  const snippet = item.snippet || item.summary || item.syllabus || '';

  parts.push(`${num}. ${caseName || 'Untitled'}`);
  if (court) parts.push(`   Court: ${court}`);
  if (dateFiled) parts.push(`   Date: ${dateFiled}`);
  if (citation) parts.push(`   Citation: ${citation}`);
  if (citationCount !== undefined && citationCount !== null) parts.push(`   Cited ${citationCount} times`);
  if (status) parts.push(`   Status: ${status}`);
  if (url) parts.push(`   URL: https://www.courtlistener.com${url}`);
  if (snippet) {
    const cleanSnippet = String(snippet).replace(/<[^>]+>/g, '').slice(0, 300);
    parts.push(`   Snippet: ${cleanSnippet}`);
  }

  return parts.join('\n');
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

  it('returns argument and search_query for analyze_legal_argument', () => {
    const result = aiToolArguments('analyze_legal_argument', 'equal protection under the law');
    expect(result.argument).toBe('equal protection under the law');
    expect(result.search_query).toBe('equal protection under the law');
  });

  it('passes full prompt as both argument and search_query', () => {
    const result = aiToolArguments('analyze_legal_argument', 'one two three four five six seven');
    expect(result.argument).toBe('one two three four five six seven');
    expect(result.search_query).toBe('one two three four five six seven');
  });

  it('returns empty object for list_courts', () => {
    expect(aiToolArguments('list_courts', 'anything')).toEqual({});
  });

  it('extracts judge_id from prompt for get_comprehensive_judge_profile', () => {
    const result = aiToolArguments('get_comprehensive_judge_profile', 'Judge with ID 12345');
    expect(result).toEqual({ judge_id: '12345' });
  });

  it('falls back to judge_id 1 for get_comprehensive_judge_profile without ID', () => {
    const result = aiToolArguments('get_comprehensive_judge_profile', 'Judge Roberts');
    expect(result).toEqual({ judge_id: '1' });
  });

  it('extracts judge_id for get_judge', () => {
    const result = aiToolArguments('get_judge', 'Get judge 999');
    expect(result).toEqual({ judge_id: '999' });
  });

  it('extracts docket for get_docket_entries', () => {
    const result = aiToolArguments('get_docket_entries', 'Docket 54321');
    expect(result).toEqual({ docket: '54321' });
  });

  it('falls back to docket 1 for get_docket_entries without ID', () => {
    const result = aiToolArguments('get_docket_entries', 'Smith v Jones');
    expect(result).toEqual({ docket: '1' });
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

  it('falls back to opinion_id 1 for get_citation_network without ID', () => {
    const result = aiToolArguments('get_citation_network', 'free speech network');
    expect(result).toEqual({ opinion_id: '1', depth: 2 });
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
    expect(result).toContain('Suggested Follow-up');
  });

  it('truncates large raw payloads at 1200 chars', () => {
    const largePayload = { data: 'x'.repeat(2000) };
    const result = buildLowCostSummary('test', 'search_cases', largePayload);
    expect(result).toContain('...');
  });

  it('formats structured search results when available', () => {
    const payload = {
      result: {
        content: [{ type: 'text', text: JSON.stringify({
          success: true,
          data: { summary: 'Found 5 results', results: [
            { case_name: 'Roe v. Wade', court: 'scotus', date_filed: '1973-01-22', federal_cite_one: '410 U.S. 113' },
          ] },
        }) }],
      },
    };
    const result = buildLowCostSummary('abortion rights', 'search_cases', payload);
    expect(result).toContain('Roe v. Wade');
    expect(result).toContain('410 U.S. 113');
    expect(result).toContain('scotus');
  });

  it('falls back to raw JSON for non-structured data', () => {
    const result = buildLowCostSummary('test', 'search_cases', { random: 'data' });
    expect(result).toContain('**What MCP Returned** (raw)');
  });
});

describe('extractMcpContext', () => {
  it('formats structured search results from JSON content', () => {
    const payload = {
      result: {
        content: [{ type: 'text', text: JSON.stringify({
          success: true,
          data: {
            summary: 'Found 42 results',
            results: [
              { case_name: 'Roe v. Wade', court: 'scotus', date_filed: '1973-01-22', federal_cite_one: '410 U.S. 113', citation_count: 5000 },
              { case_name: 'Griswold v. Connecticut', court: 'scotus', date_filed: '1965-06-07', federal_cite_one: '381 U.S. 479' },
            ],
            pagination: { totalResults: 42, currentPage: 1, totalPages: 9 },
          },
        }) }],
      },
    };
    const result = extractMcpContext('search_cases', payload, 5000);
    expect(result).toContain('Tool: search_cases');
    expect(result).toContain('Roe v. Wade');
    expect(result).toContain('410 U.S. 113');
    expect(result).toContain('Griswold v. Connecticut');
    expect(result).toContain('Found 42 results');
    expect(result).toContain('Cited 5000 times');
  });

  it('falls back to raw text for non-JSON content', () => {
    const payload = {
      result: {
        content: [
          { type: 'text', text: 'Case: Roe v. Wade, 410 U.S. 113 (1973)' },
        ],
      },
    };
    const result = extractMcpContext('search_cases', payload, 5000);
    expect(result).toContain('Tool: search_cases');
    expect(result).toContain('Roe v. Wade');
  });

  it('filters out non-text content types', () => {
    const payload = {
      result: {
        content: [
          { type: 'image', text: 'should not appear' },
          { type: 'text', text: 'visible text that is not JSON' },
        ],
      },
    };
    const result = extractMcpContext('tool', payload, 5000);
    expect(result).toContain('visible text');
    expect(result).not.toContain('should not appear');
  });

  it('truncates content exceeding maxLen', () => {
    const payload = {
      result: {
        content: [{ type: 'text', text: 'a'.repeat(200) }],
      },
    };
    const result = extractMcpContext('tool', payload, 50);
    expect(result).toContain('... [truncated]');
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

  it('handles null payload gracefully', () => {
    const result = extractMcpContext('tool', null, 5000);
    expect(result).toContain('Tool: tool');
    expect(result).toContain('null');
  });
});

describe('formatMcpDataForLlm', () => {
  it('formats nested search results with case details', () => {
    const data = {
      success: true,
      data: {
        summary: 'Found 10 results',
        results: [
          { case_name: 'Test v. Case', court: '3rd Cir.', date_filed: '2024-01-15', federal_cite_one: '100 F.3d 200', citation_count: 42, precedential_status: 'Published', absolute_url: '/opinion/12345/' },
        ],
        search_parameters: { query: 'privacy' },
        pagination: { totalResults: 10, currentPage: 1, totalPages: 2 },
      },
    };
    const result = formatMcpDataForLlm('search_opinions', data);
    expect(result).toContain('Found 10 results');
    expect(result).toContain('Search query: privacy');
    expect(result).toContain('Test v. Case');
    expect(result).toContain('3rd Cir.');
    expect(result).toContain('100 F.3d 200');
    expect(result).toContain('Cited 42 times');
    expect(result).toContain('courtlistener.com/opinion/12345/');
  });

  it('formats direct array results', () => {
    const data = {
      success: true,
      data: [
        { case_name: 'Direct Case', court: 'scotus' },
      ],
      pagination: { totalResults: 1, currentPage: 1 },
    };
    const result = formatMcpDataForLlm('search_cases', data);
    expect(result).toContain('Direct Case');
    expect(result).toContain('scotus');
  });

  it('returns null for unrecognized structures', () => {
    const data = { success: true };
    const result = formatMcpDataForLlm('tool', data);
    expect(result).toBeNull();
  });

  it('strips HTML from snippets', () => {
    const data = {
      success: true,
      data: {
        results: [{ case_name: 'HTML Case', snippet: '<em>highlighted</em> text <b>bold</b>' }],
      },
    };
    const result = formatMcpDataForLlm('search_cases', data);
    expect(result).toContain('highlighted text bold');
    expect(result).not.toContain('<em>');
  });

  it('formats nested analysis results (analyze_legal_argument)', () => {
    const data = {
      success: true,
      data: {
        analysis: {
          top_cases: [
            { case_name: 'Tinker v. Des Moines', court: 'scotus', date_filed: '1969-02-24', citation: '393 U.S. 503', citation_count: 500 },
          ],
          total_found: 150,
          query_used: 'student free speech',
          summary: 'Found 150 relevant opinions for: "student free speech"',
        },
      },
    };
    const result = formatMcpDataForLlm('analyze_legal_argument', data);
    expect(result).toContain('Found 150 relevant opinions');
    expect(result).toContain('Query: student free speech');
    expect(result).toContain('Total opinions found: 150');
    expect(result).toContain('Tinker v. Des Moines');
    expect(result).toContain('393 U.S. 503');
    expect(result).toContain('Cited 500 times');
  });
});

describe('formatSearchResult', () => {
  it('formats all available fields', () => {
    const item = {
      case_name: 'Test v. Case',
      court: 'scotus',
      date_filed: '2024-01-15',
      federal_cite_one: '100 U.S. 200',
      citation_count: 10,
      precedential_status: 'Published',
      absolute_url: '/opinion/123/',
      snippet: 'A test snippet about the case.',
    };
    const result = formatSearchResult(1, item);
    expect(result).toContain('1. Test v. Case');
    expect(result).toContain('Court: scotus');
    expect(result).toContain('Date: 2024-01-15');
    expect(result).toContain('Citation: 100 U.S. 200');
    expect(result).toContain('Cited 10 times');
    expect(result).toContain('Status: Published');
    expect(result).toContain('courtlistener.com/opinion/123/');
    expect(result).toContain('Snippet: A test snippet');
  });

  it('handles missing fields gracefully', () => {
    const result = formatSearchResult(3, {});
    expect(result).toContain('3. Untitled');
    expect(result).not.toContain('Court:');
    expect(result).not.toContain('Date:');
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

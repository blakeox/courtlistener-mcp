export function buildMcpSystemPrompt(toolName: string, hasHistory: boolean): string {
  const commonRules = [
    'ACCURACY RULES:',
    '- ONLY cite names, dates, and details that appear in the data below.',
    '- NEVER invent or hallucinate information not present in the data.',
    '- If data is limited, acknowledge that and work with what you have.',
    '- Quote directly from the data when relevant.',
  ];

  const followUp = hasHistory ? 'Reference prior conversation context when relevant.' : '';

  if (toolName === 'list_courts' || toolName === 'get_court') {
    return [
      'You are an expert legal research analyst with access to CourtListener, a comprehensive legal database.',
      'You have been given REAL court data retrieved from CourtListener. Present this data clearly and completely.',
      '',
      ...commonRules,
      '',
      'FORMAT your response with these sections:',
      '**Courts Overview**: A 1-2 sentence summary of what was found.',
      '**Court Listing**: Present ALL courts from the data in a clear, organized format grouped by jurisdiction type (Federal, State, etc.). Include court name, jurisdiction, and any other available details.',
      '**Suggested Follow-up**: One specific follow-up query to explore further.',
      followUp,
    ].filter(Boolean).join('\n');
  }

  if (toolName.includes('judge')) {
    return [
      'You are an expert legal research analyst with access to CourtListener, a comprehensive legal database.',
      'You have been given REAL judge data retrieved from CourtListener. Present this data clearly.',
      '',
      ...commonRules,
      '',
      'FORMAT your response with these sections:',
      '**Judge Profile**: Present the judge information from the data — name, court, appointment details, and any available background.',
      '**Notable Details**: Any significant details from the data about their career or decisions.',
      '**Suggested Follow-up**: One specific follow-up query to explore further.',
      followUp,
    ].filter(Boolean).join('\n');
  }

  if (toolName.includes('docket')) {
    return [
      'You are an expert legal research analyst with access to CourtListener, a comprehensive legal database.',
      'You have been given REAL docket data retrieved from CourtListener. Present this data clearly.',
      '',
      ...commonRules,
      '',
      'FORMAT your response with these sections:',
      '**Docket Summary**: Summarize the docket — case name, court, parties, status.',
      '**Key Filings**: List the most important entries with dates and descriptions.',
      '**Suggested Follow-up**: One specific follow-up query to explore further.',
      followUp,
    ].filter(Boolean).join('\n');
  }

  if (toolName === 'lookup_citation' || toolName === 'validate_citations' || toolName === 'get_citation_network') {
    return [
      'You are an expert legal research analyst with access to CourtListener, a comprehensive legal database.',
      'You have been given REAL citation data retrieved from CourtListener. Analyze and present it clearly.',
      '',
      ...commonRules,
      '',
      'FORMAT your response with these sections:',
      '**Citation Details**: Present the citation information — case name, court, date, and full citation.',
      '**Significance**: Explain the importance of this case based on citation count and other available data.',
      '**Suggested Follow-up**: One specific follow-up query to explore further.',
      followUp,
    ].filter(Boolean).join('\n');
  }

  return [
    'You are an expert legal research analyst with access to CourtListener, a comprehensive legal database, via MCP tools.',
    'You have been given REAL case data retrieved from CourtListener. Your job is to ANALYZE this data and provide substantive legal insight.',
    '',
    'ANALYSIS INSTRUCTIONS:',
    '- Synthesize the case data into a coherent legal analysis that directly answers the user\'s question.',
    '- Identify key legal principles, trends, and holdings from the returned cases.',
    '- Explain how the cases relate to each other and to the user\'s query.',
    '- Highlight the most important or frequently-cited cases and explain WHY they matter.',
    '- Note any circuit splits, evolving standards, or notable dissents if apparent from the data.',
    '',
    ...commonRules,
    '',
    'FORMAT your response with these sections:',
    '**Legal Analysis**: A substantive 3-5 sentence analysis answering the user\'s question, synthesizing findings from the case data.',
    '**Key Cases Found**: The 3-5 most relevant cases with their citations, courts, dates, and a brief note on why each matters.',
    '**Legal Landscape**: 1-2 sentences on the broader legal landscape — are courts aligned? Is the law settled or evolving?',
    '**Suggested Follow-up**: One specific follow-up query to deepen the research.',
    followUp,
  ].filter(Boolean).join('\n');
}

export function buildLowCostSummary(
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
              `**Legal Analysis**: CourtListener search via \`${toolName}\` returned the following results for: "${message}"`,
              '',
              '**Key Cases Found**:',
              formatted.slice(0, 3000),
              '',
              '**Legal Landscape**: This is a fallback summary — the AI analysis model was unavailable. The raw case data above provides the actual court records for your research.',
              '',
              '**Suggested Follow-up**: Try narrowing by court, date range, or specific citation for more targeted results.',
            ].join('\n');
          }
        }
      }
    }
  } catch {
    // fall through
  }

  const payloadText = JSON.stringify(mcpPayload);
  const compact = payloadText.length > 1200 ? `${payloadText.slice(0, 1200)}...` : payloadText;
  return [
    `**Legal Analysis**: Ran \`${toolName}\` for: "${message}"`,
    '',
    '**Raw Data**:',
    compact,
    '',
    '**Suggested Follow-up**: Try narrowing by court, date range, or specific citation for more targeted results.',
  ].join('\n');
}

export function extractMcpContext(toolName: string, mcpPayload: unknown, maxLen: number): string {
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
            .map((c) => c.text as string)
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

export function formatMcpDataForLlm(toolName: string, data: Record<string, unknown>): string | null {
  const lines: string[] = [];
  const results = data.data as Record<string, unknown> | unknown[] | undefined;
  const pagination = data.pagination as Record<string, unknown> | undefined;

  if (results && typeof results === 'object' && !Array.isArray(results)) {
    const nested = results as Record<string, unknown>;
    const summary = nested.summary as string | undefined;
    const items = nested.results as unknown[] | undefined;
    const searchParams = nested.search_parameters as Record<string, unknown> | undefined;
    const innerPagination = nested.pagination as Record<string, unknown> | undefined;
    const nestedAnalysis = nested.analysis as Record<string, unknown> | undefined;
    if (nestedAnalysis && typeof nestedAnalysis === 'object') {
      if (nestedAnalysis.summary) lines.push(`Analysis: ${nestedAnalysis.summary}`);
      if (nestedAnalysis.query_used) lines.push(`Query: ${nestedAnalysis.query_used}`);
      if (typeof nestedAnalysis.total_found === 'number') lines.push(`Total opinions found: ${nestedAnalysis.total_found}`);

      const topCases = nestedAnalysis.top_cases as unknown[] | undefined;
      if (Array.isArray(topCases) && topCases.length > 0) {
        lines.push(`\nTop ${topCases.length} relevant cases:`);
        for (let i = 0; i < topCases.length; i += 1) {
          lines.push(formatSearchResult(i + 1, topCases[i] as Record<string, unknown>));
        }
      }
    }

    const courts = nested.courts as unknown[] | undefined;
    if (Array.isArray(courts) && courts.length > 0) {
      lines.push(`\n${courts.length} courts found:`);
      for (let i = 0; i < courts.length; i += 1) {
        lines.push(formatCourtResult(i + 1, courts[i] as Record<string, unknown>));
      }
    }

    const judges = nested.judges as unknown[] | undefined;
    if (Array.isArray(judges) && judges.length > 0) {
      lines.push(`\n${judges.length} judges found:`);
      for (let i = 0; i < judges.length; i += 1) {
        const judge = judges[i] as Record<string, unknown>;
        const name =
          judge.name_full
          || judge.name
          || `${judge.name_first || ''} ${judge.name_last || ''}`.trim()
          || 'Unknown';
        const court = judge.court || '';
        const born = judge.date_dob || '';
        const appointed = judge.date_nominated || judge.date_appointed || '';
        const parts = [`${i + 1}. ${name}`];
        if (court) parts.push(`Court: ${court}`);
        if (born) parts.push(`Born: ${born}`);
        if (appointed) parts.push(`Appointed: ${appointed}`);
        lines.push(parts.join(' | '));
      }
    }

    if (summary) lines.push(`Summary: ${summary}`);
    if (searchParams?.query) lines.push(`Search query: ${searchParams.query}`);

    const page = innerPagination || pagination;
    if (page) {
      lines.push(
        `Total results: ${page.totalResults ?? page.total_results ?? 'unknown'}, Page ${page.currentPage ?? page.current_page ?? 1} of ${page.totalPages ?? page.total_pages ?? '?'}`,
      );
    }

    if (Array.isArray(items) && items.length > 0) {
      lines.push(`\nTop ${items.length} results:`);
      for (let i = 0; i < items.length; i += 1) {
        lines.push(formatSearchResult(i + 1, items[i] as Record<string, unknown>));
      }
    }
  }

  if (Array.isArray(results) && results.length > 0) {
    if (pagination) {
      lines.push(
        `Total results: ${pagination.totalResults ?? pagination.total_results ?? 'unknown'}, Page ${pagination.currentPage ?? pagination.current_page ?? 1}`,
      );
    }
    lines.push(`\nTop ${results.length} results:`);
    for (let i = 0; i < results.length; i += 1) {
      lines.push(formatSearchResult(i + 1, results[i] as Record<string, unknown>));
    }
  }

  if (data.analysis && typeof data.analysis === 'object') {
    const analysis = data.analysis as Record<string, unknown>;
    if (analysis.summary) lines.push(`Analysis: ${analysis.summary}`);
    if (analysis.query_used) lines.push(`Query: ${analysis.query_used}`);
    if (typeof analysis.total_found === 'number') lines.push(`Total opinions found: ${analysis.total_found}`);

    const topCases = analysis.top_cases as unknown[] | undefined;
    if (Array.isArray(topCases) && topCases.length > 0) {
      lines.push(`\nTop ${topCases.length} relevant cases:`);
      for (let i = 0; i < topCases.length; i += 1) {
        lines.push(formatSearchResult(i + 1, topCases[i] as Record<string, unknown>));
      }
    } else if (!lines.some((line) => line.startsWith('Top '))) {
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
    item.federal_cite_one || item.state_cite_one || item.neutral_cite || item.citation || item.citation_string || '';
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

function formatCourtResult(num: number, court: Record<string, unknown>): string {
  const name = court.full_name || court.short_name || court.name || 'Unknown Court';
  const id = court.id || '';
  const jurisdiction = court.jurisdiction || '';
  const citationStr = court.citation_string || '';
  const inUse = court.in_use;
  const startDate = court.start_date || '';
  const url = court.url || court.resource_uri || '';

  const parts = [`${num}. ${name}`];
  if (id) parts.push(`   ID: ${id}`);
  if (jurisdiction) parts.push(`   Jurisdiction: ${jurisdiction}`);
  if (citationStr) parts.push(`   Citation format: ${citationStr}`);
  if (startDate) parts.push(`   Established: ${startDate}`);
  if (typeof inUse === 'boolean') parts.push(`   Active: ${inUse ? 'Yes' : 'No'}`);
  if (url) parts.push(`   URL: ${url}`);
  return parts.join('\n');
}

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from '../../common/zod.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { withDefaults } from '../../server/handler-decorators.js';
import { AdvancedSearchParams, type OpinionCluster } from '../../types.js';
import {
  buildSmartSearchParamUserPrompt,
  type LlmParamGenerator,
  SMART_SEARCH_PARAM_SYSTEM_PROMPT,
} from '../../server/llm-param-generator.js';
const smartSearchSchema = z.object({
  query: z.string().describe('Natural language query describing what you are looking for'),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('Maximum number of results to return'),
});

type SearchOpinionResult = OpinionCluster & {
  caseName?: string;
  dateFiled?: string;
  citationCount?: number;
  court_id?: string;
  name?: string;
  url?: string;
};

function hasCitationCount(result: SearchOpinionResult): boolean {
  const count = result.citation_count ?? result.citationCount;
  return count !== undefined && count !== null;
}

const SMART_SEARCH_ENRICH_CONCURRENCY = 5;

async function enrichSmartSearchResults(
  api: CourtListenerAPI,
  results: SearchOpinionResult[],
): Promise<SearchOpinionResult[]> {
  const enriched = [...results];

  for (let offset = 0; offset < results.length; offset += SMART_SEARCH_ENRICH_CONCURRENCY) {
    const batch = results.slice(offset, offset + SMART_SEARCH_ENRICH_CONCURRENCY);
    await Promise.all(
      batch.map(async (result, batchIndex) => {
        const index = offset + batchIndex;
        if (hasCitationCount(result) || typeof result.id !== 'number') {
          return;
        }
        try {
          const cluster = await api.getOpinionCluster(result.id);
          enriched[index] = {
            ...result,
            citation_count: cluster.citation_count,
            absolute_url: result.absolute_url || cluster.absolute_url,
            case_name: result.case_name || cluster.case_name,
            date_filed: result.date_filed || cluster.date_filed,
            court: result.court || cluster.court,
          };
        } catch {
          // Keep search payload when cluster detail is unavailable.
        }
      }),
    );
  }

  return enriched;
}

function formatSmartSearchOpinionLine(result: SearchOpinionResult): string {
  const caseName =
    result.case_name || result.caseName || result.case_name_short || result.name || 'Untitled';
  const dateFiled = result.date_filed || result.dateFiled || 'Date unknown';
  const court = result.court || result.court_id || 'Court unknown';
  const citationCount = result.citation_count ?? result.citationCount;
  const citationLabel =
    citationCount !== undefined && citationCount !== null
      ? `${citationCount} cites`
      : 'Citation count unavailable';
  const rawUrl = result.absolute_url || result.url || '';
  const url = rawUrl.startsWith('http')
    ? rawUrl
    : rawUrl
      ? `https://www.courtlistener.com${rawUrl}`
      : 'URL unavailable';

  return `- ${caseName} (${dateFiled}) [${court}]\n  Citation: ${citationLabel}\n  URL: ${url}`;
}

function resolveParamGenerator(context: ToolContext): LlmParamGenerator | undefined {
  if (context.sampling) {
    const sampling = context.sampling;
    return {
      createMessage: async (messages, options) => {
        const samplingOptions =
          options?.maxTokens !== undefined || options?.systemPrompt !== undefined
            ? {
                ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
                ...(options.systemPrompt !== undefined
                  ? { systemPrompt: options.systemPrompt }
                  : {}),
              }
            : undefined;
        const result = await sampling.createMessage(messages, samplingOptions);
        const block = result.content;
        if (block.type !== 'text') {
          return { content: { type: 'text', text: '' } };
        }
        return {
          content: {
            type: 'text',
            text: block.text,
          },
        };
      },
    };
  }
  return context.llmParamGenerator;
}

export class SmartSearchHandler extends TypedToolHandler<typeof smartSearchSchema> {
  name = 'smart_search';
  description =
    'Intelligently search for cases using natural language. Uses an LLM to optimize search parameters.';
  category = 'enhanced';
  protected schema = smartSearchSchema;

  constructor(private readonly api: CourtListenerAPI) {
    super();
  }

  @withDefaults()
  async execute(
    args: z.infer<typeof smartSearchSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const paramGenerator = resolveParamGenerator(context);
    if (!paramGenerator) {
      return {
        content: [
          {
            type: 'text',
            text: 'Smart search requires MCP client sampling or Workers AI on the hosted server. Configure COURTLISTENER_API_KEY and ensure the Worker AI binding is available.',
          },
        ],
        isError: true,
      };
    }

    const samplingResult = await paramGenerator.createMessage(
      [
        {
          role: 'user',
          content: {
            type: 'text',
            text: buildSmartSearchParamUserPrompt(args.query),
          },
        },
      ],
      {
        maxTokens: 500,
        systemPrompt: SMART_SEARCH_PARAM_SYSTEM_PROMPT,
      },
    );

    let searchParams: Partial<AdvancedSearchParams> = {};
    try {
      const textContent = samplingResult.content.type === 'text' ? samplingResult.content.text : '';
      const jsonStr = textContent.replace(/```json\n?|\n?```/g, '').trim();
      searchParams = JSON.parse(jsonStr);
    } catch (error) {
      context.logger.error('Failed to parse smart search parameter JSON', error as Error);
      searchParams = { q: args.query };
    }

    const apiParams: AdvancedSearchParams = {
      q: searchParams.q || args.query,
      type: (searchParams.type as 'o' | 'r' | 'p' | 'oa') || 'o',
      order_by: searchParams.order_by || 'score desc',
    };

    if (searchParams.court) apiParams.court = searchParams.court;
    if (searchParams.judge) apiParams.judge = searchParams.judge;
    if (searchParams.date_filed_after) apiParams.date_filed_after = searchParams.date_filed_after;
    if (searchParams.date_filed_before)
      apiParams.date_filed_before = searchParams.date_filed_before;
    if (searchParams.precedential_status) apiParams.status = searchParams.precedential_status;

    const results = await this.api.searchOpinions(apiParams);
    const limitedResults = await enrichSmartSearchResults(
      this.api,
      results.results.slice(0, args.max_results) as SearchOpinionResult[],
    );

    return {
      content: [
        {
          type: 'text',
          text:
            `Smart Search Results for: "${args.query}"\nGenerated Parameters: ${JSON.stringify(apiParams, null, 2)}\n\nFound ${results.count} results. Showing top ${limitedResults.length}:\n\n` +
            limitedResults
              .map((result) => formatSmartSearchOpinionLine(result as SearchOpinionResult))
              .join('\n\n'),
        },
      ],
    };
  }
}

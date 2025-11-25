import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CourtListenerAPI } from '../../courtlistener.js';
import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { withDefaults } from '../../server/handler-decorators.js';
import { AdvancedSearchParams } from '../../types.js';

const smartSearchSchema = z.object({
  query: z.string().describe('Natural language query describing what you are looking for'),
  max_results: z.number().int().min(1).max(20).default(5).describe('Maximum number of results to return'),
});

export class SmartSearchHandler extends TypedToolHandler<typeof smartSearchSchema> {
  name = 'smart_search';
  description = 'Intelligently search for cases using natural language. Uses an LLM to optimize search parameters.';
  category = 'enhanced';
  protected schema = smartSearchSchema;

  constructor(private readonly api: CourtListenerAPI) {
    super();
  }

  @withDefaults()
  async execute(
    args: z.infer<typeof smartSearchSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    if (!context.sampling) {
      return {
        content: [
          {
            type: 'text',
            text: 'Sampling is not enabled on this server. Cannot perform smart search.',
          },
        ],
        isError: true,
      };
    }

    // 1. Use sampling to convert natural language to search parameters
    const samplingResult = await context.sampling.createMessage(
      [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `You are an expert legal researcher. Convert the following natural language query into specific CourtListener search parameters.
            
Query: "${args.query}"

Available parameters:
- q: Full text search query
- type: 'o' (opinion), 'd' (docket), 'r' (recap)
- order_by: 'score desc', 'dateFiled desc', 'dateFiled asc'
- court: Array of court IDs (e.g., 'scotus', 'ca9')
- judge: Judge name
- filed_after: Date (YYYY-MM-DD)
- filed_before: Date (YYYY-MM-DD)
- precedential_status: 'Precedential', 'Non-Precedential', 'Errata', 'Separate Opinion', 'In-chambers'

Return ONLY a JSON object with the parameters. Do not include markdown formatting or explanation.`,
          },
        },
      ],
      {
        maxTokens: 500,
        systemPrompt: 'You are a precise legal search parameter generator.',
      }
    );

    let searchParams: Partial<AdvancedSearchParams> = {};
    try {
      const textContent =
        samplingResult.content.type === 'text' ? samplingResult.content.text : '';
      // Strip markdown code blocks if present
      const jsonStr = textContent.replace(/```json\n?|\n?```/g, '').trim();
      searchParams = JSON.parse(jsonStr);
    } catch (error) {
      context.logger.error('Failed to parse sampling result', error as Error);
      // Fallback to simple text search
      searchParams = { q: args.query };
    }

    // 2. Execute search using the generated parameters
    // Ensure we respect the max_results limit
    // Note: CourtListener API uses 'page' and implicit page size, but we can slice results
    
    // Map parameters to API call
    // We'll use the searchOpinions method from the API
    
    // Clean up params
    const apiParams: AdvancedSearchParams = {
      q: searchParams.q || args.query,
      type: (searchParams.type as 'o' | 'r' | 'p' | 'oa') || 'o',
      order_by: searchParams.order_by || 'score desc',
    };

    if (searchParams.court) apiParams.court = searchParams.court;
    if (searchParams.judge) apiParams.judge = searchParams.judge;
    if (searchParams.date_filed_after) apiParams.date_filed_after = searchParams.date_filed_after;
    if (searchParams.date_filed_before) apiParams.date_filed_before = searchParams.date_filed_before;
    if (searchParams.precedential_status) apiParams.status = searchParams.precedential_status;

    const results = await this.api.searchOpinions(apiParams);

    // 3. Return results
    const limitedResults = results.results.slice(0, args.max_results);

    return {
      content: [
        {
          type: 'text',
          text: `Smart Search Results for: "${args.query}"\nGenerated Parameters: ${JSON.stringify(apiParams, null, 2)}\n\nFound ${results.count} results. Showing top ${limitedResults.length}:\n\n` +
            limitedResults
              .map(
                (r) =>
                  `- ${r.case_name} (${r.date_filed}) [${r.court}]\n  Citation: ${r.citation_count} cites\n  URL: ${r.absolute_url}`
              )
              .join('\n\n'),
        },
      ],
    };
  }
}

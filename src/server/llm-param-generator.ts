/**
 * Converts natural-language legal queries into CourtListener search parameters.
 * Used by smart_search via MCP client sampling or Workers AI on Cloudflare.
 */

export interface LlmParamGeneratorMessage {
  role: 'user';
  content: {
    type: 'text';
    text: string;
  };
}

export interface LlmParamGeneratorOptions {
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LlmParamGeneratorResult {
  content: {
    type: 'text';
    text: string;
  };
}

export interface LlmParamGenerator {
  createMessage(
    messages: LlmParamGeneratorMessage[],
    options?: LlmParamGeneratorOptions,
  ): Promise<LlmParamGeneratorResult>;
}

export const SMART_SEARCH_PARAM_SYSTEM_PROMPT =
  'You are a precise legal search parameter generator.';

export function buildSmartSearchParamUserPrompt(query: string): string {
  return `You are an expert legal researcher. Convert the following natural language query into specific CourtListener search parameters.

Query: "${query}"

Available parameters:
- q: Full text search query
- type: 'o' (opinion), 'd' (docket), 'r' (recap)
- order_by: 'score desc', 'dateFiled desc', 'dateFiled asc'
- court: Array of court IDs (e.g., 'scotus', 'ca9')
- judge: Judge name
- filed_after: Date (YYYY-MM-DD)
- filed_before: Date (YYYY-MM-DD)
- precedential_status: 'Precedential', 'Non-Precedential', 'Errata', 'Separate Opinion', 'In-chambers'

Return ONLY a JSON object with the parameters. Do not include markdown formatting or explanation.`;
}

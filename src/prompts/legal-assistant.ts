import { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { PromptHandler } from '../server/prompt-handler.js';

/**
 * Prompt that sets up the context for a legal research assistant
 */
export class LegalAssistantPromptHandler implements PromptHandler {
  name = 'legal_assistant';
  description = 'Sets up the context for a legal research assistant with specific focus areas';
  arguments = [
    {
      name: 'focus_area',
      description: 'The specific area of law to focus on (e.g., "Constitutional Law", "Bankruptcy")',
      required: false,
    },
    {
      name: 'jurisdiction',
      description: 'The jurisdiction to prioritize (e.g., "US Supreme Court", "California")',
      required: false,
    },
  ];

  async getMessages(args: Record<string, string>): Promise<GetPromptResult> {
    const focusArea = args.focus_area || 'General Legal Research';
    const jurisdiction = args.jurisdiction || 'United States';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `You are a legal research assistant specializing in ${focusArea} within the ${jurisdiction} jurisdiction.
Please assist me with finding relevant cases, statutes, and opinions using the available tools.
When citing cases, please use standard Bluebook citation format where possible.
Always verify citations using the 'validate_citations' tool if you are unsure.`,
          },
        },
      ],
    };
  }
}

/**
 * MCP Prompt Template Provider
 * Phase 3: Surface Expansion
 * 
 * Provides curated prompt templates for legal analysis tasks
 */

import { Prompt, PromptArgument, PromptMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Base interface for prompt providers
 */
export interface PromptProvider {
  /**
   * List available prompts
   */
  listPrompts(): Promise<Prompt[]>;

  /**
   * Get a specific prompt by name
   */
  getPrompt(name: string, arguments_?: Record<string, string>): Promise<{
    messages: PromptMessage[];
    description?: string;
  }>;
}

/**
 * Legal prompt templates for common analysis tasks
 */
export class LegalPromptProvider implements PromptProvider {
  async listPrompts(): Promise<Prompt[]> {
    return [
      {
        name: 'summarize-statute',
        description: 'Generate a concise summary of a statute or legal provision',
        arguments: [
          {
            name: 'statute_text',
            description: 'The full text of the statute to summarize',
            required: true,
          },
          {
            name: 'jurisdiction',
            description: 'The jurisdiction (e.g., federal, state)',
            required: false,
          },
        ],
      },
      {
        name: 'compare-precedents',
        description: 'Compare and contrast multiple legal precedents',
        arguments: [
          {
            name: 'case_citations',
            description: 'Comma-separated list of case citations to compare',
            required: true,
          },
          {
            name: 'focus_issue',
            description: 'Specific legal issue to focus the comparison on',
            required: false,
          },
        ],
      },
      {
        name: 'analyze-case',
        description: 'Perform comprehensive analysis of a legal case',
        arguments: [
          {
            name: 'case_citation',
            description: 'Citation of the case to analyze',
            required: true,
          },
          {
            name: 'analysis_type',
            description: 'Type of analysis: holding, reasoning, impact, or full',
            required: false,
          },
        ],
      },
      {
        name: 'draft-brief-section',
        description: 'Help draft a section of a legal brief',
        arguments: [
          {
            name: 'section_type',
            description: 'Type of section: facts, argument, conclusion',
            required: true,
          },
          {
            name: 'key_points',
            description: 'Key points to include (comma-separated)',
            required: true,
          },
          {
            name: 'supporting_cases',
            description: 'Supporting case citations',
            required: false,
          },
        ],
      },
      {
        name: 'identify-issues',
        description: 'Identify legal issues in a factual scenario',
        arguments: [
          {
            name: 'fact_pattern',
            description: 'Description of the factual scenario',
            required: true,
          },
          {
            name: 'jurisdiction',
            description: 'Applicable jurisdiction',
            required: false,
          },
        ],
      },
    ];
  }

  async getPrompt(
    name: string,
    arguments_?: Record<string, string>
  ): Promise<{
    messages: PromptMessage[];
    description?: string;
  }> {
    const prompts = await this.listPrompts();
    const prompt = prompts.find((p) => p.name === name);

    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    // Generate messages based on prompt type
    const messages = this.generateMessages(name, arguments_ || {});

    return {
      messages,
      description: prompt.description,
    };
  }

  private generateMessages(name: string, args: Record<string, string>): PromptMessage[] {
    switch (name) {
      case 'summarize-statute':
        return [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please provide a concise summary of the following statute:

${args.statute_text || '[Statute text not provided]'}
${args.jurisdiction ? `\nJurisdiction: ${args.jurisdiction}` : ''}

Please include:
1. Main purpose and scope
2. Key provisions
3. Exceptions or limitations
4. Effective date or applicability`,
            },
          },
        ];

      case 'compare-precedents':
        return [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please compare and contrast the following legal precedents:

Cases: ${args.case_citations || '[Citations not provided]'}
${args.focus_issue ? `\nFocus on: ${args.focus_issue}` : ''}

Please analyze:
1. Key holdings in each case
2. Similarities in reasoning
3. Points of divergence
4. Binding authority and jurisdiction
5. Current applicability`,
            },
          },
        ];

      case 'analyze-case':
        return [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please analyze the following case:

Citation: ${args.case_citation || '[Citation not provided]'}
Analysis Type: ${args.analysis_type || 'full'}

Please provide:
1. Facts of the case
2. Legal issues presented
3. Court's holding
4. Reasoning and analysis
5. Precedential value
6. Potential impact`,
            },
          },
        ];

      case 'draft-brief-section':
        return [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please help draft the following section of a legal brief:

Section Type: ${args.section_type || 'argument'}
Key Points: ${args.key_points || '[Not provided]'}
${args.supporting_cases ? `\nSupporting Cases: ${args.supporting_cases}` : ''}

Please draft a well-structured section that:
1. States the key points clearly
2. Supports arguments with legal authority
3. Uses proper legal writing style
4. Follows logical organization`,
            },
          },
        ];

      case 'identify-issues':
        return [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please identify the legal issues in the following scenario:

Fact Pattern:
${args.fact_pattern || '[Fact pattern not provided]'}
${args.jurisdiction ? `\nJurisdiction: ${args.jurisdiction}` : ''}

Please identify:
1. All potential legal issues
2. Applicable areas of law
3. Relevant legal standards
4. Potential claims or defenses
5. Key questions to research`,
            },
          },
        ];

      default:
        throw new Error(`Unknown prompt type: ${name}`);
    }
  }
}

/**
 * Registry for managing prompt providers
 */
export class PromptProviderRegistry {
  private providers: PromptProvider[] = [];

  /**
   * Register a prompt provider
   */
  register(provider: PromptProvider): void {
    this.providers.push(provider);
  }

  /**
   * List all prompts from all providers
   */
  async listAllPrompts(): Promise<Prompt[]> {
    const allPrompts = await Promise.all(this.providers.map((p) => p.listPrompts()));
    return allPrompts.flat();
  }

  /**
   * Get a prompt from any provider
   */
  async getPrompt(
    name: string,
    arguments_?: Record<string, string>
  ): Promise<{
    messages: PromptMessage[];
    description?: string;
  }> {
    // Try each provider until we find the prompt
    for (const provider of this.providers) {
      const prompts = await provider.listPrompts();
      if (prompts.some((p) => p.name === name)) {
        return provider.getPrompt(name, arguments_);
      }
    }

    throw new Error(`Prompt not found: ${name}`);
  }
}


import type { Env } from './worker-runtime-contract.js';
import { DEFAULT_CF_AI_MODEL_BALANCED } from './worker-runtime-contract.js';
import {
  type LlmParamGenerator,
  type LlmParamGeneratorMessage,
  type LlmParamGeneratorOptions,
  type LlmParamGeneratorResult,
  SMART_SEARCH_PARAM_SYSTEM_PROMPT,
} from './llm-param-generator.js';

function extractAiText(completion: unknown): string {
  if (!completion || typeof completion !== 'object') return '';
  const direct = (completion as { response?: string }).response;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const nested = (completion as { result?: { response?: string } }).result?.response;
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  const choicesText = (completion as { choices?: Array<{ message?: { content?: string } }> })
    .choices;
  if (Array.isArray(choicesText) && choicesText.length > 0) {
    const first = choicesText[0]?.message?.content;
    if (typeof first === 'string' && first.trim()) return first.trim();
  }
  const outputText = (
    completion as {
      output?: Array<{
        content?: Array<{ type?: string; text?: string }>;
      }>;
    }
  ).output;
  if (Array.isArray(outputText) && outputText.length > 0) {
    for (const block of outputText) {
      if (!Array.isArray(block.content)) continue;
      for (const part of block.content) {
        if (part?.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
          return part.text.trim();
        }
      }
    }
  }
  return '';
}

export function createCloudflareAiParamGenerator(env: Env): LlmParamGenerator | undefined {
  const ai = env.AI;
  if (!ai || typeof ai.run !== 'function') {
    return undefined;
  }

  const model = env.CLOUDFLARE_AI_MODEL?.trim() || DEFAULT_CF_AI_MODEL_BALANCED;

  return {
    async createMessage(
      messages: LlmParamGeneratorMessage[],
      options?: LlmParamGeneratorOptions,
    ): Promise<LlmParamGeneratorResult> {
      const userText = messages
        .map((message) => (message.content.type === 'text' ? message.content.text : ''))
        .filter(Boolean)
        .join('\n\n');

      const completion = await ai.run(model, {
        messages: [
          {
            role: 'system',
            content: options?.systemPrompt?.trim() || SMART_SEARCH_PARAM_SYSTEM_PROMPT,
          },
          { role: 'user', content: userText },
        ],
        max_tokens: options?.maxTokens ?? 500,
        temperature: 0,
      });

      const text = extractAiText(completion);
      if (!text) {
        throw new Error('Workers AI returned an empty parameter generation response');
      }

      return {
        content: {
          type: 'text',
          text,
        },
      };
    },
  };
}

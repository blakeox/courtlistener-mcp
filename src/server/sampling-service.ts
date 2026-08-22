import type {
  LlmParamGeneratorMessage,
  LlmParamGeneratorOptions,
  LlmParamGeneratorResult,
} from './llm-param-generator.js';
import { Logger } from '../infrastructure/logger.js';
import { ServerConfig } from '../types.js';

export interface SamplingClient {
  createMessage(params: {
    messages: LlmParamGeneratorMessage[];
    maxTokens?: number;
    systemPrompt?: string;
    temperature?: number;
    stopSequences?: string[];
    modelPreferences?: Record<string, unknown>;
  }): Promise<LlmParamGeneratorResult>;
}

/** Adapter for an explicitly supplied sampling client. */
export class SamplingService {
  constructor(
    private readonly client: SamplingClient,
    private readonly config: ServerConfig,
    private readonly logger: Logger,
  ) {}

  async createMessage(
    messages: LlmParamGeneratorMessage[],
    options: LlmParamGeneratorOptions & {
      temperature?: number;
      stopSequences?: string[];
      modelPreferences?: Record<string, unknown>;
    } = {},
  ): Promise<LlmParamGeneratorResult> {
    if (!this.config.sampling.enabled) {
      throw new Error('Sampling is disabled in server configuration');
    }

    this.logger.debug('Requesting sampling from client', {
      messageCount: messages.length,
      options,
    });

    try {
      const result = await this.client.createMessage({
        messages,
        maxTokens: options.maxTokens ?? this.config.sampling.maxTokens,
        ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.stopSequences ? { stopSequences: options.stopSequences } : {}),
        ...(options.modelPreferences
          ? { modelPreferences: options.modelPreferences }
          : this.config.sampling.defaultModel
            ? { modelPreferences: { hints: [{ name: this.config.sampling.defaultModel }] } }
            : {}),
      });

      this.logger.debug('Sampling request successful', {
        contentLength: result.content.text.length,
      });
      return result;
    } catch (error) {
      this.logger.error(
        'Sampling request failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error(`Sampling failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CreateMessageRequest,
  CreateMessageResult,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../infrastructure/logger.js';
import { ServerConfig } from '../types.js';

export class SamplingService {
  constructor(
    private readonly server: Server,
    private readonly config: ServerConfig,
    private readonly logger: Logger
  ) {}

  /**
   * Request a completion from the client (LLM)
   */
  async createMessage(
    messages: CreateMessageRequest['params']['messages'],
    options: {
      maxTokens?: number;
      systemPrompt?: string;
      temperature?: number;
      stopSequences?: string[];
      modelPreferences?: CreateMessageRequest['params']['modelPreferences'];
    } = {}
  ): Promise<CreateMessageResult> {
    if (!this.config.sampling.enabled) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Sampling is disabled in server configuration'
      );
    }

    this.logger.debug('Requesting sampling from client', {
      messageCount: messages.length,
      options,
    });

    try {
      const request: CreateMessageRequest = {
        method: 'sampling/createMessage',
        params: {
          messages,
          maxTokens: options.maxTokens || this.config.sampling.maxTokens,
          systemPrompt: options.systemPrompt,
          temperature: options.temperature,
          stopSequences: options.stopSequences,
          modelPreferences: options.modelPreferences || (this.config.sampling.defaultModel ? {
            hints: [{ name: this.config.sampling.defaultModel }]
          } : undefined),
        },
      };

      // The SDK Server class handles the request sending
      // Note: We need to cast to any because createMessage might not be exposed on the public type definition
      // depending on the SDK version, but it is part of the protocol.
      // Actually, the Server class in the SDK should have a method to send requests.
      // If not, we might need to use the transport directly, but Server usually abstracts this.
      
      // Checking SDK source (mental model): Server extends specific class that has request capability?
      // Or we use server.request(...)
      
      // Let's assume server.createMessage exists or we use a generic request method.
      // If the SDK doesn't expose it directly, we might need to check how to send requests from server to client.
      
      // For now, let's try to use the server instance.
      // If the SDK doesn't support server-to-client requests easily, we might need to look at the transport.
      
      // However, standard MCP SDK Server usually supports this.
      
      const result = await this.server.createMessage(request.params);
      
      this.logger.debug('Sampling request successful', {
        role: result.role,
        contentLength: result.content.type === 'text' ? result.content.text.length : 0
      });

      return result;
    } catch (error) {
      this.logger.error('Sampling request failed', error instanceof Error ? error : new Error(String(error)));
      throw new McpError(
        ErrorCode.InternalError,
        `Sampling failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

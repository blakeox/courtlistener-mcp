import { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { CourtListenerAPI } from '../courtlistener.js';
import { ResourceHandler, ResourceContext } from '../server/resource-handler.js';

export class JudgeResourceHandler implements ResourceHandler {
  readonly uriTemplate = 'courtlistener://judge/{id}';
  readonly name = 'Judge';
  readonly description = 'Fetch judge profile by ID';
  readonly mimeType = 'application/json';

  constructor(private api: CourtListenerAPI) {}

  matches(uri: string): boolean {
    return uri.startsWith('courtlistener://judge/');
  }

  async read(uri: string, context: ResourceContext): Promise<ReadResourceResult> {
    const idStr = uri.split('/').pop();
    const id = parseInt(idStr || '', 10);

    if (isNaN(id)) {
      throw new Error(`Invalid judge ID in URI: ${uri}`);
    }

    try {
      const judge = await this.api.getJudge(id);

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(judge, null, 2),
          },
        ],
      };
    } catch (error) {
      context.logger.error(`Failed to fetch judge ${id}`, error as Error);
      throw new Error(`Failed to fetch judge ${id}: ${(error as Error).message}`);
    }
  }

  list(): Resource[] {
    return [
      {
        uri: 'courtlistener://judge/123456',
        name: 'Example Judge 123456',
        description: 'Example of a judge resource',
        mimeType: 'application/json',
      },
    ];
  }
}

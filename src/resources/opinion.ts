import { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { CourtListenerAPI } from '../courtlistener.js';
import { ResourceHandler, ResourceContext } from '../server/resource-handler.js';

export class OpinionResourceHandler implements ResourceHandler {
  readonly uriTemplate = 'courtlistener://opinion/{id}';
  readonly name = 'Opinion';
  readonly description = 'Fetch a legal opinion by ID';
  readonly mimeType = 'application/json';

  constructor(private api: CourtListenerAPI) {}

  matches(uri: string): boolean {
    return uri.startsWith('courtlistener://opinion/');
  }

  async read(uri: string, context: ResourceContext): Promise<ReadResourceResult> {
    const idStr = uri.split('/').pop();
    const id = parseInt(idStr || '', 10);

    if (isNaN(id)) {
      throw new Error(`Invalid opinion ID in URI: ${uri}`);
    }

    try {
      const opinion = await this.api.getOpinion(id);
      
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(opinion, null, 2),
          },
        ],
      };
    } catch (error) {
      context.logger.error(`Failed to fetch opinion ${id}`, error as Error);
      throw new Error(`Failed to fetch opinion ${id}: ${(error as Error).message}`);
    }
  }

  list(): Resource[] {
    // Return a few examples or nothing since it's dynamic
    return [
      {
        uri: 'courtlistener://opinion/123456',
        name: 'Example Opinion 123456',
        description: 'Example of a legal opinion resource',
        mimeType: 'application/json',
      }
    ];
  }
}

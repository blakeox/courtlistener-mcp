import { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { CourtListenerAPI } from '../courtlistener.js';
import { ResourceHandler, ResourceContext } from '../server/resource-handler.js';

export class CourtResourceHandler implements ResourceHandler {
  readonly uriTemplate = 'courtlistener://court/{id}';
  readonly name = 'Court';
  readonly description = 'Fetch court information by ID';
  readonly mimeType = 'application/json';

  constructor(private api: CourtListenerAPI) {}

  matches(uri: string): boolean {
    return uri.startsWith('courtlistener://court/');
  }

  async read(uri: string, context: ResourceContext): Promise<ReadResourceResult> {
    const id = uri.replace('courtlistener://court/', '');

    if (!id) {
      throw new Error(`Invalid court ID in URI: ${uri}`);
    }

    try {
      // Courts use string IDs (e.g., "scotus", "ca9")
      const courts = await this.api.getCourts({ id });

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(courts, null, 2),
          },
        ],
      };
    } catch (error) {
      context.logger.error(`Failed to fetch court ${id}`, error as Error);
      throw new Error(`Failed to fetch court ${id}: ${(error as Error).message}`);
    }
  }

  list(): Resource[] {
    return [
      {
        uri: 'courtlistener://court/scotus',
        name: 'Example Court (SCOTUS)',
        description: 'Example of a court resource',
        mimeType: 'application/json',
      },
    ];
  }
}

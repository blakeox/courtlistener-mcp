import { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { CourtListenerAPI } from '../courtlistener.js';
import { ResourceHandler, ResourceContext } from '../server/resource-handler.js';

export class DocketResourceHandler implements ResourceHandler {
  readonly uriTemplate = 'courtlistener://docket/{id}';
  readonly name = 'Docket';
  readonly description = 'Fetch docket with entry list by ID';
  readonly mimeType = 'application/json';

  constructor(private api: CourtListenerAPI) {}

  matches(uri: string): boolean {
    return uri.startsWith('courtlistener://docket/');
  }

  async read(uri: string, context: ResourceContext): Promise<ReadResourceResult> {
    const idStr = uri.split('/').pop();
    const id = parseInt(idStr || '', 10);

    if (isNaN(id)) {
      throw new Error(`Invalid docket ID in URI: ${uri}`);
    }

    try {
      const docket = await this.api.getDocket(id);

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(docket, null, 2),
          },
        ],
      };
    } catch (error) {
      context.logger.error(`Failed to fetch docket ${id}`, error as Error);
      throw new Error(`Failed to fetch docket ${id}: ${(error as Error).message}`);
    }
  }

  list(): Resource[] {
    return [
      {
        uri: 'courtlistener://docket/123456',
        name: 'Example Docket 123456',
        description: 'Example of a docket resource',
        mimeType: 'application/json',
      },
    ];
  }
}

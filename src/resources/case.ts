import { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { CourtListenerAPI } from '../courtlistener.js';
import { ResourceHandler, ResourceContext } from '../server/resource-handler.js';

export class CaseResourceHandler implements ResourceHandler {
  readonly uriTemplate = 'courtlistener://case/{id}';
  readonly name = 'Case';
  readonly description = 'Fetch case/opinion cluster details by ID';
  readonly mimeType = 'application/json';

  constructor(private api: CourtListenerAPI) {}

  matches(uri: string): boolean {
    return uri.startsWith('courtlistener://case/');
  }

  async read(uri: string, context: ResourceContext): Promise<ReadResourceResult> {
    const idStr = uri.split('/').pop();
    const id = parseInt(idStr || '', 10);

    if (isNaN(id)) {
      throw new Error(`Invalid case ID in URI: ${uri}`);
    }

    try {
      const cluster = await this.api.getOpinionCluster(id);

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(cluster, null, 2),
          },
        ],
      };
    } catch (error) {
      context.logger.error(`Failed to fetch case ${id}`, error as Error);
      throw new Error(`Failed to fetch case ${id}: ${(error as Error).message}`);
    }
  }

  list(): Resource[] {
    return [
      {
        uri: 'courtlistener://case/123456',
        name: 'Example Case 123456',
        description: 'Example of a case/opinion cluster resource',
        mimeType: 'application/json',
      },
    ];
  }
}

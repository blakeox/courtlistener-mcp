import { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { CourtListenerAPI } from '../courtlistener.js';
import { ResourceHandler, ResourceContext } from '../server/resource-handler.js';

export class RecentOpinionsResourceHandler implements ResourceHandler {
  readonly uriTemplate = 'courtlistener://search/recent';
  readonly name = 'Recent Opinions';
  readonly description = 'List recent opinions from the last 7 days';
  readonly mimeType = 'application/json';

  constructor(private api: CourtListenerAPI) {}

  matches(uri: string): boolean {
    return uri === 'courtlistener://search/recent';
  }

  async read(uri: string, context: ResourceContext): Promise<ReadResourceResult> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const filed_after = sevenDaysAgo.toISOString().split('T')[0];

      const results = await this.api.searchOpinions({
        order_by: 'dateFiled desc',
        date_filed_after: filed_after,
      });

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      context.logger.error('Failed to fetch recent opinions', error as Error);
      throw new Error(`Failed to fetch recent opinions: ${(error as Error).message}`);
    }
  }

  list(): Resource[] {
    return [
      {
        uri: 'courtlistener://search/recent',
        name: 'Recent Opinions',
        description: 'Dynamic listing of opinions filed in the last 7 days',
        mimeType: 'application/json',
      },
    ];
  }
}

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { ToolContext } from '../../src/server/tool-handler.js';
import {
  GetAbaRatingsHandler,
  GetJudgeEducationsHandler,
  GetJudgePoliticalAffiliationsHandler,
  GetJudicialPositionHandler,
  GetJudicialPositionsHandler,
  GetMembershipsHandler,
  GetRetentionEventsHandler,
  GetSchoolsHandler,
} from '../../src/domains/courts/handlers.js';
import { encodeCursor } from '../../src/common/pagination-utils.js';
import { Logger } from '../../src/infrastructure/logger.js';

class SilentLogger extends Logger {
  constructor(component = 'CourtsAdditionalTest') {
    super({ level: 'error', format: 'json', enabled: false }, component);
  }

  child(component: string): SilentLogger {
    return new SilentLogger(component);
  }
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    logger: new SilentLogger().child('unit'),
    requestId: 'courts-additional-req',
    ...overrides,
  };
}

describe('Additional courts handlers', () => {
  it('GetJudicialPositionsHandler resolves cursor pagination', async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const handler = new GetJudicialPositionsHandler({
      async getJudicialPositions(params: Record<string, unknown>) {
        capturedParams = params;
        return { count: 5, results: [{ id: 1 }] };
      },
    } as any);

    const cursor = encodeCursor(40);
    const validated = handler.validate({ person: 9, cursor, limit: 10 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as { positions: Array<{ id: number }> };
      assert.deepStrictEqual(capturedParams, {
        person: '9',
        cursor,
        limit: 10,
        page: 5,
        page_size: 10,
      });
      assert.deepStrictEqual(payload.positions, [{ id: 1 }]);
    }
  });

  it('GetJudicialPositionHandler returns a single position', async () => {
    const handler = new GetJudicialPositionHandler({
      async getJudicialPosition(positionId: number) {
        assert.strictEqual(positionId, 7);
        return { id: 7, title: 'Justice' };
      },
    } as any);

    const result = await handler.execute({ position_id: '7' }, makeContext());
    const payload = JSON.parse(result.content[0].text) as {
      position: { id: number; title: string };
    };
    assert.deepStrictEqual(payload.position, { id: 7, title: 'Justice' });
  });

  it('GetJudgeEducationsHandler forwards education filters', async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const handler = new GetJudgeEducationsHandler({
      async getJudgeEducations(params: Record<string, unknown>) {
        capturedParams = params;
        return { count: 1, results: [{ school: 'Yale' }] };
      },
    } as any);

    const result = await handler.execute(
      { person: '11', school: 'Yale', degree_level: 'JD', page: 2, page_size: 5 },
      makeContext(),
    );
    const payload = JSON.parse(result.content[0].text) as { educations: Array<{ school: string }> };
    assert.deepStrictEqual(capturedParams, {
      person: '11',
      school: 'Yale',
      degree_level: 'JD',
      page: 2,
      page_size: 5,
    });
    assert.deepStrictEqual(payload.educations, [{ school: 'Yale' }]);
  });

  it('GetJudgePoliticalAffiliationsHandler returns affiliations', async () => {
    const handler = new GetJudgePoliticalAffiliationsHandler({
      async getJudgePoliticalAffiliations(params: Record<string, unknown>) {
        assert.deepStrictEqual(params, {
          person: '12',
          political_party: 'Independent',
          page: 1,
          page_size: 20,
        });
        return { count: 1, results: [{ party: 'Independent' }] };
      },
    } as any);

    const result = await handler.execute(
      { person: '12', political_party: 'Independent', page: 1, page_size: 20 },
      makeContext(),
    );
    const payload = JSON.parse(result.content[0].text) as {
      political_affiliations: Array<{ party: string }>;
    };
    assert.deepStrictEqual(payload.political_affiliations, [{ party: 'Independent' }]);
  });

  it('GetAbaRatingsHandler validates page defaults and returns ratings', async () => {
    const handler = new GetAbaRatingsHandler({
      async getABARatings(params: Record<string, unknown>) {
        assert.deepStrictEqual(params, { person: '13', page: 1, page_size: 20 });
        return { count: 1, results: [{ rating: 'Well Qualified' }] };
      },
    } as any);

    const validated = handler.validate({ person: 13 });
    assert.strictEqual(validated.success, true);
    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as { ratings: Array<{ rating: string }> };
      assert.deepStrictEqual(payload.ratings, [{ rating: 'Well Qualified' }]);
    }
  });

  it('GetRetentionEventsHandler returns retention events', async () => {
    const handler = new GetRetentionEventsHandler({
      async getRetentionEvents(params: Record<string, unknown>) {
        assert.deepStrictEqual(params, { person: '14', court: 'scotus', page: 1, page_size: 20 });
        return { count: 1, results: [{ result: 'retained' }] };
      },
    } as any);

    const result = await handler.execute(
      { person: '14', court: 'scotus', page: 1, page_size: 20 },
      makeContext(),
    );
    const payload = JSON.parse(result.content[0].text) as {
      retention_events: Array<{ result: string }>;
    };
    assert.deepStrictEqual(payload.retention_events, [{ result: 'retained' }]);
  });

  it('GetSchoolsHandler returns school rows', async () => {
    const handler = new GetSchoolsHandler({
      async getSchools(params: Record<string, unknown>) {
        assert.deepStrictEqual(params, {
          name: 'Harvard',
          city: 'Cambridge',
          page: 1,
          page_size: 20,
        });
        return { count: 1, results: [{ name: 'Harvard Law School' }] };
      },
    } as any);

    const result = await handler.execute(
      { name: 'Harvard', city: 'Cambridge', page: 1, page_size: 20 },
      makeContext(),
    );
    const payload = JSON.parse(result.content[0].text) as { schools: Array<{ name: string }> };
    assert.deepStrictEqual(payload.schools, [{ name: 'Harvard Law School' }]);
  });

  it('GetMembershipsHandler returns memberships', async () => {
    const handler = new GetMembershipsHandler({
      async getMemberships(params: Record<string, unknown>) {
        assert.deepStrictEqual(params, {
          person: '21',
          organization: 'ABA',
          page: 1,
          page_size: 20,
        });
        return { count: 1, results: [{ organization: 'ABA' }] };
      },
    } as any);

    const result = await handler.execute(
      { person: '21', organization: 'ABA', page: 1, page_size: 20 },
      makeContext(),
    );
    const payload = JSON.parse(result.content[0].text) as {
      memberships: Array<{ organization: string }>;
    };
    assert.deepStrictEqual(payload.memberships, [{ organization: 'ABA' }]);
  });
});

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { OpinionResourceHandler } from '../../src/resources/opinion.js';
import { CourtListenerAPI } from '../../src/courtlistener.js';
import { ResourceContext } from '../../src/server/resource-handler.js';
import { createMockLogger } from '../utils/test-helpers.js';

describe('OpinionResourceHandler', () => {
  let api: CourtListenerAPI;
  let handler: OpinionResourceHandler;
  let context: ResourceContext;

  beforeEach(() => {
    api = {
      getOpinion: async (id: number) => ({ id, plain_text: 'Test opinion' }),
    } as unknown as CourtListenerAPI;
    
    handler = new OpinionResourceHandler(api);
    context = {
      logger: createMockLogger(),
      requestId: 'test-req-id',
    };
  });

  it('matches valid URIs', () => {
    assert.strictEqual(handler.matches('courtlistener://opinion/123'), true);
    assert.strictEqual(handler.matches('courtlistener://case/123'), false);
  });

  it('reads opinion successfully', async () => {
    const result = await handler.read('courtlistener://opinion/123', context);
    
    assert.strictEqual(result.contents.length, 1);
    const content = JSON.parse(result.contents[0].text);
    assert.strictEqual(content.id, 123);
    assert.strictEqual(content.plain_text, 'Test opinion');
  });

  it('handles errors', async () => {
    api.getOpinion = async () => { throw new Error('API Error'); };
    
    await assert.rejects(
      async () => await handler.read('courtlistener://opinion/123', context),
      /Failed to fetch opinion 123/
    );
  });
});

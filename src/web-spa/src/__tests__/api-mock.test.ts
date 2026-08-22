import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('api-mock', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getSession returns unauthenticated by default', async () => {
    const mock = await import('../lib/api-mock');
    const session = await mock.getSession();
    expect(session.authenticated).toBe(false);
    expect(session.user).toBeNull();
  });

  it('logout clears authenticated state', async () => {
    const mock = await import('../lib/api-mock');
    await mock.logout();
    const session = await mock.getSession();
    expect(session.authenticated).toBe(false);
  });

  it('does not export removed browser-form auth helpers', async () => {
    const mock = await import('../lib/api-mock');
    expect('login' in mock).toBe(false);
    expect('loginByAccessToken' in mock).toBe(false);
    expect('signup' in mock).toBe(false);
    expect('requestPasswordReset' in mock).toBe(false);
    expect('resetPassword' in mock).toBe(false);
    expect('listKeys' in mock).toBe(false);
    expect('createKey' in mock).toBe(false);
    expect('revokeKey' in mock).toBe(false);
  });

  it('mcpCall returns mock response', async () => {
    const mock = await import('../lib/api-mock');
    const result = await mock.mcpCall({ method: 'server/discover', params: {}, id: 1 }, 'token');
    expect(result.body).toBeDefined();
  });

  it('aiChat returns structured mock response', async () => {
    const mock = await import('../lib/api-mock');
    const result = await mock.aiChat({ message: 'test', mcpToken: 'tok' });
    expect(result.ai_response).toBeTruthy();
    expect(result.tool).toBeTruthy();
  });

  it('aiChat includes tool_reason in response', async () => {
    const mock = await import('../lib/api-mock');
    const result = await mock.aiChat({ message: 'test query', mcpToken: 'tok' });
    expect(result.tool_reason).toBeTruthy();
    expect(typeof result.tool_reason).toBe('string');
  });

  it('aiChat accepts history parameter', async () => {
    const mock = await import('../lib/api-mock');
    const result = await mock.aiChat({
      message: 'follow up',
      mcpToken: 'tok',
      history: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'response' },
      ],
    });
    expect(result.ai_response).toBeTruthy();
  });

  it('aiPlain returns structured mock response', async () => {
    const mock = await import('../lib/api-mock');
    const result = await mock.aiPlain({ message: 'test legal question' });
    expect(result.ai_response).toBeTruthy();
    expect(result.mode).toBe('cheap');
  });

  it('aiPlain respects mode parameter', async () => {
    const mock = await import('../lib/api-mock');
    const result = await mock.aiPlain({ message: 'test', mode: 'balanced' });
    expect(result.mode).toBe('balanced');
  });

  it('aiPlain accepts history parameter', async () => {
    const mock = await import('../lib/api-mock');
    const result = await mock.aiPlain({
      message: 'follow up',
      history: [
        { role: 'user', content: 'prior' },
        { role: 'assistant', content: 'prior resp' },
      ],
    });
    expect(result.ai_response).toBeTruthy();
  });

  it('toErrorMessage handles various error types', async () => {
    const mock = await import('../lib/api-mock');
    expect(mock.toErrorMessage(null)).toBe('Unknown error');
    expect(mock.toErrorMessage(new Error('boom'))).toBe('boom');
    expect(mock.toErrorMessage({ message: 'msg' })).toBe('msg');
    expect(mock.toErrorMessage({ error: 'err' })).toBe('err');
  });

  it('isMockEnabled checks query param', async () => {
    const mock = await import('../lib/api-mock');
    // In test environment, window.location.search is usually empty
    expect(mock.isMockEnabled()).toBe(false);
  });
});

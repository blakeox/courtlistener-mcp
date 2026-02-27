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

  it('login sets authenticated state', async () => {
    const mock = await import('../lib/api-mock');
    await mock.login({ email: 'test@test.com', password: 'pass' });
    const session = await mock.getSession();
    expect(session.authenticated).toBe(true);
    expect(session.user).not.toBeNull();
  });

  it('logout clears authenticated state', async () => {
    const mock = await import('../lib/api-mock');
    await mock.login({ email: 'test@test.com', password: 'pass' });
    await mock.logout();
    const session = await mock.getSession();
    expect(session.authenticated).toBe(false);
  });

  it('createKey adds key to list', async () => {
    const mock = await import('../lib/api-mock');
    const result = await mock.createKey({ label: 'test-key', expiresDays: 30 });
    expect(result.api_key).toBeDefined();
    expect(result.api_key?.token).toBeTruthy();
    const keys = await mock.listKeys();
    expect(keys.keys.length).toBeGreaterThanOrEqual(1);
    expect(keys.keys.some(k => k.label === 'test-key')).toBe(true);
  });

  it('revokeKey marks key as inactive', async () => {
    const mock = await import('../lib/api-mock');
    const created = await mock.createKey({ label: 'revoke-me', expiresDays: 7 });
    const keyId = created.api_key!.id;
    await mock.revokeKey(keyId);
    const keys = await mock.listKeys();
    const revoked = keys.keys.find(k => k.id === keyId);
    expect(revoked?.is_active).toBe(false);
    expect(revoked?.revoked_at).toBeTruthy();
  });

  it('signup returns mock message', async () => {
    const mock = await import('../lib/api-mock');
    const result = await mock.signup({ email: 'a@b.com', password: 'pass' });
    expect(result.message).toContain('Mock');
  });

  it('mcpCall returns mock response', async () => {
    const mock = await import('../lib/api-mock');
    const result = await mock.mcpCall({ method: 'initialize', params: {}, id: 1 }, 'token');
    expect(result.sessionId).toBeTruthy();
    expect(result.body).toBeDefined();
  });

  it('aiChat returns structured mock response', async () => {
    const mock = await import('../lib/api-mock');
    const result = await mock.aiChat({ message: 'test', mcpToken: 'tok' });
    expect(result.ai_response).toBeTruthy();
    expect(result.tool).toBeTruthy();
    expect(result.session_id).toBeTruthy();
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

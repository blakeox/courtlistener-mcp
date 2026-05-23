import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validatePassword } from '../lib/validation';
import { isRecoveryHash, getRecoveryToken, getRecoveryTokenHash } from '../lib/hash-utils';
import { createStorageMock } from './test-utils';

describe('validatePassword', () => {
  it('rejects short passwords', () => {
    expect(validatePassword('Ab1')).toContain('8 characters');
  });

  it('rejects passwords without uppercase', () => {
    expect(validatePassword('abcdefg1')).toContain('uppercase');
  });

  it('rejects passwords without lowercase', () => {
    expect(validatePassword('ABCDEFG1')).toContain('lowercase');
  });

  it('rejects passwords without number', () => {
    expect(validatePassword('Abcdefgh')).toContain('number');
  });

  it('accepts valid passwords', () => {
    expect(validatePassword('Abcdefg1')).toBeNull();
  });

  it('accepts complex passwords', () => {
    expect(validatePassword('MyP@ssw0rd!')).toBeNull();
  });
});

describe('storage', () => {
  let mockLocal: Storage;
  let mockSession: Storage;
  let readToken: typeof import('../lib/storage').readToken;
  let saveToken: typeof import('../lib/storage').saveToken;
  let clearToken: typeof import('../lib/storage').clearToken;
  let isPersistedToken: typeof import('../lib/storage').isPersistedToken;
  let normalizeMcpCredential: typeof import('../lib/storage').normalizeMcpCredential;

  beforeEach(async () => {
    mockLocal = createStorageMock();
    mockSession = createStorageMock();
    vi.stubGlobal('localStorage', mockLocal);
    vi.stubGlobal('sessionStorage', mockSession);

    // Re-import so the module picks up the stubbed globals
    vi.resetModules();
    const mod = await import('../lib/storage');
    readToken = mod.readToken;
    saveToken = mod.saveToken;
    clearToken = mod.clearToken;
    isPersistedToken = mod.isPersistedToken;
    normalizeMcpCredential = mod.normalizeMcpCredential;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('readToken returns empty when nothing stored', () => {
    expect(readToken()).toBe('');
  });

  it('saveToken with persist=true uses localStorage', () => {
    saveToken('mytoken', true);
    expect(mockLocal.getItem('courtlistenerMcpApiToken')).toBe('mytoken');
    expect(mockSession.getItem('courtlistenerMcpApiTokenSession')).toBeNull();
  });

  it('saveToken with persist=false uses sessionStorage', () => {
    saveToken('mytoken', false);
    expect(mockSession.getItem('courtlistenerMcpApiTokenSession')).toBe('mytoken');
    expect(mockLocal.getItem('courtlistenerMcpApiToken')).toBeNull();
  });

  it('saveToken trims whitespace', () => {
    saveToken('  tok  ', true);
    expect(mockLocal.getItem('courtlistenerMcpApiToken')).toBe('tok');
  });

  it('saveToken strips Bearer prefix', () => {
    saveToken('Bearer eyJ.test', true);
    expect(mockLocal.getItem('courtlistenerMcpApiToken')).toBe('eyJ.test');
  });

  it('normalizeMcpCredential strips Bearer prefix', () => {
    expect(normalizeMcpCredential('Bearer abc')).toBe('abc');
    expect(normalizeMcpCredential('abc')).toBe('abc');
  });

  it('saveToken ignores empty tokens', () => {
    saveToken('  ', true);
    expect(mockLocal.getItem('courtlistenerMcpApiToken')).toBeNull();
  });

  it('readToken prefers sessionStorage over localStorage', () => {
    mockLocal.setItem('courtlistenerMcpApiToken', 'local');
    mockSession.setItem('courtlistenerMcpApiTokenSession', 'session');
    expect(readToken()).toBe('session');
  });

  it('readToken falls back to localStorage', () => {
    mockLocal.setItem('courtlistenerMcpApiToken', 'local');
    expect(readToken()).toBe('local');
  });

  it('clearToken removes from both storages', () => {
    mockLocal.setItem('courtlistenerMcpApiToken', 'local');
    mockSession.setItem('courtlistenerMcpApiTokenSession', 'session');
    clearToken();
    expect(readToken()).toBe('');
  });

  it('isPersistedToken returns true when in localStorage', () => {
    mockLocal.setItem('courtlistenerMcpApiToken', 'tok');
    expect(isPersistedToken()).toBe(true);
  });

  it('isPersistedToken returns false when not in localStorage', () => {
    expect(isPersistedToken()).toBe(false);
  });
});

describe('hash-utils', () => {
  const originalPathname = window.location.pathname;
  const originalSearch = window.location.search;
  const originalHash = window.location.hash;

  afterEach(() => {
    window.history.replaceState(
      {},
      document.title,
      `${originalPathname}${originalSearch}${originalHash}`,
    );
  });

  it('isRecoveryHash returns false with empty hash', () => {
    window.location.hash = '';
    expect(isRecoveryHash()).toBe(false);
  });

  it('isRecoveryHash returns true with recovery hash', () => {
    window.location.hash = '#type=recovery&access_token=abc123';
    expect(isRecoveryHash()).toBe(true);
  });

  it('getRecoveryToken extracts token from recovery hash', () => {
    window.location.hash = '#type=recovery&access_token=myrecoverytoken';
    expect(getRecoveryToken()).toBe('myrecoverytoken');
  });

  it('getRecoveryToken returns empty for non-recovery hash', () => {
    window.location.hash = '#type=login&access_token=tok';
    expect(getRecoveryToken()).toBe('');
  });

  it('isRecoveryHash returns true with recovery token_hash query', () => {
    window.history.replaceState(
      {},
      document.title,
      '/app/reset-password?type=recovery&token_hash=abc',
    );
    expect(isRecoveryHash()).toBe(true);
  });

  it('getRecoveryTokenHash extracts token_hash from query', () => {
    window.history.replaceState(
      {},
      document.title,
      '/app/reset-password?type=recovery&token_hash=myhash',
    );
    expect(getRecoveryTokenHash()).toBe('myhash');
  });
});

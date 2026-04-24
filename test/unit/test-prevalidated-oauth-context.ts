#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getPrevalidatedOAuthIdentity } from '../../src/server/prevalidated-oauth-context.js';

describe('prevalidated-oauth-context', () => {
  it('returns null when execution context props are missing', () => {
    const ctx = {} as ExecutionContext;

    assert.equal(getPrevalidatedOAuthIdentity(ctx), null);
  });

  it('returns null when the user id is blank after trimming', () => {
    const ctx = {
      props: {
        userId: '   ',
        authMethod: 'service',
      },
    } as ExecutionContext;

    assert.equal(getPrevalidatedOAuthIdentity(ctx), null);
  });

  it('returns normalized prevalidated identity when props contain a valid user', () => {
    const ctx = {
      props: {
        userId: ' user-123 ',
        authMethod: 'service',
      },
    } as ExecutionContext;

    assert.deepEqual(getPrevalidatedOAuthIdentity(ctx), {
      userId: 'user-123',
      authMethod: 'service',
    });
  });

  it('defaults unknown auth methods to oidc', () => {
    const ctx = {
      props: {
        userId: 'user-123',
        authMethod: 'browser_oauth_complete',
      },
    } as ExecutionContext;

    assert.deepEqual(getPrevalidatedOAuthIdentity(ctx), {
      userId: 'user-123',
      authMethod: 'oidc',
    });
  });
});

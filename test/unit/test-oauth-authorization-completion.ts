#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildHostedOAuthCompletionDetails } from '../../src/auth/oauth-authorization-completion.js';

describe('oauth-authorization-completion', () => {
  it('builds completion metadata and props for browser auth completion', () => {
    const result = buildHostedOAuthCompletionDetails('browser_oauth_complete', 'user-123');

    assert.equal(result.metadata.source, 'browser_oauth_complete');
    assert.equal(result.props.userId, 'user-123');
    assert.equal(result.props.authMethod, 'browser_oauth_complete');
    assert.match(result.metadata.approved_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(!Number.isNaN(Date.parse(result.metadata.approved_at)));
  });

  it('preserves the completion source for Cloudflare OAuth', () => {
    const result = buildHostedOAuthCompletionDetails('cloudflare_oauth', 'cf-user');

    assert.deepEqual(result, {
      metadata: {
        source: 'cloudflare_oauth',
        approved_at: result.metadata.approved_at,
      },
      props: {
        userId: 'cf-user',
        authMethod: 'cloudflare_oauth',
      },
    });
  });
});

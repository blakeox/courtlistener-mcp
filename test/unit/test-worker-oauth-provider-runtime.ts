#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeHostedAiClientOrigins } from '../../src/server/oauth-client-origins.js';

describe('OAuth client origins', () => {
  it('adds hosted AI client origins to registration CORS defaults', () => {
    const origins = mergeHostedAiClientOrigins(['https://auth.courtlistenermcp.blakeoxford.com']);

    assert.deepEqual(origins, [
      'https://auth.courtlistenermcp.blakeoxford.com',
      'https://chatgpt.com',
      'https://chat.openai.com',
      'https://claude.ai',
      'https://claude.com',
    ]);
  });

  it('preserves wildcard registrations unchanged', () => {
    const origins = mergeHostedAiClientOrigins(['*']);

    assert.deepEqual(origins, ['*']);
  });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { redactSecretsInText } from '../../src/infrastructure/secret-redaction.js';

describe('secret-redaction', () => {
  it('does not read process.env implicitly in the Worker-shared helper', () => {
    const source = readFileSync('src/infrastructure/secret-redaction.ts', 'utf8');
    assert.doesNotMatch(source, /process\.env/);
  });

  it('redacts bearer tokens and JWT-like values', () => {
    const jwt = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'eyJzdWIiOiJzZWNyZXQtdXNlciJ9',
      'signaturetoken',
    ].join('.');
    const redacted = redactSecretsInText(`Authorization: Bearer super-secret-token ${jwt}`);
    assert.equal(redacted.includes('super-secret-token'), false);
    assert.equal(redacted.includes(jwt), false);
    assert.equal(redacted.includes('[REDACTED]'), true);
  });

  it('redacts key/value style secret assignments', () => {
    const stripeFixture = `sk_${'test_1234567890'}`;
    const redacted = redactSecretsInText(
      `session_token=abc123456 api_key: ${stripeFixture} refresh_token=refresh-secret`,
    );
    assert.equal(redacted.includes('abc123456'), false);
    assert.equal(redacted.includes(stripeFixture), false);
    assert.equal(redacted.includes('refresh-secret'), false);
  });
});

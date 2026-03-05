import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { redactSecretsInText } from '../../src/infrastructure/secret-redaction.js';

describe('secret-redaction', () => {
  it('redacts bearer tokens and JWT-like values', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzZWNyZXQtdXNlciJ9.signaturetoken';
    const redacted = redactSecretsInText(`Authorization: Bearer super-secret-token ${jwt}`);
    assert.equal(redacted.includes('super-secret-token'), false);
    assert.equal(redacted.includes(jwt), false);
    assert.equal(redacted.includes('[REDACTED]'), true);
  });

  it('redacts key/value style secret assignments', () => {
    const redacted = redactSecretsInText(
      'session_token=abc123456 api_key: sk_test_1234567890 refresh_token=refresh-secret',
    );
    assert.equal(redacted.includes('abc123456'), false);
    assert.equal(redacted.includes('sk_test_1234567890'), false);
    assert.equal(redacted.includes('refresh-secret'), false);
  });
});

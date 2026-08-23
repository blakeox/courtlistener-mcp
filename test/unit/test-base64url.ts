import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decodeBase64Url,
  decodeBase64UrlBytes,
  encodeBase64Url,
} from '../../src/common/base64url.js';

describe('Worker base64url helpers', () => {
  it('round-trips UTF-8 text without Node Buffer', () => {
    const encoded = encodeBase64Url('offset:✓ / legal research');

    assert.equal(encoded.includes('+'), false);
    assert.equal(encoded.includes('/'), false);
    assert.equal(decodeBase64Url(encoded), 'offset:✓ / legal research');
  });

  it('round-trips arbitrary bytes', () => {
    const input = Uint8Array.from([0, 1, 127, 128, 254, 255]);

    assert.deepEqual(decodeBase64UrlBytes(encodeBase64Url(input)), input);
  });

  it('rejects malformed base64url input', () => {
    assert.equal(decodeBase64UrlBytes('%%%'), null);
    assert.equal(decodeBase64Url('%%%'), null);
  });
});

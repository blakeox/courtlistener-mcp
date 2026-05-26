import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertHostedAuthHtmlContentSecurityPolicy,
  assertOAuthApproveFormMarkup,
  HOSTED_AUTH_INLINE_SCRIPT_HASHES,
} from '../../src/server/hosted-auth-html-security.js';
import { htmlResponse } from '../../src/server/worker-response-runtime.js';
import { HOSTED_AUTH_HTML_SECURITY } from '../../src/server/hosted-auth-html-security.js';

function buildHostedAuthCsp(): string {
  const response = htmlResponse(
    '<html></html>',
    'test-nonce',
    undefined,
    HOSTED_AUTH_HTML_SECURITY,
  );
  return response.headers.get('content-security-policy') ?? '';
}

describe('hosted-auth-html-security', () => {
  it('accepts production-shaped hosted auth CSP without form-action', () => {
    const csp = buildHostedAuthCsp();
    assertHostedAuthHtmlContentSecurityPolicy(csp);
    assert.doesNotMatch(csp, /form-action/);
    for (const hash of HOSTED_AUTH_INLINE_SCRIPT_HASHES) {
      assert.match(csp, new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('rejects hosted auth CSP that includes form-action', () => {
    assert.throws(
      () => assertHostedAuthHtmlContentSecurityPolicy("default-src 'self'; form-action 'self'"),
      /omit form-action/,
    );
  });

  it('requires OAuth approve form to POST to /oauth/approve without query on action', () => {
    const html = `
      <form method="post" action="/oauth/approve">
        <input type="hidden" name="return_to" value="https://worker.example/oauth/authorize?client_id=x" />
      </form>
    `;
    assertOAuthApproveFormMarkup(html);
  });

  it('rejects approve form actions that embed return_to in the action URL', () => {
    assert.throws(
      () =>
        assertOAuthApproveFormMarkup(
          '<form method="post" action="/oauth/approve?return_to=%2F"><input name="return_to" /></form>',
        ),
      /must not include query parameters/,
    );
  });
});

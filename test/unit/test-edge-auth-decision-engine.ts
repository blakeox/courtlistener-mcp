import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildEdgeAuthDecisionEngine } from '../../src/server/edge-auth-decision-engine.js';

describe('edge-auth-decision-engine', () => {
  it('uses precedence when no explicit primary is requested', () => {
    const decision = buildEdgeAuthDecisionEngine({
      requestedPrimary: null,
      serviceTokenConfigured: false,
      oidcConfigured: true,
    });

    assert.equal(decision.effectivePrimary, 'oidc');
    assert.deepEqual(decision.attempts, ['oidc']);
  });

  it('normalizes oauth alias to oidc', () => {
    const decision = buildEdgeAuthDecisionEngine({
      requestedPrimary: 'oauth',
      serviceTokenConfigured: false,
      oidcConfigured: true,
    });

    assert.equal(decision.requestedPrimary, 'oidc');
    assert.equal(decision.effectivePrimary, 'oidc');
  });

  it('always keeps service token evaluation ahead of primary auth', () => {
    const decision = buildEdgeAuthDecisionEngine({
      requestedPrimary: 'oidc',
      serviceTokenConfigured: true,
      oidcConfigured: true,
    });

    assert.deepEqual(decision.attempts, ['serviceToken', 'oidc']);
  });

  it('keeps service-token-only auth when OIDC is absent', () => {
    const decision = buildEdgeAuthDecisionEngine({
      requestedPrimary: null,
      serviceTokenConfigured: true,
      oidcConfigured: false,
    });

    assert.equal(decision.effectivePrimary, null);
    assert.deepEqual(decision.attempts, ['serviceToken']);
  });
});

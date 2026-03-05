import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildEdgeAuthDecisionEngine } from '../../src/server/edge-auth-decision-engine.js';

describe('edge-auth-decision-engine', () => {
  it('uses precedence when no explicit primary is requested', () => {
    const decision = buildEdgeAuthDecisionEngine({
      requestedPrimary: null,
      allowStaticFallback: false,
      serviceTokenConfigured: false,
      supabaseConfigured: true,
      oidcConfigured: true,
      staticTokenConfigured: true,
    });

    assert.equal(decision.effectivePrimary, 'supabase');
    assert.deepEqual(decision.attempts, ['supabase']);
  });

  it('normalizes oauth alias to oidc', () => {
    const decision = buildEdgeAuthDecisionEngine({
      requestedPrimary: 'oauth',
      allowStaticFallback: false,
      serviceTokenConfigured: false,
      supabaseConfigured: false,
      oidcConfigured: true,
      staticTokenConfigured: true,
    });

    assert.equal(decision.requestedPrimary, 'oidc');
    assert.equal(decision.effectivePrimary, 'oidc');
  });

  it('always keeps service token evaluation ahead of primary auth', () => {
    const decision = buildEdgeAuthDecisionEngine({
      requestedPrimary: 'supabase',
      allowStaticFallback: false,
      serviceTokenConfigured: true,
      supabaseConfigured: true,
      oidcConfigured: false,
      staticTokenConfigured: true,
    });

    assert.deepEqual(decision.attempts, ['serviceToken', 'supabase']);
  });

  it('adds static auth as explicit fallback only when enabled', () => {
    const decision = buildEdgeAuthDecisionEngine({
      requestedPrimary: 'supabase',
      allowStaticFallback: true,
      serviceTokenConfigured: false,
      supabaseConfigured: true,
      oidcConfigured: false,
      staticTokenConfigured: true,
    });

    assert.deepEqual(decision.attempts, ['supabase', 'static']);
  });
});

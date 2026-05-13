#!/usr/bin/env node

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  buildHostedAuthStartHref,
  redirectToHostedAuth,
} from '../../src/web-spa/src/lib/hosted-auth.js';

describe('web-spa hosted auth helpers', () => {
  const originalWindow = (globalThis as Record<string, unknown>).window;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).window = {
      location: {
        replace: () => undefined,
      },
    };
  });

  afterEach(() => {
    mock.restoreAll();
    if (originalWindow) {
      (globalThis as Record<string, unknown>).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('buildHostedAuthStartHref targets the default account route', () => {
    assert.equal(buildHostedAuthStartHref(), '/auth/start?return_to=%2Fapp%2Faccount');
  });

  it('buildHostedAuthStartHref accepts an explicit return target', () => {
    assert.equal(
      buildHostedAuthStartHref('/app/playground'),
      '/auth/start?return_to=%2Fapp%2Fplayground',
    );
  });

  it('redirectToHostedAuth replaces location with the hosted auth start URL', () => {
    const replace = mock.fn();
    (globalThis as Record<string, unknown>).window = {
      location: {
        replace,
      },
    };

    redirectToHostedAuth('/app/playground');

    assert.equal(replace.mock.callCount(), 1);
    assert.deepEqual(replace.mock.calls[0].arguments, [
      '/auth/start?return_to=%2Fapp%2Fplayground',
    ]);
  });
});

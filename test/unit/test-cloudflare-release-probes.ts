import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseArgs,
  versionOverrideHeader,
} from '../../scripts/cloudflare/collect-release-probes.mjs';

describe('Cloudflare release probe contracts', () => {
  it('builds the paired Edge and MCP version override header', () => {
    assert.equal(
      versionOverrideHeader({
        uploaded_version_ids: {
          edge: 'edge-version',
          mcp: 'mcp-version',
        },
      }),
      'courtlistener-mcp="edge-version", courtlistener-mcp-mcp="mcp-version"',
    );
  });

  it('defaults probes to the staging environment and enables overrides', () => {
    const previousEnvironment = process.env.CLOUDFLARE_RELEASE_ENVIRONMENT;
    const previousOverride = process.env.RELEASE_VERSION_OVERRIDE;
    delete process.env.CLOUDFLARE_RELEASE_ENVIRONMENT;
    delete process.env.RELEASE_VERSION_OVERRIDE;
    try {
      const options = parseArgs([]);
      assert.equal(options.environment, 'staging');
      assert.equal(options.override, true);
    } finally {
      if (previousEnvironment === undefined) delete process.env.CLOUDFLARE_RELEASE_ENVIRONMENT;
      else process.env.CLOUDFLARE_RELEASE_ENVIRONMENT = previousEnvironment;
      if (previousOverride === undefined) delete process.env.RELEASE_VERSION_OVERRIDE;
      else process.env.RELEASE_VERSION_OVERRIDE = previousOverride;
    }
  });
});

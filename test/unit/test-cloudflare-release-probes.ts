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
    const options = parseArgs([]);
    assert.equal(options.environment, 'staging');
    assert.equal(options.override, true);
  });
});

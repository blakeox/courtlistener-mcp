import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  hasManagedCodexCourtlistenerBlock,
  hasUnmanagedCodexCourtlistenerBlock,
  upsertManagedCodexCourtlistenerBlock,
} from '../../src/cli/setup.js';

describe('cli setup codex helpers', () => {
  const managedTomlBlock = `
[mcp_servers.courtlistener]
url = "https://courtlistenermcp.blakeoxford.com/mcp"
`.trim();

  it('appends a managed Codex MCP block without changing unrelated config', () => {
    const existing = `
model = "gpt-5.5"

[features]
multi_agent = true
`.trim();

    const updated = upsertManagedCodexCourtlistenerBlock(existing, managedTomlBlock);

    assert.match(updated, /^model = "gpt-5\.5"/);
    assert.match(updated, /\[features\]\nmulti_agent = true/);
    assert.ok(hasManagedCodexCourtlistenerBlock(updated));
    assert.match(
      updated,
      /\[mcp_servers\.courtlistener\]\nurl = "https:\/\/courtlistenermcp\.blakeoxford\.com\/mcp"/,
    );
  });

  it('replaces only the managed Codex MCP block on rerun', () => {
    const existing = `
model = "gpt-5.5"

# >>> courtlistener-mcp codex >>>
[mcp_servers.courtlistener]
url = "https://old.example.com/mcp"
# <<< courtlistener-mcp codex <<<

[features]
multi_agent = true
`.trim();

    const updated = upsertManagedCodexCourtlistenerBlock(existing, managedTomlBlock);

    assert.equal(updated.includes('https://old.example.com/mcp'), false);
    assert.equal(updated.match(/# >>> courtlistener-mcp codex >>>/g)?.length, 1);
    assert.equal(updated.match(/# <<< courtlistener-mcp codex <<</g)?.length, 1);
    assert.match(updated, /\[features\]\nmulti_agent = true/);
  });

  it('detects unmanaged existing courtlistener Codex sections', () => {
    const unmanaged = `
[mcp_servers.courtlistener]
url = "https://custom.example.com/mcp"
`.trim();

    assert.equal(hasUnmanagedCodexCourtlistenerBlock(unmanaged), true);
    assert.equal(hasManagedCodexCourtlistenerBlock(unmanaged), false);
  });
});

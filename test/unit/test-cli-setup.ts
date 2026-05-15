import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  hasManagedCodexCourtlistenerBlock,
  hasUnmanagedCodexCourtlistenerBlock,
  upsertManagedCodexCourtlistenerBlock,
  writeTextFileAtomically,
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

    assert.doesNotMatch(updated, /url = "https:\/\/old\.example\.com\/mcp"/);
    assert.equal(updated.match(/# >>> courtlistener-mcp codex >>>/g)?.length, 1);
    assert.equal(updated.match(/# <<< courtlistener-mcp codex <<</g)?.length, 1);
    assert.match(updated, /\[features\]\nmulti_agent = true/);
  });

  it('deduplicates multiple managed Codex MCP blocks on rerun', () => {
    const existing = `
model = "gpt-5.5"

# >>> courtlistener-mcp codex >>>
[mcp_servers.courtlistener]
url = "https://old-1.example.com/mcp"
# <<< courtlistener-mcp codex <<<

# >>> courtlistener-mcp codex >>>
[mcp_servers.courtlistener]
url = "https://old-2.example.com/mcp"
# <<< courtlistener-mcp codex <<<

[mcp_servers.courtlistener]
url = "https://custom.example.com/mcp"
`.trim();

    const updated = upsertManagedCodexCourtlistenerBlock(existing, managedTomlBlock);

    assert.equal(updated.match(/# >>> courtlistener-mcp codex >>>/g)?.length, 1);
    assert.equal(updated.match(/# <<< courtlistener-mcp codex <<</g)?.length, 1);
    assert.doesNotMatch(updated, /old-1\.example\.com/);
    assert.doesNotMatch(updated, /old-2\.example\.com/);
    assert.match(updated, /https:\/\/custom\.example\.com\/mcp/);
    assert.doesNotMatch(updated, /\n{3,}/);
  });

  it('is idempotent when rerun with an existing managed Codex MCP block', () => {
    const once = upsertManagedCodexCourtlistenerBlock('', managedTomlBlock);
    const twice = upsertManagedCodexCourtlistenerBlock(once, managedTomlBlock);

    assert.equal(twice, once);
  });

  it('detects unmanaged existing courtlistener Codex sections', () => {
    const unmanaged = `
[mcp_servers.courtlistener]
url = "https://custom.example.com/mcp"
`.trim();

    assert.equal(hasUnmanagedCodexCourtlistenerBlock(unmanaged), true);
    assert.equal(hasManagedCodexCourtlistenerBlock(unmanaged), false);
  });

  it('detects unmanaged Codex sections outside the managed block', () => {
    const mixed = `
# >>> courtlistener-mcp codex >>>
[mcp_servers.courtlistener]
url = "https://courtlistenermcp.blakeoxford.com/mcp"
# <<< courtlistener-mcp codex <<<

[mcp_servers.courtlistener]
url = "https://custom.example.com/mcp"
`.trim();

    assert.equal(hasManagedCodexCourtlistenerBlock(mixed), true);
    assert.equal(hasUnmanagedCodexCourtlistenerBlock(mixed), true);
  });

  it('preserves symlink targets and existing file mode for atomic writes', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'courtlistener-cli-setup-'));
    try {
      const targetDir = join(tempDir, 'real');
      mkdirSync(targetDir, { recursive: true });
      const targetPath = join(targetDir, 'config.toml');
      const symlinkPath = join(tempDir, 'config.toml');

      writeFileSync(targetPath, 'before\n', 'utf8');
      chmodSync(targetPath, 0o640);
      symlinkSync(targetPath, symlinkPath);

      writeTextFileAtomically(symlinkPath, 'after\n');

      assert.equal(readlinkSync(symlinkPath), targetPath);
      assert.equal(readFileSync(targetPath, 'utf8'), 'after\n');
      assert.equal(statSync(targetPath).mode & 0o777, 0o640);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

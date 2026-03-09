import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const gitDir = path.join(repoRoot, '.git');
const hooksDir = path.join(repoRoot, '.githooks');
const legacyHooksDir = path.join(repoRoot, '.husky');

function log(message) {
  process.stdout.write(`${message}\n`);
}

if (!existsSync(gitDir)) {
  log('Skipping git hook installation because `.git` is not present.');
  process.exit(0);
}

mkdirSync(hooksDir, { recursive: true });

const hooks = {
  'pre-commit': 'pre-commit',
  'pre-push': 'pre-push',
  'prepare-commit-msg': 'prepare-commit-msg',
};

for (const [filename, hookName] of Object.entries(hooks)) {
  const target = path.join(hooksDir, filename);
  const content = `#!/bin/sh\n\nif command -v lefthook >/dev/null 2>&1; then\n  exec lefthook run ${hookName} "$@"\nfi\n\nexec pnpm exec lefthook run ${hookName} "$@"\n`;
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current !== content) writeFileSync(target, content, 'utf8');
  chmodSync(target, 0o755);
}

execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

const legacyManagedDir = path.join(legacyHooksDir, '_');
if (existsSync(legacyManagedDir)) {
  rmSync(legacyManagedDir, { recursive: true, force: true });
}
if (existsSync(legacyHooksDir)) {
  try {
    rmSync(legacyHooksDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors; the hook path has already been migrated.
  }
}

log('Git hooks installed in `.githooks` via Lefthook.');

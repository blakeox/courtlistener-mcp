#!/usr/bin/env node

/**
 * Interactive first-run setup wizard for the CourtListener MCP Server.
 * Detects MCP clients, prompts for configuration, and writes config files.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Types ──────────────────────────────────────────────────────────

interface McpClient {
  id: string;
  name: string;
  configFile: string; // template filename in configs/
  configPath: string | null; // target path on disk (null = print to stdout)
  merge: boolean; // whether to merge into an existing config
  format: 'json' | 'managed-toml';
}

// ── Helpers ────────────────────────────────────────────────────────

const home = homedir();
const os = platform();

function claudeDesktopConfigPath(): string {
  if (os === 'win32') {
    return join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  }
  if (os === 'linux') {
    return join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }
  // macOS
  return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
}

function claudeCodeConfigPath(): string {
  return join(home, '.claude.json');
}

function cursorConfigPath(): string {
  return join(home, '.cursor', 'mcp.json');
}

function continueConfigPath(): string {
  return join(home, '.continue', 'config.json');
}

function zedSettingsPath(): string {
  if (os === 'linux') {
    return join(home, '.config', 'zed', 'settings.json');
  }
  // macOS
  return join(home, '.config', 'zed', 'settings.json');
}

function vscodeSettingsPath(): string {
  if (os === 'win32') {
    return join(home, 'AppData', 'Roaming', 'Code', 'User', 'settings.json');
  }
  if (os === 'linux') {
    return join(home, '.config', 'Code', 'User', 'settings.json');
  }
  // macOS
  return join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
}

function codexConfigPath(): string {
  return join(home, '.codex', 'config.toml');
}

const CODEX_MANAGED_BLOCK_START = '# >>> courtlistener-mcp codex >>>';
const CODEX_MANAGED_BLOCK_END = '# <<< courtlistener-mcp codex <<<';
const CODEX_COURTLISTENER_SECTION_HEADER = '[mcp_servers.courtlistener]';

// ── Client definitions ─────────────────────────────────────────────

const CLIENTS: McpClient[] = [
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    configFile: 'claude-desktop.json',
    configPath: claudeDesktopConfigPath(),
    merge: true,
    format: 'json',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    configFile: 'claude-desktop.json',
    configPath: claudeCodeConfigPath(),
    merge: true,
    format: 'json',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    configFile: 'cursor.json',
    configPath: cursorConfigPath(),
    merge: true,
    format: 'json',
  },
  {
    id: 'continue',
    name: 'Continue',
    configFile: 'continue-dev.json',
    configPath: continueConfigPath(),
    merge: false,
    format: 'json',
  },
  {
    id: 'vscode-copilot',
    name: 'VS Code Copilot',
    configFile: 'vscode-copilot.json',
    configPath: vscodeSettingsPath(),
    merge: true,
    format: 'json',
  },
  {
    id: 'codex-cli',
    name: 'Codex CLI',
    configFile: 'codex.toml',
    configPath: codexConfigPath(),
    merge: false,
    format: 'managed-toml',
  },
  {
    id: 'zed',
    name: 'Zed',
    configFile: 'zed.json',
    configPath: zedSettingsPath(),
    merge: true,
    format: 'json',
  },
  {
    id: 'other',
    name: 'Other',
    configFile: 'claude-desktop.json',
    configPath: null,
    merge: false,
    format: 'json',
  },
];

// ── Detection ──────────────────────────────────────────────────────

interface DetectedClient {
  client: McpClient;
  found: boolean;
}

function detectClients(): DetectedClient[] {
  const detectionPaths: Record<string, string[]> = {
    'claude-desktop': [claudeDesktopConfigPath()],
    'claude-code': [join(home, '.claude'), claudeCodeConfigPath()],
    cursor: [join(home, '.cursor')],
    continue: [join(home, '.continue')],
    'vscode-copilot': [vscodeSettingsPath(), join(home, '.vscode')],
    'codex-cli': [codexConfigPath(), join(home, '.codex')],
    zed: [join(home, '.config', 'zed')],
  };

  return CLIENTS.map((client) => {
    const paths = detectionPaths[client.id];
    const found = paths ? paths.some((p) => existsSync(p)) : false;
    return { client, found };
  });
}

// ── Readline helpers ───────────────────────────────────────────────

function createRl(): ReturnType<typeof createInterface> {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

// ── Config generation ──────────────────────────────────────────────

function findConfigsDir(): string {
  // When running from dist/cli/setup.js, configs/ is at project root
  const thisFile = fileURLToPath(import.meta.url);
  // Try: project root relative to dist/
  let candidate = resolve(dirname(thisFile), '..', '..', 'configs');
  if (existsSync(candidate)) return candidate;
  // Try: from src/ during development
  candidate = resolve(dirname(thisFile), '..', '..', 'configs');
  if (existsSync(candidate)) return candidate;
  // Try: relative to cwd as fallback (for npx)
  candidate = resolve(process.cwd(), 'configs');
  if (existsSync(candidate)) return candidate;
  // npm global install: configs is sibling to dist in the package
  candidate = resolve(dirname(thisFile), '..', 'configs');
  if (existsSync(candidate)) return candidate;
  throw new Error(
    'Could not locate configs/ directory. Ensure you are running from the project root.',
  );
}

function loadTemplate(client: McpClient, apiKey: string): string {
  const configsDir = findConfigsDir();
  const templatePath = join(configsDir, client.configFile);
  let content = readFileSync(templatePath, 'utf-8');

  // Replace placeholder paths with actual project path
  const projectDir = process.cwd();
  content = content.replace(/\/path\/to\/courtlistener-mcp/g, projectDir);

  if (client.format !== 'json') {
    return content;
  }

  // Replace API key placeholder
  if (apiKey) {
    content = content.replace(/your-api-key/g, apiKey);
  } else {
    // Remove the env block if no API key provided
    content = content.replace(/"COURTLISTENER_API_KEY":\s*"your-api-key"/g, '');
    // Clean up empty env objects
    content = content.replace(/"env":\s*\{\s*\}/g, '');
    // Remove trailing commas left behind (simple cleanup)
    content = content.replace(/,(\s*})/g, '$1');
  }

  return content;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCodexManagedBlock(content: string): string {
  return `${CODEX_MANAGED_BLOCK_START}\n${content.trim()}\n${CODEX_MANAGED_BLOCK_END}`;
}

export function hasManagedCodexCourtlistenerBlock(content: string): boolean {
  return content.includes(CODEX_MANAGED_BLOCK_START) && content.includes(CODEX_MANAGED_BLOCK_END);
}

export function hasUnmanagedCodexCourtlistenerBlock(content: string): boolean {
  return (
    !hasManagedCodexCourtlistenerBlock(content) &&
    new RegExp(`^\\s*${escapeRegExp(CODEX_COURTLISTENER_SECTION_HEADER)}\\s*$`, 'm').test(content)
  );
}

export function upsertManagedCodexCourtlistenerBlock(
  existingContent: string,
  managedBlockContent: string,
): string {
  const managedBlock = getCodexManagedBlock(managedBlockContent);
  if (hasManagedCodexCourtlistenerBlock(existingContent)) {
    const managedPattern = new RegExp(
      `${escapeRegExp(CODEX_MANAGED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(CODEX_MANAGED_BLOCK_END)}`,
      'm',
    );
    return existingContent.replace(managedPattern, managedBlock);
  }

  const trimmed = existingContent.trimEnd();
  return trimmed.length > 0 ? `${trimmed}\n\n${managedBlock}\n` : `${managedBlock}\n`;
}

function mergeConfig(
  existingPath: string,
  newConfig: Record<string, unknown>,
): Record<string, unknown> {
  let existing: Record<string, unknown> = {};
  if (existsSync(existingPath)) {
    try {
      existing = JSON.parse(readFileSync(existingPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // If existing file is invalid JSON, start fresh
      existing = {};
    }
  }

  // Deep merge for mcpServers / mcp.servers / context_servers
  for (const key of Object.keys(newConfig)) {
    const newVal = newConfig[key];
    const existingVal = existing[key];
    if (
      typeof newVal === 'object' &&
      newVal !== null &&
      typeof existingVal === 'object' &&
      existingVal !== null &&
      !Array.isArray(newVal) &&
      !Array.isArray(existingVal)
    ) {
      existing[key] = {
        ...(existingVal as Record<string, unknown>),
        ...(newVal as Record<string, unknown>),
      };
    } else {
      existing[key] = newVal;
    }
  }

  return existing;
}

function writeTextFileAtomically(filePath: string, content: string, mode?: number): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const tempPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, content, { encoding: 'utf-8', mode });
  renameSync(tempPath, filePath);
}

function writeConfig(client: McpClient, configContent: string): string | null {
  if (!client.configPath) return null;

  if (client.format === 'managed-toml') {
    const existing = existsSync(client.configPath) ? readFileSync(client.configPath, 'utf-8') : '';
    const finalConfig = upsertManagedCodexCourtlistenerBlock(existing, configContent);
    if (existsSync(client.configPath)) {
      const backupPath = `${client.configPath}.bak`;
      if (!existsSync(backupPath)) {
        copyFileSync(client.configPath, backupPath);
      }
    }
    writeTextFileAtomically(client.configPath, finalConfig, 0o600);
    return client.configPath;
  }

  const parsed = JSON.parse(configContent) as Record<string, unknown>;

  let finalConfig: Record<string, unknown>;
  if (client.merge && existsSync(client.configPath)) {
    finalConfig = mergeConfig(client.configPath, parsed);
  } else {
    finalConfig = parsed;
  }

  writeTextFileAtomically(client.configPath, JSON.stringify(finalConfig, null, 2) + '\n');
  return client.configPath;
}

// ── Main wizard ────────────────────────────────────────────────────

export async function runSetup(): Promise<void> {
  const rl = createRl();

  try {
    console.log('\n🔧 CourtListener MCP Server — Setup Wizard\n');

    // Step 1: Detect clients
    const detected = detectClients();
    const autoDetected = detected.filter((d) => d.found);

    console.log('Detected MCP clients on this machine:');
    if (autoDetected.length === 0) {
      console.log('  (none detected)\n');
    } else {
      for (const d of autoDetected) {
        console.log(`  ✅ ${d.client.name}`);
      }
      console.log();
    }

    // Step 2: Choose client
    console.log('Which MCP client would you like to configure?\n');
    for (let i = 0; i < CLIENTS.length; i++) {
      const client = CLIENTS[i];
      if (!client) continue;
      const marker = detected.find((d) => d.client.id === client.id)?.found ? ' (detected)' : '';
      console.log(`  ${i + 1}) ${client.name}${marker}`);
    }
    console.log();

    const autoDetectedClient = autoDetected[0]?.client;
    const defaultChoice =
      autoDetectedClient !== undefined ? String(CLIENTS.indexOf(autoDetectedClient) + 1) : '1';

    const choiceStr = await ask(rl, `Enter choice [${defaultChoice}]: `);
    const choiceNum = parseInt(choiceStr || defaultChoice, 10);

    if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > CLIENTS.length) {
      console.error('\n❌ Invalid choice. Exiting.\n');
      process.exit(1);
    }

    const selectedClient = CLIENTS[choiceNum - 1];
    if (!selectedClient) {
      console.error('\n❌ Invalid choice. Exiting.\n');
      process.exit(1);
    }
    console.log(`\n→ Configuring for ${selectedClient.name}\n`);

    // Step 3: API key
    let apiKey = '';
    if (selectedClient.id === 'codex-cli') {
      console.log(
        'Codex CLI uses hosted OAuth for this setup, so no CourtListener API key is needed.',
      );
      console.log('You will authenticate after setup with `codex mcp login courtlistener`.\n');
    } else {
      console.log('CourtListener API key (optional — public endpoints work without one).');
      console.log('Get one free at: https://www.courtlistener.com/help/api/rest/#permissions\n');
      apiKey = await ask(rl, 'API key (press Enter to skip): ');

      if (apiKey) {
        console.log('  ✅ API key will be saved in config');
      } else {
        console.log('  ⏭️  Skipping API key (you can add it later)');
      }
      console.log();
    }

    // Step 4: Generate config
    const configContent = loadTemplate(selectedClient, apiKey);

    if (selectedClient.configPath) {
      // Check if file already exists and has courtlistener configured
      if (existsSync(selectedClient.configPath)) {
        try {
          const existing = readFileSync(selectedClient.configPath, 'utf-8');
          if (
            selectedClient.format === 'managed-toml' &&
            hasUnmanagedCodexCourtlistenerBlock(existing)
          ) {
            console.log(
              `\n⚠️  ${selectedClient.configPath} already has an unmanaged ${CODEX_COURTLISTENER_SECTION_HEADER} entry.`,
            );
            console.log(
              'Merge this managed block manually so the wizard can update it safely later:\n',
            );
            console.log('─'.repeat(60));
            console.log(getCodexManagedBlock(configContent));
            console.log('─'.repeat(60));
            printNextSteps(selectedClient, null);
            return;
          }
          if (
            (selectedClient.format === 'managed-toml' &&
              hasManagedCodexCourtlistenerBlock(existing)) ||
            (selectedClient.format === 'json' && existing.includes('courtlistener'))
          ) {
            const overwrite = await ask(
              rl,
              `⚠️  ${selectedClient.configPath} already has a courtlistener entry. Overwrite? [y/N]: `,
            );
            if (overwrite.toLowerCase() !== 'y') {
              console.log(
                '\n⏭️  Skipping config write. Here is the config you can merge manually:\n',
              );
              console.log(
                selectedClient.format === 'managed-toml'
                  ? getCodexManagedBlock(configContent)
                  : configContent,
              );
              printNextSteps(selectedClient, null);
              return;
            }
          }
        } catch {
          // File exists but can't be read; proceed with write
        }
      }

      const writtenPath = writeConfig(selectedClient, configContent);
      if (writtenPath) {
        console.log(`✅ Config written to: ${writtenPath}`);
      }
      printNextSteps(selectedClient, writtenPath);
    } else {
      // "Other" client — print to stdout
      console.log('Add this to your MCP client configuration:\n');
      console.log('─'.repeat(60));
      console.log(configContent);
      console.log('─'.repeat(60));
      printNextSteps(selectedClient, null);
    }
  } finally {
    rl.close();
  }
}

function printNextSteps(client: McpClient, writtenPath: string | null): void {
  console.log('\n📋 Next steps:\n');

  if (client.id === 'codex-cli') {
    if (!writtenPath && client.configPath) {
      console.log(`  1. Copy the managed block above to: ${client.configPath}`);
      console.log('  2. Run `codex mcp login courtlistener`');
      console.log('  3. Restart Codex if it is already open');
      console.log('  4. Run `/mcp` in Codex to confirm the server is available\n');
    } else {
      console.log('  1. Run `codex mcp login courtlistener`');
      console.log('  2. Restart Codex if it is already open');
      console.log('  3. Run `/mcp` in Codex to confirm the server is available\n');
    }
    console.log('📖 Docs: https://developers.openai.com/codex/mcp\n');
    return;
  }

  if (!writtenPath && client.configPath) {
    console.log(`  1. Copy the config above to: ${client.configPath}`);
    console.log('  2. Restart your MCP client');
  } else if (writtenPath) {
    console.log(`  1. Restart ${client.name} to pick up the new configuration`);
  } else {
    console.log('  1. Add the config above to your MCP client');
    console.log('  2. Restart your MCP client');
  }

  console.log('  3. Run `npx courtlistener-mcp --doctor` to verify connectivity');
  console.log('  4. Try a search: "Find Supreme Court cases about free speech"\n');
  console.log('📖 Docs: https://github.com/blakeox/courtlistener-mcp#readme\n');
}

#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_URLS = {
  staging: {
    base: 'https://courtlistener-mcp-staging-edge.blakeoxford.workers.dev',
    direct: 'https://courtlistener-mcp-staging-mcp.blakeoxford.workers.dev',
  },
  production: {
    base: 'https://courtlistenermcp.blakeoxford.com',
    direct: 'https://courtlistener-mcp-mcp.blakeoxford.workers.dev',
  },
};

function parseArgs(argv) {
  const options = {
    environment: process.env.CLOUDFLARE_RELEASE_ENVIRONMENT || 'staging',
    stateFile: process.env.CLOUDFLARE_RELEASE_STATE || 'release-state.json',
    outputDirectory: process.env.CLOUDFLARE_PROBE_DIRECTORY || 'release-probes',
    baseUrl: process.env.RELEASE_BASE_URL || '',
    directUrl: process.env.RELEASE_DIRECT_MCP_URL || '',
    override: process.env.RELEASE_VERSION_OVERRIDE !== 'false',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === '--environment') options.environment = next() || options.environment;
    else if (arg.startsWith('--environment=')) options.environment = arg.split('=')[1];
    else if (arg === '--state-file') options.stateFile = next() || options.stateFile;
    else if (arg.startsWith('--state-file=')) options.stateFile = arg.split('=')[1];
    else if (arg === '--output-directory')
      options.outputDirectory = next() || options.outputDirectory;
    else if (arg.startsWith('--output-directory=')) options.outputDirectory = arg.split('=')[1];
    else if (arg === '--base-url') options.baseUrl = next() || options.baseUrl;
    else if (arg.startsWith('--base-url=')) options.baseUrl = arg.split('=')[1];
    else if (arg === '--direct-url') options.directUrl = next() || options.directUrl;
    else if (arg.startsWith('--direct-url=')) options.directUrl = arg.split('=')[1];
    else if (arg === '--no-override') options.override = false;
  }
  return options;
}

function readState(file) {
  if (!existsSync(file)) throw new Error(`Release state file does not exist: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function versionOverrideHeader(state) {
  const edge = state.uploaded_version_ids.edge;
  const mcp = state.uploaded_version_ids.mcp;
  if (!edge || !mcp)
    throw new Error('Release state must contain Edge and MCP uploaded version IDs.');
  return `courtlistener-mcp="${edge}", courtlistener-mcp-mcp="${mcp}"`;
}

async function probe(name, url, init, acceptedStatuses) {
  try {
    const response = await fetch(url, init);
    const result = {
      name,
      url,
      status: response.status,
      accepted: acceptedStatuses.includes(response.status),
      override_applied: Boolean(init?.headers?.['Cloudflare-Workers-Version-Overrides']),
      headers: {
        location: response.headers.get('location'),
        hosted_auth_ready: response.headers.get('x-hosted-auth-ready'),
        hosted_auth_status: response.headers.get('x-hosted-auth-status'),
      },
    };
    await response.body?.cancel();
    return result;
  } catch (error) {
    return {
      name,
      url,
      status: 0,
      accepted: false,
      override_applied: Boolean(init?.headers?.['Cloudflare-Workers-Version-Overrides']),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeArtifact(directory, name, result) {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${name}.json`);
  writeFileSync(file, `${JSON.stringify({ schema_version: 'v1', ...result }, null, 2)}\n`);
  return file;
}

export async function collectReleaseProbes(options) {
  const state = readState(options.stateFile);
  const urls = DEFAULT_URLS[options.environment];
  if (!urls) throw new Error('environment must be staging or production.');
  const baseUrl = (options.baseUrl || urls.base).replace(/\/$/u, '');
  const directUrl = (options.directUrl || urls.direct).replace(/\/$/u, '');
  const headers = { Accept: 'application/json' };
  if (options.override)
    headers['Cloudflare-Workers-Version-Overrides'] = versionOverrideHeader(state);

  const results = {
    health: await probe('health', `${baseUrl}/health`, { headers }, [200]),
    readiness: await probe('readiness', `${baseUrl}/ready`, { headers }, [200]),
    oauth: await probe(
      'oauth',
      `${baseUrl}/.well-known/oauth-authorization-server`,
      { headers },
      [200],
    ),
    mcp_initialize: await probe(
      'mcp_initialize',
      `${baseUrl}/mcp`,
      {
        method: 'POST',
        headers: {
          ...headers,
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2025-03-26',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'cloudflare-release-controller', version: '1' },
          },
        }),
      },
      [200, 401, 403, 429],
    ),
    direct_mcp_denial: await probe(
      'direct_mcp_denial',
      `${directUrl}/mcp`,
      { headers: { Accept: 'application/json' } },
      [403, 404, 410, 1042],
    ),
  };
  const probesAccepted = Object.values(results).every((result) => result.accepted);
  results.version_override = {
    name: 'version_override',
    accepted: probesAccepted,
    override_applied: options.override,
    status: probesAccepted ? 200 : 500,
    note: 'Confirm the invoked version IDs with Workers Logs/Tail; HTTP responses do not identify the selected version by themselves.',
  };

  const files = Object.fromEntries(
    Object.entries(results).map(([name, result]) => [
      name,
      writeArtifact(options.outputDirectory, name, result),
    ]),
  );
  const summary = {
    schema_version: 'v1',
    environment: options.environment,
    base_url: baseUrl,
    override_enabled: options.override,
    all_accepted: Object.values(results).every((result) => result.accepted),
    files,
  };
  writeFileSync(
    join(options.outputDirectory, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  return summary;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  collectReleaseProbes(parseArgs(process.argv.slice(2)))
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      if (!summary.all_accepted) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

export { DEFAULT_URLS, parseArgs, versionOverrideHeader };

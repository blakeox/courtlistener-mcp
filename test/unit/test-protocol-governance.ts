#!/usr/bin/env node

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  DEPRECATION_POLICY,
  getAdvertisedCapabilityKeys,
  negotiateCapabilityProfile,
  getProtocolContract,
  GOVERNANCE_DEPRECATIONS,
  GOVERNED_PROMPT_NAMES,
  GOVERNED_PROTOCOL_POINTERS,
  GOVERNED_RESOURCE_URIS,
  GOVERNED_TOOL_NAMES,
  MCP_PROTOCOL_CAPABILITY_CONTRACT,
  validateGovernanceDeprecations,
} from '../../src/infrastructure/protocol-governance.js';
import {
  PREFERRED_MCP_PROTOCOL_VERSION,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
} from '../../src/infrastructure/protocol-constants.js';
import { bootstrapServices } from '../../src/infrastructure/bootstrap.js';
import { container } from '../../src/infrastructure/container.js';
import { CacheManager } from '../../src/infrastructure/cache.js';
import { Logger } from '../../src/infrastructure/logger.js';
import { startHttpTransport } from '../../src/server/http-transport-server.js';
import { PromptHandlerRegistry } from '../../src/server/prompt-handler.js';
import { ResourceHandlerRegistry } from '../../src/server/resource-handler.js';
import { ToolHandlerRegistry } from '../../src/server/tool-handler.js';
import { getEnhancedToolDefinitions } from '../../src/tool-definitions.js';
import { assertInvalidSessionLifecycleShape } from '../utils/mcp-transport-contract.js';

describe('protocol governance contract matrix', () => {
  before(() => {
    bootstrapServices();
  });

  after(() => {
    const cache = container.get<CacheManager>('cache');
    cache.destroy();
    container.clearAll();
  });

  it('covers every supported MCP protocol version', () => {
    const contractVersions = Object.keys(MCP_PROTOCOL_CAPABILITY_CONTRACT).sort();
    const supportedVersions = [...SUPPORTED_MCP_PROTOCOL_VERSIONS].sort();

    assert.deepEqual(contractVersions, supportedVersions);
    assert.equal(
      getProtocolContract(PREFERRED_MCP_PROTOCOL_VERSION).protocolVersion,
      PREFERRED_MCP_PROTOCOL_VERSION,
    );
    assert.equal(
      getProtocolContract(GOVERNED_PROTOCOL_POINTERS.defaultProtocolVersion).protocolVersion,
      GOVERNED_PROTOCOL_POINTERS.defaultProtocolVersion,
    );
    assert.equal(
      getProtocolContract(GOVERNED_PROTOCOL_POINTERS.preferredProtocolVersion).protocolVersion,
      GOVERNED_PROTOCOL_POINTERS.preferredProtocolVersion,
    );
  });

  it('enforces runtime capability/tool/resource/prompt drift checks', () => {
    const contract = getProtocolContract(PREFERRED_MCP_PROTOCOL_VERSION);
    const advertisedCapabilityKeys = getAdvertisedCapabilityKeys().sort();
    const requiredCapabilities = [...contract.capabilities.required].sort();
    const optionalCapabilities = [...contract.capabilities.optional];

    for (const requiredCapability of requiredCapabilities) {
      assert.ok(
        advertisedCapabilityKeys.includes(requiredCapability),
        `Missing required capability: ${requiredCapability}`,
      );
    }

    for (const key of advertisedCapabilityKeys) {
      const known = requiredCapabilities.includes(key) || optionalCapabilities.includes(key);
      assert.ok(known, `Unexpected capability not governed by contract: ${key}`);
    }

    const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    const promptRegistry = container.get<PromptHandlerRegistry>('promptRegistry');
    const resourceRegistry = container.get<ResourceHandlerRegistry>('resourceRegistry');

    const runtimeTools = toolRegistry
      .getToolDefinitions()
      .map((tool) => tool.name)
      .sort();
    const runtimeResources = resourceRegistry
      .getAllResources()
      .map((resource) => resource.uri)
      .sort();
    const runtimePrompts = promptRegistry
      .getAllPrompts()
      .map((prompt) => prompt.name)
      .sort();

    assert.deepEqual(runtimeTools, [...contract.tools].sort());
    assert.deepEqual(runtimeTools, [...GOVERNED_TOOL_NAMES].sort());
    assert.deepEqual(runtimeResources, [...contract.resources].sort());
    assert.deepEqual(runtimeResources, [...GOVERNED_RESOURCE_URIS].sort());
    assert.deepEqual(runtimePrompts, [...contract.prompts].sort());
    assert.deepEqual(runtimePrompts, [...GOVERNED_PROMPT_NAMES].sort());
  });

  it('negotiates capability profiles with deterministic fallback diagnostics', () => {
    const legacyFallback = negotiateCapabilityProfile('2024-11-05', 'async');
    assert.equal(legacyFallback.acceptedProfile, 'extended');
    assert.equal(legacyFallback.reason, 'fallback_unsupported_profile');
    assert.equal(legacyFallback.fallbackFrom, 'async');

    const modernExact = negotiateCapabilityProfile('2025-03-26', 'async');
    assert.equal(modernExact.acceptedProfile, 'async');
    assert.equal(modernExact.reason, 'accepted');

    const unknownProfile = negotiateCapabilityProfile('2025-06-18', 'experimental');
    assert.equal(unknownProfile.acceptedProfile, 'extended');
    assert.equal(unknownProfile.reason, 'fallback_unknown_profile');
    assert.equal(unknownProfile.fallbackFrom, 'experimental');

    const defaulted = negotiateCapabilityProfile('2025-11-25', null);
    assert.equal(defaulted.acceptedProfile, 'extended');
    assert.equal(defaulted.reason, 'defaulted_missing_profile');
  });

  it('enforces deprecation policy gates for protocol/tool changes', () => {
    const deprecationViolations = validateGovernanceDeprecations();
    assert.deepEqual(deprecationViolations, []);

    for (const entry of GOVERNANCE_DEPRECATIONS) {
      assert.equal(entry.surface, 'tool');
      assert.ok(entry.replacement);
      assert.ok(Date.parse(entry.announcedOn) < Date.parse(entry.removeAfter));
      assert.ok(
        Date.parse(entry.removeAfter) - Date.parse(entry.announcedOn) >=
          DEPRECATION_POLICY.minimumNoticeDays * 24 * 60 * 60 * 1000,
      );
    }

    const enhancedDocketTool = getEnhancedToolDefinitions().find(
      (tool) => tool.name === 'get_docket_entries',
    );
    assert.ok(enhancedDocketTool, 'get_docket_entries should exist in governed tool catalog');
    assert.ok(enhancedDocketTool.inputSchema && 'properties' in enhancedDocketTool.inputSchema);

    const schema = enhancedDocketTool.inputSchema as {
      properties?: Record<string, unknown>;
    };
    const properties = schema.properties || {};

    assert.ok('docket' in properties, 'Replacement property docket must exist');
    assert.ok(
      !('docket_id' in properties),
      'Deprecated docket_id input must stay removed unless deprecation registry is intentionally updated',
    );
  });
});

describe('HTTP session lifecycle governance contract', () => {
  const logger = new Logger({ level: 'error', format: 'json', enabled: false }, 'test');
  const port = 22000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  let closeServer: () => Promise<void>;

  const buildPostHeaders = (sessionId?: string): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PREFERRED_MCP_PROTOCOL_VERSION,
    };
    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }
    return headers;
  };

  before(async () => {
    const createSessionServer = () => {
      const sessionServer = new Server(
        { name: 'protocol-governance-http-test', version: '1.0.0' },
        { capabilities: { tools: {} } },
      );
      sessionServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
      return sessionServer;
    };

    const result = await startHttpTransport(createSessionServer, logger, {
      host: '127.0.0.1',
      port,
      enableSessions: true,
      enableJsonResponse: true,
      enableResumability: true,
    });
    closeServer = result.close;
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  after(async () => {
    if (closeServer) {
      await closeServer();
    }
  });

  it('covers initialize/use/close/replay/error flows with deterministic close behavior', async () => {
    const initializeResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: buildPostHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: PREFERRED_MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'protocol-governance-client', version: '1.0.0' },
        },
      }),
    });
    assert.equal(initializeResponse.status, 200);

    const sessionId = initializeResponse.headers.get('mcp-session-id');
    assert.ok(sessionId, 'initialize must return mcp-session-id');

    const useResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: buildPostHeaders(sessionId),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });
    assert.equal(useResponse.status, 200);
    const usePayload = (await useResponse.json()) as {
      jsonrpc?: string;
      result?: { tools?: unknown[] };
    };
    assert.equal(usePayload.jsonrpc, '2.0');
    assert.ok(Array.isArray(usePayload.result?.tools));

    const replayResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'mcp-session-id': sessionId,
        'MCP-Protocol-Version': PREFERRED_MCP_PROTOCOL_VERSION,
        'Last-Event-ID': 'stale-event-id',
      },
    });
    assert.equal(replayResponse.status, 500);

    const closeResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'DELETE',
      headers: {
        'mcp-session-id': sessionId,
        'MCP-Protocol-Version': PREFERRED_MCP_PROTOCOL_VERSION,
      },
    });
    assert.equal(closeResponse.status, 200);

    const closedSessionUseResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: buildPostHeaders(sessionId),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: {},
      }),
    });
    assert.equal(closedSessionUseResponse.status, 400);
    assertInvalidSessionLifecycleShape(await closedSessionUseResponse.json());

    const unknownSessionUseResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: buildPostHeaders('unknown-session-id'),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
        params: {},
      }),
    });
    assert.equal(unknownSessionUseResponse.status, 400);
    assertInvalidSessionLifecycleShape(await unknownSessionUseResponse.json());

    const staleCloseResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'DELETE',
      headers: {
        'mcp-session-id': sessionId,
        'MCP-Protocol-Version': PREFERRED_MCP_PROTOCOL_VERSION,
      },
    });
    assert.equal(staleCloseResponse.status, 400);
    assertInvalidSessionLifecycleShape(await staleCloseResponse.json());
  });

  it('keeps transport close deterministic under concurrent close calls', async () => {
    await Promise.all([closeServer(), closeServer(), closeServer()]);
  });
});

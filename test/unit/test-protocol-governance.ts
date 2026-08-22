#!/usr/bin/env node

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  getAdvertisedCapabilityKeys,
  negotiateCapabilityProfile,
  getProtocolContract,
  GOVERNED_PROMPT_NAMES,
  GOVERNED_PROTOCOL_POINTERS,
  GOVERNED_RESOURCE_URIS,
  GOVERNED_TOOL_NAMES,
  MCP_PROTOCOL_CAPABILITY_CONTRACT,
} from '../../src/infrastructure/protocol-governance.js';
import {
  PREFERRED_MCP_PROTOCOL_VERSION,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
} from '../../src/infrastructure/protocol-constants.js';
import { bootstrapServices } from '../../src/infrastructure/bootstrap.js';
import { container } from '../../src/infrastructure/container.js';
import { CacheManager } from '../../src/infrastructure/cache.js';
import { PromptHandlerRegistry } from '../../src/server/prompt-handler.js';
import { ResourceHandlerRegistry } from '../../src/server/resource-handler.js';
import { ToolHandlerRegistry } from '../../src/server/tool-handler.js';
import { getEnhancedToolDefinitions } from '../../src/tool-definitions.js';

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
    const unsupportedProfile = negotiateCapabilityProfile('2026-07-28', 'unsupported');
    assert.equal(unsupportedProfile.acceptedProfile, 'extended');
    assert.equal(unsupportedProfile.reason, 'fallback_unknown_profile');
    assert.equal(unsupportedProfile.fallbackFrom, 'unsupported');

    const modernExact = negotiateCapabilityProfile('2026-07-28', 'async');
    assert.equal(modernExact.acceptedProfile, 'async');
    assert.equal(modernExact.reason, 'accepted');

    const unknownProfile = negotiateCapabilityProfile('2026-07-28', 'experimental');
    assert.equal(unknownProfile.acceptedProfile, 'extended');
    assert.equal(unknownProfile.reason, 'fallback_unknown_profile');
    assert.equal(unknownProfile.fallbackFrom, 'experimental');

    const defaulted = negotiateCapabilityProfile('2026-07-28', null);
    assert.equal(defaulted.acceptedProfile, 'extended');
    assert.equal(defaulted.reason, 'defaulted_missing_profile');
  });

  it('keeps the completed docket input migration removed', () => {
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

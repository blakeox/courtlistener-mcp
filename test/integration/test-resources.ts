#!/usr/bin/env node

/**
 * ✅ Resource Integration Tests for Legal MCP Server
 * Tests resource listing and reading functionality
 */

import type { ReadResourceRequest, ReadResourceResult, ListResourcesResult } from '@modelcontextprotocol/sdk/types.js';

import { bootstrapServices } from '../../src/infrastructure/bootstrap.js';
import { container } from '../../src/infrastructure/container.js';
import { BestPracticeLegalMCPServer } from '../../src/server/best-practice-server.js';
import { CourtListenerAPI } from '../../src/courtlistener.js';
import { ResourceHandlerRegistry } from '../../src/server/resource-handler.js';
import { OpinionResourceHandler } from '../../src/resources/opinion.js';
import { SchemaResourceHandler } from '../../src/resources/schema.js';

async function runResourceTests(): Promise<void> {
  console.log('🧪 Starting Legal MCP Resource Tests...\n');

  // Bootstrap services
  bootstrapServices();

  // Mock CourtListenerAPI
  const mockApi = {
    getOpinion: async (id: number) => {
      if (id === 108713) {
        return {
          id: 108713,
          case_name: 'Roe v. Wade',
          date_filed: '1973-01-22',
          judges: 'Blackmun',
          text: 'This is a mock opinion text for Roe v. Wade.'
        };
      }
      throw new Error('Opinion not found');
    }
  } as unknown as CourtListenerAPI;

  // Create a new ResourceHandlerRegistry with the mock API
  const newRegistry = new ResourceHandlerRegistry();
  newRegistry.register(new OpinionResourceHandler(mockApi));
  newRegistry.register(new SchemaResourceHandler());

  // Replace the registry in the container
  container.registerOrReplace('resourceRegistry', {
    factory: () => newRegistry,
    singleton: true
  });

  const server = new BestPracticeLegalMCPServer();
  let passed = 0;
  let failed = 0;

  async function test(name: string, testFn: () => Promise<void>): Promise<void> {
    try {
      console.log(`⏳ Running: ${name}`);
      await testFn();
      console.log(`✅ PASSED: ${name}`);
      passed++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ FAILED: ${name}`);
      console.log(`   Error: ${errorMessage}`);
      failed++;
    }
    console.log('');
  }

  await test('List Resources', async () => {
    const resources = await server.listResources();
    
    if (!resources || !resources.resources) {
      throw new Error('No resources returned');
    }
    
    if (resources.resources.length === 0) {
      throw new Error('Expected at least one resource');
    }
    
    console.log(`   Found ${resources.resources.length} resources`);
    console.log('   Resources:', JSON.stringify(resources.resources, null, 2));
    
    // Verify specific resources exist
    const opinionExample = resources.resources.find(r => r.uri === 'courtlistener://opinion/123456');
    if (!opinionExample) {
      throw new Error('Opinion example resource not found');
    }
  });

  await test('Read Opinion Resource', async () => {
    // Use a known opinion ID (e.g., Roe v. Wade: 108713)
    const opinionUri = 'courtlistener://opinion/108713';

    const result = await server.readResource(opinionUri);
    
    if (!result || !result.contents || result.contents.length === 0) {
      throw new Error('No content returned for opinion resource');
    }
    
    const content = result.contents[0];
    if (content.mimeType !== 'application/json') {
      throw new Error(`Expected application/json, got ${content.mimeType}`);
    }
    
    const textContent = content.text as string;
    const data = JSON.parse(textContent);
    if (!data.id || data.id !== 108713) {
      throw new Error('Resource content does not match requested opinion');
    }
  });

  await test('Read Schema Resource', async () => {
    const schemaUri = 'courtlistener://schema/opinion';

    const result = await server.readResource(schemaUri);
    
    if (!result || !result.contents || result.contents.length === 0) {
      throw new Error('No content returned for schema resource');
    }
    
    const content = result.contents[0];
    const textContent = content.text as string;
    const schema = JSON.parse(textContent);
    
    if (!schema.type || schema.type !== 'object') {
      throw new Error('Invalid schema format');
    }
  });

  console.log('---------------------------------------------------');
  console.log(`Tests Completed: ${passed} Passed, ${failed} Failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runResourceTests().catch(console.error);

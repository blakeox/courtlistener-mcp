#!/usr/bin/env node

/**
 * ✅ Prompt Integration Tests for Legal MCP Server
 * Tests prompt listing and retrieval functionality
 */

import { bootstrapServices } from '../../src/infrastructure/bootstrap.js';
import { BestPracticeLegalMCPServer } from '../../src/server/best-practice-server.js';

async function runPromptTests(): Promise<void> {
  console.log('🧪 Starting Legal MCP Prompt Tests...\n');

  // Bootstrap services
  bootstrapServices();

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

  await test('List Prompts', async () => {
    const prompts = await server.listPrompts();
    
    if (!prompts || !prompts.prompts) {
      throw new Error('No prompts returned');
    }
    
    if (prompts.prompts.length === 0) {
      throw new Error('Expected at least one prompt');
    }
    
    console.log(`   Found ${prompts.prompts.length} prompts`);
    
    // Verify specific prompts exist
    const legalAssistant = prompts.prompts.find(p => p.name === 'legal_assistant');
    if (!legalAssistant) {
      throw new Error('legal_assistant prompt not found');
    }
  });

  await test('Get Legal Assistant Prompt', async () => {
    const name = 'legal_assistant';
    const args = { focus_area: 'copyright law' };

    const result = await server.getPrompt(name, args);
    
    if (!result || !result.messages || result.messages.length === 0) {
      throw new Error('No messages returned for prompt');
    }
    
    const message = result.messages[0];
    if (message.role !== 'user') {
      throw new Error(`Expected user role, got ${message.role}`);
    }
    
    if (!message.content.type || message.content.type !== 'text') {
      throw new Error('Expected text content');
    }
    
    const text = message.content.text as string;
    if (!text.includes('copyright law')) {
      throw new Error('Prompt arguments not correctly interpolated');
    }
  });

  await test('Get Summarize Statute Prompt', async () => {
    const name = 'summarize-statute';
    const args = { statute_text: '17 U.S.C. 107' };

    const result = await server.getPrompt(name, args);
    
    if (!result || !result.messages || result.messages.length === 0) {
      throw new Error('No messages returned for prompt');
    }
    
    const message = result.messages[0];
    const text = message.content.text as string;
    if (!text.includes('17 U.S.C. 107')) {
      throw new Error('Citation not interpolated in prompt');
    }
  });

  console.log('---------------------------------------------------');
  console.log(`Tests Completed: ${passed} Passed, ${failed} Failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runPromptTests().catch(console.error);

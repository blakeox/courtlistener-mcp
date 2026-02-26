import { LegalMCPServer } from '../src/index.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generate() {
  console.log('Generating MCP Manifest...');
  
  try {
    const server = new LegalMCPServer();
    
    // List capabilities
    console.log('Fetching tools...');
    const tools = await server.listTools();
    
    console.log('Fetching resources...');
    const resources = await server.listResources();
    
    console.log('Fetching prompts...');
    const prompts = await server.listPrompts();
    
    const manifest = {
      server: {
        name: "courtlistener-mcp",
        version: "0.1.0",
        description: "Legal research MCP server providing comprehensive access to CourtListener legal database"
      },
      capabilities: {
        tools,
        resources,
        prompts
      }
    };
    
    const outputPath = path.resolve(__dirname, '../manifest.json');
    await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));
    
    console.log(`Manifest generated successfully at ${outputPath}`);
    
    // Also generate a summary for documentation
    const summary = {
      toolCount: tools.tools.length,
      resourceCount: resources.resources.length,
      promptCount: prompts.prompts.length,
      toolNames: tools.tools.map(t => t.name),
      resourceTemplates: resources.resources.map(r => r.uriTemplate || r.uri),
      promptNames: prompts.prompts.map(p => p.name)
    };
    
    console.log('Summary:', summary);
    
    process.exit(0);
  } catch (error) {
    console.error('Error generating manifest:', error);
    process.exit(1);
  }
}

generate();

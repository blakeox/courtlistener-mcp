import { LegalMCPServer } from './dist/index.js';

async function debugSearch() {
  const server = new LegalMCPServer();
  
  const result = await server.handleToolCall({
    name: 'search_cases',
    arguments: { citation: '410 U.S. 113', page_size: 1 }
  });
  
  console.log('Search result structure:');
  console.log(JSON.stringify(JSON.parse(result.content[0].text), null, 2));
}

debugSearch().catch(console.error);

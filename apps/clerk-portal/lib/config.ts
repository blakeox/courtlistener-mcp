export const MCP_ORIGIN = process.env.NEXT_PUBLIC_MCP_ORIGIN || 'https://courtlistenermcp.blakeoxford.com';
export const MCP_ADDITIONAL_ORIGINS = (process.env.NEXT_PUBLIC_MCP_ADDITIONAL_ORIGINS
  || 'https://courtlistener-mcp.blakeoxford.workers.dev')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

export const CLERK_TOKEN_TEMPLATE = process.env.NEXT_PUBLIC_CLERK_TOKEN_TEMPLATE || 'mcp';

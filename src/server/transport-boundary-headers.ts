import { isAllowedOrigin } from './worker-security.js';

export const MCP_CORS_ALLOWED_METHODS = 'GET, POST, DELETE, OPTIONS';
export const MCP_CORS_ALLOWED_HEADERS =
  'Content-Type, Authorization, mcp-session-id, MCP-Protocol-Version, MCP-Capability-Profile';
export const MCP_CORS_EXPOSE_HEADERS =
  'mcp-session-id, MCP-Protocol-Version, MCP-Capability-Profile, X-MCP-Protocol-Negotiation-Reason';

export function buildMcpCorsHeaders(origin: string | null, allowedOrigins: string[]): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': MCP_CORS_ALLOWED_METHODS,
    'Access-Control-Allow-Headers': MCP_CORS_ALLOWED_HEADERS,
    'Access-Control-Expose-Headers': MCP_CORS_EXPOSE_HEADERS,
    Vary: 'Origin',
  });

  if (origin && isAllowedOrigin(origin, allowedOrigins)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  return headers;
}

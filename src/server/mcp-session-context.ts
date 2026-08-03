import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';

const ANONYMOUS_SESSION_ID = 'anonymous';

type SessionExtra = Pick<RequestHandlerExtra<never, never>, 'sessionId' | 'requestInfo'>;

/**
 * Resolve the MCP transport session id from SDK request handler context.
 */
export function resolveMcpSessionId(extra?: SessionExtra): string {
  const headerSessionId = extra?.requestInfo?.headers?.['mcp-session-id'];
  if (typeof headerSessionId === 'string' && headerSessionId.trim().length > 0) {
    return headerSessionId.trim();
  }
  if (typeof extra?.sessionId === 'string' && extra.sessionId.trim().length > 0) {
    return extra.sessionId.trim();
  }
  return ANONYMOUS_SESSION_ID;
}

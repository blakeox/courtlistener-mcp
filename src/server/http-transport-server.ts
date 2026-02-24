/**
 * HTTP Transport Server for MCP Streamable HTTP
 *
 * Uses the official SDK StreamableHTTPServerTransport to serve MCP over HTTP,
 * supporting both SSE streaming and direct JSON responses. This enables
 * compatibility with all MCP clients (Claude, ChatGPT, Cursor, etc.).
 */

import { randomUUID } from 'node:crypto';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InMemoryEventStore } from '../infrastructure/event-store.js';
import { Logger } from '../infrastructure/logger.js';
import { LegalOAuthProvider } from '../auth/oauth-provider.js';
import { LegalOAuthClientsStore } from '../auth/oauth-clients-store.js';

export interface HttpTransportConfig {
  port: number;
  host: string;
  /** Enable direct JSON responses instead of SSE streams */
  enableJsonResponse?: boolean;
  /** Enable session management */
  enableSessions?: boolean;
  /** Enable event store for resumability */
  enableResumability?: boolean;
  /** Enable DNS rebinding protection */
  enableDnsRebindingProtection?: boolean;
  /** Allowed origins for DNS rebinding protection */
  allowedOrigins?: string[];
  /** Allowed hosts for DNS rebinding protection */
  allowedHosts?: string[];
}

const DEFAULT_CONFIG: HttpTransportConfig = {
  port: parseInt(process.env.MCP_HTTP_PORT || '3002', 10),
  host: process.env.MCP_HTTP_HOST || '0.0.0.0',
  enableJsonResponse: process.env.MCP_JSON_RESPONSE === 'true',
  enableSessions: process.env.MCP_SESSIONS !== 'false',
  enableResumability: process.env.MCP_RESUMABILITY === 'true',
  enableDnsRebindingProtection: process.env.MCP_DNS_PROTECTION === 'true',
  allowedOrigins: process.env.MCP_ALLOWED_ORIGINS?.split(',').map((o) => o.trim()),
  allowedHosts: process.env.MCP_ALLOWED_HOSTS?.split(',').map((h) => h.trim()),
};

/**
 * Starts an HTTP server that exposes the MCP server via StreamableHTTPServerTransport.
 *
 * The transport is mounted at `/mcp` and supports:
 * - POST /mcp — JSON-RPC messages from clients
 * - GET /mcp — SSE stream for server-to-client messages
 * - DELETE /mcp — Session termination
 */
export async function startHttpTransport(
  mcpServer: Server,
  logger: Logger,
  config: Partial<HttpTransportConfig> = {},
): Promise<{ app: express.Application; close: () => Promise<void> }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const app = express();

  // Parse JSON bodies for POST requests
  app.use(express.json());

  // CORS headers for browser-based MCP clients
  app.use((_req, res, next) => {
    const allowedOrigin = process.env.CORS_ALLOWED_ORIGINS || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', transport: 'streamable-http' });
  });

  // OAuth setup — mount auth router before /mcp when enabled
  const oauthEnabled = process.env.OAUTH_ENABLED === 'true';
  let oauthProvider: LegalOAuthProvider | undefined;

  if (oauthEnabled) {
    const issuerUrl = new URL(process.env.OAUTH_ISSUER_URL || `http://${cfg.host}:${cfg.port}`);
    const clientsStore = new LegalOAuthClientsStore();
    oauthProvider = new LegalOAuthProvider(clientsStore);

    app.use(
      mcpAuthRouter({
        provider: oauthProvider,
        issuerUrl,
        scopesSupported: ['legal:read', 'legal:search', 'legal:analyze'],
      }),
    );

    logger.info('OAuth authentication enabled', { issuerUrl: issuerUrl.toString() });
  }

  const eventStore = cfg.enableResumability ? new InMemoryEventStore() : undefined;

  // Track active transports for cleanup
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Mount MCP endpoint — protect with bearer auth when OAuth is enabled
  const mcpHandlers: express.RequestHandler[] = [];
  if (oauthEnabled && oauthProvider) {
    mcpHandlers.push(requireBearerAuth({ verifier: oauthProvider }));
  }
  mcpHandlers.push(async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // For initialization requests (no session ID), create a new transport
    if (!sessionId && req.method === 'POST') {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: cfg.enableSessions ? () => randomUUID() : undefined,
        enableJsonResponse: cfg.enableJsonResponse,
        eventStore,
        enableDnsRebindingProtection: cfg.enableDnsRebindingProtection,
        allowedOrigins: cfg.allowedOrigins,
        allowedHosts: cfg.allowedHosts,
        onsessioninitialized: (id) => {
          transports.set(id, transport);
          logger.info('MCP HTTP session initialized', { sessionId: id });
        },
        onsessionclosed: (id) => {
          transports.delete(id);
          logger.info('MCP HTTP session closed', { sessionId: id });
        },
      });

      // Connect the MCP server to this transport
      await mcpServer.connect(transport);

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) transports.delete(sid);
      };

      // Handle the request
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // For existing sessions, look up the transport
    if (sessionId) {
      const transport = transports.get(sessionId);
      if (transport) {
        await transport.handleRequest(req, res, req.body);
        return;
      }
    }

    // No valid session found
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Invalid or missing session' },
    });
  });

  app.all('/mcp', ...mcpHandlers);

  // Start listening
  const server = app.listen(cfg.port, cfg.host, () => {
    logger.info('MCP HTTP transport server started', {
      url: `http://${cfg.host}:${cfg.port}/mcp`,
      sessions: cfg.enableSessions,
      jsonResponse: cfg.enableJsonResponse,
      resumability: cfg.enableResumability,
    });
  });

  const close = async () => {
    // Close all active transports
    for (const [id, transport] of transports) {
      await transport.close();
      transports.delete(id);
    }
    server.close();
    logger.info('MCP HTTP transport server stopped');
  };

  return { app, close };
}

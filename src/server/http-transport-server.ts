/**
 * HTTP Transport Server for MCP Streamable HTTP
 *
 * Uses the official SDK StreamableHTTPServerTransport to serve MCP over HTTP,
 * supporting both SSE streaming and direct JSON responses. This enables
 * compatibility with all MCP clients (Claude, ChatGPT, Cursor, etc.).
 */

import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InMemoryEventStore } from '../infrastructure/event-store.js';
import { Logger } from '../infrastructure/logger.js';
import { getConfig } from '../infrastructure/config.js';
import { SUPPORTED_MCP_PROTOCOL_VERSIONS } from '../infrastructure/protocol-constants.js';
import type { PrincipalContext } from '../infrastructure/principal-context.js';
import { runWithPrincipalContext } from '../infrastructure/principal-context.js';
import { LegalOAuthProvider } from '../auth/oauth-provider.js';
import { LegalOAuthClientsStore } from '../auth/oauth-clients-store.js';
import { isAllowedOrigin, type WorkerSecurityEnv } from './worker-security.js';
import { authorizeMcpGatewayRequest } from './mcp-gateway-auth.js';
import { buildMcpCorsHeaders } from './transport-boundary-headers.js';

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

function getDefaultConfig(): HttpTransportConfig {
  const cfg = getConfig();
  const ht = cfg.httpTransport;
  return {
    port: ht?.port ?? 3002,
    host: ht?.host ?? '0.0.0.0',
    enableJsonResponse: ht?.enableJsonResponse ?? false,
    enableSessions: ht?.enableSessions ?? true,
    enableResumability: ht?.enableResumability ?? false,
    enableDnsRebindingProtection: ht?.enableDnsRebindingProtection ?? false,
    ...(ht?.allowedOrigins !== undefined && { allowedOrigins: ht.allowedOrigins }),
    ...(ht?.allowedHosts !== undefined && { allowedHosts: ht.allowedHosts }),
  };
}

function getWorkerSecurityEnv(): WorkerSecurityEnv {
  const env: WorkerSecurityEnv = {};
  if (process.env.MCP_AUTH_TOKEN !== undefined) env.MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
  if (process.env.MCP_AUTH_PRIMARY !== undefined) env.MCP_AUTH_PRIMARY = process.env.MCP_AUTH_PRIMARY;
  if (process.env.MCP_ALLOW_STATIC_FALLBACK !== undefined) {
    env.MCP_ALLOW_STATIC_FALLBACK = process.env.MCP_ALLOW_STATIC_FALLBACK;
  }
  if (process.env.MCP_REQUIRE_PROTOCOL_VERSION !== undefined) {
    env.MCP_REQUIRE_PROTOCOL_VERSION = process.env.MCP_REQUIRE_PROTOCOL_VERSION;
  }
  if (process.env.OIDC_ISSUER !== undefined) env.OIDC_ISSUER = process.env.OIDC_ISSUER;
  if (process.env.OIDC_AUDIENCE !== undefined) env.OIDC_AUDIENCE = process.env.OIDC_AUDIENCE;
  if (process.env.OIDC_JWKS_URL !== undefined) env.OIDC_JWKS_URL = process.env.OIDC_JWKS_URL;
  if (process.env.OIDC_REQUIRED_SCOPE !== undefined) {
    env.OIDC_REQUIRED_SCOPE = process.env.OIDC_REQUIRED_SCOPE;
  }
  if (process.env.SUPABASE_URL !== undefined) env.SUPABASE_URL = process.env.SUPABASE_URL;
  if (process.env.SUPABASE_SECRET_KEY !== undefined) {
    env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  }
  if (process.env.SUPABASE_API_KEYS_TABLE !== undefined) {
    env.SUPABASE_API_KEYS_TABLE = process.env.SUPABASE_API_KEYS_TABLE;
  }
  return env;
}

function toWebRequest(req: express.Request): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.originalUrl || req.url, `http://${host}`);
  return new Request(url, { method: req.method, headers });
}

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
  const cfg = { ...getDefaultConfig(), ...config };
  const app = express();

  // Security headers
  app.use(helmet());

  // Parse JSON bodies for POST requests
  app.use(express.json());

  // CORS headers for browser-based MCP clients
  app.use((req, res, next) => {
    const origin = req.headers.origin ?? null;
    const allowedOrigins = cfg.allowedOrigins ?? [];
    if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
      res.status(403).json({ error: 'forbidden_origin', message: 'Forbidden origin' });
      return;
    }
    const corsHeaders = buildMcpCorsHeaders(origin, allowedOrigins);
    for (const [name, value] of corsHeaders.entries()) {
      res.setHeader(name, value);
    }
    if (req.method === 'OPTIONS') {
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
  const serverConfig = getConfig();
  const oauthEnabled = serverConfig.oauth?.enabled ?? false;
  let oauthProvider: LegalOAuthProvider | undefined;

  if (oauthEnabled) {
    const issuerUrl = new URL(serverConfig.oauth?.issuerUrl || `http://${cfg.host}:${cfg.port}`);
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
  const workerSecurityEnv = getWorkerSecurityEnv();
  const supportedProtocolVersions = new Set<string>(SUPPORTED_MCP_PROTOCOL_VERSIONS);

  // Track active transports for cleanup
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Mount MCP endpoint — protect with bearer auth when OAuth is enabled
  const mcpHandlers: express.RequestHandler[] = [];
  mcpHandlers.push(async (req, res, next) => {
    const authResult = await authorizeMcpGatewayRequest({
      request: toWebRequest(req),
      env: workerSecurityEnv,
      supportedProtocolVersions,
    });
    const authError = authResult.authError;
    if (!authError) {
      const locals = res.locals as { mcpPrincipal?: PrincipalContext };
      if (authResult.principal) {
        locals.mcpPrincipal = authResult.principal;
      } else {
        delete locals.mcpPrincipal;
      }
      next();
      return;
    }

    const contentType = authError.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    res.status(authError.status).send(await authError.text());
  });
  if (oauthEnabled && oauthProvider) {
    mcpHandlers.push(requireBearerAuth({ verifier: oauthProvider }));
  }
  mcpHandlers.push(async (req, res) => {
    const principal = (res.locals as { mcpPrincipal?: PrincipalContext }).mcpPrincipal;
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // For initialization requests (no session ID), create a new transport
    if (!sessionId && req.method === 'POST') {
      const transport = new StreamableHTTPServerTransport({
        ...(cfg.enableSessions && { sessionIdGenerator: () => randomUUID() }),
        ...(cfg.enableJsonResponse !== undefined && { enableJsonResponse: cfg.enableJsonResponse }),
        ...(eventStore !== undefined && { eventStore }),
        ...(cfg.enableDnsRebindingProtection !== undefined && {
          enableDnsRebindingProtection: cfg.enableDnsRebindingProtection,
        }),
        ...(cfg.allowedOrigins !== undefined && { allowedOrigins: cfg.allowedOrigins }),
        ...(cfg.allowedHosts !== undefined && { allowedHosts: cfg.allowedHosts }),
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
      await mcpServer.connect(transport as Transport);

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) transports.delete(sid);
      };

      // Handle the request
      await runWithPrincipalContext(principal, () => transport.handleRequest(req, res, req.body));
      return;
    }

    // For existing sessions, look up the transport
    if (sessionId) {
      const transport = transports.get(sessionId);
      if (transport) {
        await runWithPrincipalContext(principal, () => transport.handleRequest(req, res, req.body));
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

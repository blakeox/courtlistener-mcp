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
import { getHostedMcpScopesSupported } from '../auth/oauth-service.js';
import {
  isAllowedOrigin,
  type ProtocolHeaderNegotiationDiagnostics,
  type WorkerSecurityEnv,
} from './worker-security.js';
import { authorizeMcpGatewayRequest } from './mcp-gateway-auth.js';
import {
  getMcpSessionIdFromRequest,
  setProtocolNegotiationHeaders,
  validateSessionLifecycleRequest,
} from './mcp-transport-runtime-facade.js';
import { buildMcpCorsHeaders } from './transport-boundary-headers.js';
import { createInvalidSessionLifecycleResponse } from './mcp-session-lifecycle-contract.js';

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
  /** Maximum concurrent MCP requests accepted before rejecting with backpressure */
  maxConcurrentRequests?: number;
  /** Maximum concurrent session initialization requests */
  maxConcurrentSessionInitializations?: number;
  /** Maximum active sessions */
  maxActiveSessions?: number;
  /** Allowed origins for DNS rebinding protection */
  allowedOrigins?: string[];
  /** Allowed hosts for DNS rebinding protection */
  allowedHosts?: string[];
}

const DEFAULT_MAX_CONCURRENT_REQUESTS = 256;
const DEFAULT_MAX_CONCURRENT_SESSION_INITIALIZATIONS = 32;
const DEFAULT_MAX_ACTIVE_SESSIONS = 1024;
const MCP_OPERATION_SLO_TARGET = 0.995;
const DEFAULT_SESSION_SETUP_LATENCY_GUARDRAIL_MS = 1_500;

type LatencyAccumulator = {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
};

function recordLatencySample(accumulator: LatencyAccumulator, durationMs: number): void {
  const normalizedDuration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
  accumulator.count += 1;
  accumulator.totalMs += normalizedDuration;
  accumulator.maxMs = Math.max(accumulator.maxMs, normalizedDuration);
  accumulator.lastMs = normalizedDuration;
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
    maxConcurrentRequests: ht?.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS,
    maxConcurrentSessionInitializations:
      ht?.maxConcurrentSessionInitializations ?? DEFAULT_MAX_CONCURRENT_SESSION_INITIALIZATIONS,
    maxActiveSessions: ht?.maxActiveSessions ?? DEFAULT_MAX_ACTIVE_SESSIONS,
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

function applyProtocolNegotiationHeaders(
  res: express.Response,
  diagnostics?: ProtocolHeaderNegotiationDiagnostics,
): void {
  const headers = new Headers();
  setProtocolNegotiationHeaders(headers, diagnostics);
  for (const [name, value] of headers.entries()) {
    res.setHeader(name, value);
  }
}

export type SessionServerFactory = () => Server | Promise<Server>;

interface HttpSessionContext {
  server: Server;
  transport: StreamableHTTPServerTransport;
}

class HttpMcpSessionManager {
  private readonly sessions = new Map<string, HttpSessionContext>();
  private readonly closingSessions = new Set<string>();

  constructor(private readonly logger: Logger) {}

  attach(sessionId: string, context: HttpSessionContext): void {
    this.sessions.set(sessionId, context);
    this.logger.info('MCP HTTP session initialized', { sessionId, activeSessions: this.sessions.size });
  }

  get(sessionId: string): HttpSessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  async closeSession(sessionId: string): Promise<void> {
    if (this.closingSessions.has(sessionId)) {
      return;
    }

    const context = this.sessions.get(sessionId);
    if (!context) {
      return;
    }

    this.sessions.delete(sessionId);
    this.closingSessions.add(sessionId);

    try {
      await context.transport.close();
    } catch (error) {
      this.logger.warn('MCP HTTP session transport close failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      await context.server.close();
    } catch (error) {
      this.logger.warn('MCP HTTP session server close failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.closingSessions.delete(sessionId);
    }

    this.logger.info('MCP HTTP session closed', { sessionId, activeSessions: this.sessions.size });
  }

  async closeAll(): Promise<void> {
    for (const sessionId of [...this.sessions.keys()]) {
      await this.closeSession(sessionId);
    }
  }
}

/**
 * Starts an HTTP server that exposes MCP over StreamableHTTP transport.
 * A fresh MCP Server instance is created per initialize request via `createSessionServer`.
 *
 * The transport is mounted at `/mcp` and supports:
 * - POST /mcp — JSON-RPC messages from clients
 * - GET /mcp — SSE stream for server-to-client messages
 * - DELETE /mcp — Session termination
 */
export async function startHttpTransport(
  createSessionServer: SessionServerFactory,
  logger: Logger,
  config: Partial<HttpTransportConfig> = {},
): Promise<{ app: express.Application; close: () => Promise<void> }> {
  const cfg = { ...getDefaultConfig(), ...config };
  const maxConcurrentRequests = Math.max(1, cfg.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS);
  const maxConcurrentSessionInitializations = Math.max(
    1,
    cfg.maxConcurrentSessionInitializations ?? DEFAULT_MAX_CONCURRENT_SESSION_INITIALIZATIONS,
  );
  const maxActiveSessions = Math.max(1, cfg.maxActiveSessions ?? DEFAULT_MAX_ACTIVE_SESSIONS);
  const app = express();
  const operationTelemetry = new Map<
    string,
    {
      total: number;
      success: number;
      failed: number;
      rejected: number;
    }
  >();
  let activeRequests = 0;
  let sessionInitializationsInFlight = 0;
  let rejectedDueToActiveRequestLimit = 0;
  let rejectedDueToSessionInitializationLimit = 0;
  let rejectedDueToSessionCapacity = 0;
  let rejectedDueToShutdown = 0;
  const sessionSetupLatency: LatencyAccumulator = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
  let sessionSetupLatencyGuardrailBreaches = 0;
  let isClosing = false;

  const getOperationTelemetry = (operation: string) => {
    const existing = operationTelemetry.get(operation);
    if (existing) {
      return existing;
    }
    const created = { total: 0, success: 0, failed: 0, rejected: 0 };
    operationTelemetry.set(operation, created);
    return created;
  };

  const recordOperationSuccess = (operation: string) => {
    const stats = getOperationTelemetry(operation);
    stats.total += 1;
    stats.success += 1;
  };

  const recordOperationFailure = (operation: string) => {
    const stats = getOperationTelemetry(operation);
    stats.total += 1;
    stats.failed += 1;
  };

  const recordOperationRejected = (operation: string) => {
    const stats = getOperationTelemetry(operation);
    stats.total += 1;
    stats.rejected += 1;
  };

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
        scopesSupported: getHostedMcpScopesSupported(),
      }),
    );

    logger.info('OAuth authentication enabled', { issuerUrl: issuerUrl.toString() });
  }

  const eventStore = cfg.enableResumability ? new InMemoryEventStore() : undefined;
  const workerSecurityEnv = getWorkerSecurityEnv();
  const supportedProtocolVersions = new Set<string>(SUPPORTED_MCP_PROTOCOL_VERSIONS);
  const sessionManager = new HttpMcpSessionManager(logger.child('HttpSessionManager'));

  const getDiagnosticsSnapshot = () => {
    const operations = Object.fromEntries(
      [...operationTelemetry.entries()].map(([operation, stats]) => {
        const failures = stats.failed + stats.rejected;
        const availability = stats.total > 0 ? stats.success / stats.total : 1;
        const allowedFailures = stats.total * (1 - MCP_OPERATION_SLO_TARGET);
        const errorBudgetRemaining = Math.max(0, allowedFailures - failures);
        const failureBudgetBurnRate = allowedFailures > 0 ? failures / allowedFailures : failures > 0 ? null : 0;

        return [
          operation,
          {
            ...stats,
            availability,
            targetAvailability: MCP_OPERATION_SLO_TARGET,
            errorBudgetRemaining,
            failureBudgetBurnRate,
          },
        ];
      }),
    );

    return {
      shuttingDown: isClosing,
      limits: {
        maxConcurrentRequests,
        maxConcurrentSessionInitializations,
        maxActiveSessions,
      },
      backpressure: {
        activeRequests,
        sessionInitializationsInFlight,
        activeSessions: sessionManager.getActiveSessionCount(),
        rejectedDueToActiveRequestLimit,
        rejectedDueToSessionInitializationLimit,
        rejectedDueToSessionCapacity,
        rejectedDueToShutdown,
      },
      performance: {
        sessionSetupLatencyMs: {
          count: sessionSetupLatency.count,
          avg:
            sessionSetupLatency.count > 0
              ? Number((sessionSetupLatency.totalMs / sessionSetupLatency.count).toFixed(2))
              : 0,
          max: Number(sessionSetupLatency.maxMs.toFixed(2)),
          last: Number(sessionSetupLatency.lastMs.toFixed(2)),
        },
        guardrails: {
          sessionSetupLatencyMs: {
            threshold: DEFAULT_SESSION_SETUP_LATENCY_GUARDRAIL_MS,
            breaches: sessionSetupLatencyGuardrailBreaches,
          },
        },
      },
      slo: {
        targetAvailability: MCP_OPERATION_SLO_TARGET,
        operations,
      },
    };
  };

  const sendBackpressureResponse = (
    res: express.Response,
    status: 429 | 503,
    reason: string,
    message: string,
  ) => {
    res.setHeader('Retry-After', '1');
    res.setHeader('X-MCP-Rejection-Reason', reason);
    res.status(status).json({
      jsonrpc: '2.0',
      error: { code: -32000, message },
      reason,
      diagnostics: getDiagnosticsSnapshot(),
    });
  };

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', transport: 'streamable-http', diagnostics: getDiagnosticsSnapshot() });
  });

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
      const locals = res.locals as {
        mcpPrincipal?: PrincipalContext;
        mcpProtocolNegotiation?: ProtocolHeaderNegotiationDiagnostics;
      };
      if (authResult.principal) {
        locals.mcpPrincipal = authResult.principal;
      } else {
        delete locals.mcpPrincipal;
      }
      if (authResult.protocolNegotiation) {
        locals.mcpProtocolNegotiation = authResult.protocolNegotiation;
      } else {
        delete locals.mcpProtocolNegotiation;
      }
      applyProtocolNegotiationHeaders(res, authResult.protocolNegotiation);
      next();
      return;
    }

    applyProtocolNegotiationHeaders(res, authResult.protocolNegotiation);
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
    if (isClosing) {
      rejectedDueToShutdown += 1;
      recordOperationRejected('mcp.request');
      sendBackpressureResponse(
        res,
        503,
        'shutdown_in_progress',
        'MCP HTTP transport is shutting down, request rejected',
      );
      return;
    }

    if (activeRequests >= maxConcurrentRequests) {
      rejectedDueToActiveRequestLimit += 1;
      recordOperationRejected('mcp.request');
      sendBackpressureResponse(
        res,
        429,
        'active_request_limit',
        'MCP HTTP transport is saturated, please retry',
      );
      return;
    }

    activeRequests += 1;
    let operation = 'mcp.request';
    let operationRecorded = false;
    const markOperationSuccess = () => {
      if (operationRecorded) {
        return;
      }
      recordOperationSuccess(operation);
      operationRecorded = true;
    };
    const markOperationFailure = () => {
      if (operationRecorded) {
        return;
      }
      recordOperationFailure(operation);
      operationRecorded = true;
    };

    const principal = (res.locals as { mcpPrincipal?: PrincipalContext }).mcpPrincipal;
    const webRequest = toWebRequest(req);
    const sessionId = getMcpSessionIdFromRequest(webRequest);

    try {
      const invalidSession = await validateSessionLifecycleRequest(
        webRequest,
        sessionManager,
        Date.now(),
        async (incomingSessionId, _request, manager) => Boolean(manager.get(incomingSessionId)),
        { methods: ['GET', 'POST', 'DELETE'] },
      );
      if (invalidSession) {
        operation = 'mcp.invalid_session';
        markOperationFailure();
        res.status(invalidSession.status).json(await invalidSession.json());
        return;
      }

      // For initialization requests (no session ID), create a new transport
      if (!sessionId && req.method === 'POST') {
        operation = 'mcp.initialize';

        if (sessionManager.getActiveSessionCount() >= maxActiveSessions) {
          rejectedDueToSessionCapacity += 1;
          recordOperationRejected(operation);
          operationRecorded = true;
          sendBackpressureResponse(
            res,
            429,
            'session_capacity_limit',
            'MCP HTTP session capacity reached, retry later',
          );
          return;
        }

        if (sessionInitializationsInFlight >= maxConcurrentSessionInitializations) {
          rejectedDueToSessionInitializationLimit += 1;
          recordOperationRejected(operation);
          operationRecorded = true;
          sendBackpressureResponse(
            res,
            429,
            'session_initialization_limit',
            'MCP HTTP session initialization is saturated, retry later',
          );
          return;
        }

        const sessionSetupStartedAt = Date.now();
        sessionInitializationsInFlight += 1;
        const sessionServer = await createSessionServer();
        let initializedSessionId: string | undefined;
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
            initializedSessionId = id;
            sessionManager.attach(id, { server: sessionServer, transport });
          },
          onsessionclosed: (id) => {
            void sessionManager.closeSession(id);
          },
        });

        transport.onclose = () => {
          const sid = initializedSessionId ?? transport.sessionId;
          if (sid) {
            void sessionManager.closeSession(sid);
          }
        };

        try {
          await sessionServer.connect(transport as Transport);
          await runWithPrincipalContext(principal, () => transport.handleRequest(req, res, req.body));
          markOperationSuccess();
        } catch (error) {
          await Promise.allSettled([transport.close(), sessionServer.close()]);
          throw error;
        } finally {
          const setupDurationMs = Date.now() - sessionSetupStartedAt;
          recordLatencySample(sessionSetupLatency, setupDurationMs);
          if (setupDurationMs > DEFAULT_SESSION_SETUP_LATENCY_GUARDRAIL_MS) {
            sessionSetupLatencyGuardrailBreaches += 1;
          }
          sessionInitializationsInFlight = Math.max(0, sessionInitializationsInFlight - 1);
        }

        if (!cfg.enableSessions || !initializedSessionId) {
          await Promise.allSettled([transport.close(), sessionServer.close()]);
        }
        return;
      }

      // For existing sessions, look up the transport
      if (sessionId) {
        operation = 'mcp.session_request';
        const session = sessionManager.get(sessionId);
        if (session) {
          await runWithPrincipalContext(principal, () =>
            session.transport.handleRequest(req, res, req.body),
          );
          markOperationSuccess();
          return;
        }
      }

      // No valid session found
      operation = 'mcp.invalid_session';
      markOperationFailure();
      const invalidSessionResponse = createInvalidSessionLifecycleResponse();
      res.status(invalidSessionResponse.status).json(await invalidSessionResponse.json());
    } catch (error) {
      markOperationFailure();
      throw error;
    } finally {
      activeRequests = Math.max(0, activeRequests - 1);
    }
  });

  app.all('/mcp', ...mcpHandlers);

  // Start listening
  const server = app.listen(cfg.port, cfg.host, () => {
    logger.info('MCP HTTP transport server started', {
      url: `http://${cfg.host}:${cfg.port}/mcp`,
      sessions: cfg.enableSessions,
      jsonResponse: cfg.enableJsonResponse,
      resumability: cfg.enableResumability,
      maxConcurrentRequests,
      maxConcurrentSessionInitializations,
      maxActiveSessions,
    });
  });

  let closePromise: Promise<void> | undefined;
  const close = async () => {
    if (closePromise) {
      return closePromise;
    }
    isClosing = true;

    closePromise = (async () => {
      await sessionManager.closeAll();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      logger.info('MCP HTTP transport server stopped');
    })();

    return closePromise;
  };

  return { app, close };
}

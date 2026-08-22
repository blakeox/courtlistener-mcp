import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import {
  buildCorsHeaders,
  generateCspNonce,
  htmlResponse,
  jsonError,
  jsonResponse,
  redirectResponse,
  withCors,
} from '../../../../src/server/worker-response-runtime.js';
import { handleWorkerCoreRoutes } from '../../../../src/server/worker-core-routes.js';
import { handleWorkerUiShellRoutes } from '../../../../src/server/worker-ui-shell-routes.js';
import { handleWorkerAuthHandoffRoutes } from '../../../../src/server/worker-auth-handoff-routes.js';
import { handleWorkerOAuthAuthorizeRoute } from '../../../../src/server/worker-oauth-authorize.js';
import { createWorkerUiSessionRuntime } from '../../../../src/server/worker-ui-session-runtime.js';
import { renderSpaShellHtml } from '../../../../src/web/spa-shell.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SPA_BUILD_ID } from '../../../../src/web/spa-build-id.js';

const spaDistRoot = resolve(process.cwd(), '.spa-dist');
const spaJs = existsSync(resolve(spaDistRoot, 'app/spa.js'))
  ? readFileSync(resolve(spaDistRoot, 'app/spa.js'), 'utf8')
  : '';
const spaCss = existsSync(resolve(spaDistRoot, 'app/spa.css'))
  ? readFileSync(resolve(spaDistRoot, 'app/spa.css'), 'utf8')
  : '';

interface LocalAuthFlowEnv {
  MCP_UI_SESSION_SECRET: string;
  MCP_UI_INSECURE_COOKIES: string;
  OIDC_ISSUER: string;
  OIDC_AUDIENCE: string;
  MCP_AUTH_OIDC_CLIENT_ID: string;
  MCP_AUTH_OIDC_CLIENT_SECRET: string;
  OAUTH_PROVIDER: OAuthHelpers;
}

interface LocalAuthFlowServer {
  baseUrl: string;
  close: () => Promise<void>;
}

const env: LocalAuthFlowEnv = {
  MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
  MCP_UI_INSECURE_COOKIES: 'true',
  OIDC_ISSUER: 'https://issuer.example',
  OIDC_AUDIENCE: 'mcp',
  MCP_AUTH_OIDC_CLIENT_ID: 'worker-native-client',
  MCP_AUTH_OIDC_CLIENT_SECRET: 'worker-native-secret',
  OAUTH_PROVIDER: {
    parseAuthRequest: async (request: Request) => {
      const url = new URL(request.url);
      return {
        clientId: url.searchParams.get('client_id') ?? '',
        redirectUri: url.searchParams.get('redirect_uri') ?? '',
        state: url.searchParams.get('state') ?? '',
        scope: (url.searchParams.get('scope') ?? '')
          .split(/\s+/u)
          .map((entry) => entry.trim())
          .filter(Boolean),
      };
    },
    completeAuthorization: async (input: { request: { redirectUri?: string; state?: string } }) => {
      const redirectTarget = new URL(input.request.redirectUri || 'http://127.0.0.1/callback');
      redirectTarget.searchParams.set('code', 'local-auth-code');
      if (input.request.state) {
        redirectTarget.searchParams.set('state', input.request.state);
      }
      return { redirectTo: redirectTarget.toString() };
    },
  } as OAuthHelpers,
};

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
} as ExecutionContext;

const workerUiSessionRuntime = createWorkerUiSessionRuntime<LocalAuthFlowEnv>({
  jsonError,
  getClientIdentifier: () => 'playwright-auth-flow',
  isUiSessionRevoked: async () => ({ kind: 'ok', value: false }),
  recordSessionBootstrapRateLimit: async () => ({
    kind: 'ok',
    value: { blocked: false, retryAfterSeconds: 0 },
  }),
  verifyOidcUserIdFromToken: async (token) =>
    token === 'header.payload.signature'
      ? { identity: { userId: 'operator-real' }, error: null }
      : { identity: null, error: 'invalid oidc token' },
});

async function toRequest(request: http.IncomingMessage, baseUrl: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return new Request(new URL(request.url || '/', baseUrl), {
    method: request.method || 'GET',
    headers: request.headers as HeadersInit,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });
}

async function writeResponse(nodeResponse: http.ServerResponse, response: Response): Promise<void> {
  nodeResponse.statusCode = response.status;

  const setCookies =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (setCookies.length > 0) {
    nodeResponse.setHeader('set-cookie', setCookies);
  }

  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') continue;
    nodeResponse.setHeader(key, value);
  }

  const body = Buffer.from(await response.arrayBuffer());
  nodeResponse.end(body);
}

export async function startLocalAuthFlowServer(): Promise<LocalAuthFlowServer> {
  let baseUrl = '';

  const server = http.createServer(async (nodeRequest, nodeResponse) => {
    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        nodeResponse.statusCode = 500;
        nodeResponse.end('Server not ready');
        return;
      }

      baseUrl = `http://127.0.0.1:${address.port}`;
      const request = await toRequest(nodeRequest, baseUrl);
      const url = new URL(request.url);
      const origin = request.headers.get('origin');
      const allowedOrigins = [baseUrl];

      const coreRouteResponse = await handleWorkerCoreRoutes(
        {
          request,
          url,
          origin,
          allowedOrigins,
          env,
          ctx: executionContext,
          pathname: url.pathname,
          requestMethod: request.method,
          mcpPath: false,
        },
        {
          isAllowedOrigin: (candidateOrigin, candidates) =>
            candidateOrigin === null || candidates.includes(candidateOrigin),
          buildCorsHeaders,
          withCors,
          jsonError,
          jsonResponse,
          workerUiSessionRuntime,
          workerDurableRuntime: {
            consumeBrowserBootstrapHandoff: async () => ({ kind: 'ok', value: true }),
          },
          getWorkerLatencySnapshot: () => ({ routes: {} }),
          getUsageSnapshot: async (_unusedEnv, userId) => ({
            userId,
            totalRequests: 17,
            dailyRequests: 4,
            currentDay: '2026-04-23',
            lastSeenAt: '2026-04-23T20:45:00.000Z',
            byRoute: {
              '/api/session': 6,
              '/mcp': 11,
            },
            browserBootstrap: {
              attempted: 2,
              succeeded: 1,
              failed: 1,
              turnstileRefreshed: 0,
              lastOutcome: 'success',
              lastEventAt: '2026-04-23T20:40:00.000Z',
            },
          }),
          now: () => Date.now(),
        },
      );
      if (coreRouteResponse) {
        await writeResponse(nodeResponse, coreRouteResponse);
        return;
      }

      if (url.pathname === '/oauth/authorize') {
        const authorizeResponse = await handleWorkerOAuthAuthorizeRoute(request, env, {
          jsonError,
          redirectResponse,
          resolveCloudflareOAuthIdentity: workerUiSessionRuntime.resolveCloudflareOAuthIdentity,
        });
        await writeResponse(nodeResponse, authorizeResponse);
        return;
      }

      const authRouteResponse = await handleWorkerAuthHandoffRoutes({
        request,
        url,
        env,
        deps: {
          jsonError,
          generateCspNonce,
          htmlResponse,
          workerUiSessionRuntime,
          getOAuthHelpers: () => env.OAUTH_PROVIDER,
          buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
          resolveGrantedScopes: () => [],
        },
      });
      if (authRouteResponse) {
        await writeResponse(nodeResponse, authRouteResponse);
        return;
      }

      const uiShellResponse = await handleWorkerUiShellRoutes({
        request,
        url,
        env,
        deps: {
          spaBuildId: SPA_BUILD_ID,
          jsonError,
          fetchSpaAsset: async (assetRequest: Request, _env: LocalAuthFlowEnv) => {
            const path = new URL(assetRequest.url).pathname;
            if (path.endsWith('spa.js')) {
              return new Response(spaJs, { status: spaJs ? 200 : 404 });
            }
            if (path.endsWith('spa.css')) {
              return new Response(spaCss, { status: spaCss ? 200 : 404 });
            }
            return new Response('not found', { status: 404 });
          },
          spaAssetResponse: (assetResponse, contentType, buildId, extraHeaders) => {
            const headers = new Headers(assetResponse.headers);
            if (assetResponse.status >= 200 && assetResponse.status < 300) {
              headers.set('content-type', contentType);
              headers.set('etag', `"${buildId}"`);
              headers.set('cache-control', 'public, max-age=31536000, immutable');
            } else {
              headers.set('cache-control', 'no-store');
              headers.delete('etag');
            }
            if (extraHeaders) {
              for (const [name, value] of new Headers(extraHeaders).entries()) {
                headers.set(name, value);
              }
            }
            return new Response(assetResponse.body, {
              status: assetResponse.status,
              statusText: assetResponse.statusText,
              headers,
            });
          },
          generateCspNonce,
          getOrCreateCsrfCookieHeader: workerUiSessionRuntime.getOrCreateCsrfCookieHeader,
          htmlResponse,
          renderSpaShellHtml,
          redirectResponse: (location, status = 302, extraHeaders) =>
            new Response(null, {
              status,
              headers: {
                location,
                ...(extraHeaders ? Object.fromEntries(new Headers(extraHeaders).entries()) : {}),
              },
            }),
        },
      });
      if (uiShellResponse) {
        await writeResponse(nodeResponse, uiShellResponse);
        return;
      }

      if (url.pathname === '/client/callback') {
        const response = new Response(
          `<html><body><h1>Authorization completed</h1><p>code=${url.searchParams.get('code') || ''}</p><p>state=${url.searchParams.get('state') || ''}</p></body></html>`,
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          },
        );
        await writeResponse(nodeResponse, response);
        return;
      }

      nodeResponse.statusCode = 404;
      nodeResponse.end('Not found');
    } catch {
      nodeResponse.statusCode = 500;
      nodeResponse.end('Internal server error');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

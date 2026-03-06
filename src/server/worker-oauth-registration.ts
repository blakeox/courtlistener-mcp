import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { HOSTED_MCP_OAUTH_CONTRACT } from '../auth/oauth-contract.js';
import { redactSecretsInText } from '../infrastructure/secret-redaction.js';
import {
  emitOAuthDiagnostic,
  summarizeOAuthRequest,
  summarizeOAuthResponse,
} from './oauth-diagnostics.js';

interface RegistrationEnv {
  MCP_OAUTH_DIAGNOSTICS?: string;
}

type ClientInfo = Awaited<ReturnType<OAuthHelpers['createClient']>>;

interface RegistrationDeps<TEnv extends RegistrationEnv> {
  getRequestOrigin: (request: Request) => string | null;
  getRegistrationAllowedOrigins: (env: TEnv) => string[];
  isAllowedOrigin: (origin: string, allowedOrigins: string[]) => boolean;
  extractBearerToken: (authorizationHeader: string | null) => string | null;
  buildCorsHeaders: (origin: string | null, allowedOrigins: string[]) => Headers;
  withRegistrationCors: (response: Response, request: Request, env: TEnv) => Response;
  jsonRegistrationError: (error: string, errorDescription: string, status?: number) => Response;
  getOAuthHelpers: (env: TEnv) => OAuthHelpers;
  createRegistrationAccessToken: (env: TEnv, clientId: string) => Promise<string | null>;
  verifyRegistrationAccessToken: (
    env: TEnv,
    clientId: string,
    presentedToken: string,
  ) => Promise<boolean>;
}

function getClientRegistrationManagementUrl(origin: string, clientId: string): string {
  return new URL(`${HOSTED_MCP_OAUTH_CONTRACT.paths.register}/${encodeURIComponent(clientId)}`, origin)
    .toString();
}

function asNonEmptyStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
  );
}

function applyClientMetadata(
  target: Partial<ClientInfo>,
  metadata: Record<string, unknown>,
): void {
  const redirectUris = asNonEmptyStringArray(metadata.redirect_uris);
  if (redirectUris) target.redirectUris = redirectUris;

  if (typeof metadata.client_name === 'string') target.clientName = metadata.client_name;
  if (typeof metadata.logo_uri === 'string') target.logoUri = metadata.logo_uri;
  if (typeof metadata.client_uri === 'string') target.clientUri = metadata.client_uri;
  if (typeof metadata.policy_uri === 'string') target.policyUri = metadata.policy_uri;
  if (typeof metadata.tos_uri === 'string') target.tosUri = metadata.tos_uri;
  if (typeof metadata.jwks_uri === 'string') target.jwksUri = metadata.jwks_uri;

  const contacts = asNonEmptyStringArray(metadata.contacts);
  if (contacts) target.contacts = contacts;

  const grantTypes = asNonEmptyStringArray(metadata.grant_types);
  if (grantTypes) target.grantTypes = grantTypes;

  const responseTypes = asNonEmptyStringArray(metadata.response_types);
  if (responseTypes) target.responseTypes = responseTypes;

  if (typeof metadata.token_endpoint_auth_method === 'string') {
    target.tokenEndpointAuthMethod = metadata.token_endpoint_auth_method;
  }
}

function validateClientMetadataShape(
  body: unknown,
  options: { requireRedirectUris: boolean },
): { ok: true; metadata: Record<string, unknown> } | { ok: false; response: Response; reason: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: 'invalid_client_metadata',
          error_description: 'Client metadata must be a JSON object.',
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
        },
      ),
      reason: 'metadata_not_object',
    };
  }

  const metadata = body as Record<string, unknown>;
  if (options.requireRedirectUris) {
    const redirectUris = asNonEmptyStringArray(metadata.redirect_uris) ?? [];
    if (redirectUris.length === 0) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error: 'invalid_client_metadata',
            error_description: 'At least one redirect URI is required.',
          }),
          {
            status: 400,
            headers: {
              'content-type': 'application/json',
              'cache-control': 'no-store',
            },
          },
        ),
        reason: 'missing_redirect_uri',
      };
    }
  }

  if (Array.isArray(metadata.redirect_uris) && (asNonEmptyStringArray(metadata.redirect_uris)?.length ?? 0) === 0) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: 'invalid_client_metadata',
          error_description: 'redirect_uris cannot be empty when provided.',
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
        },
      ),
      reason: 'empty_redirect_uri_list',
    };
  }

  return { ok: true, metadata };
}

async function mapRegistrationResponse<TEnv extends RegistrationEnv>(
  origin: string,
  clientInfo: ClientInfo,
  env: TEnv,
  deps: Pick<RegistrationDeps<TEnv>, 'createRegistrationAccessToken'>,
  options: { includeClientSecret: boolean },
): Promise<Record<string, unknown>> {
  const response: Record<string, unknown> = {
    client_id: clientInfo.clientId,
    redirect_uris: clientInfo.redirectUris,
    client_name: clientInfo.clientName,
    logo_uri: clientInfo.logoUri,
    client_uri: clientInfo.clientUri,
    policy_uri: clientInfo.policyUri,
    tos_uri: clientInfo.tosUri,
    jwks_uri: clientInfo.jwksUri,
    contacts: clientInfo.contacts,
    grant_types: clientInfo.grantTypes,
    response_types: clientInfo.responseTypes,
    token_endpoint_auth_method: clientInfo.tokenEndpointAuthMethod,
    client_id_issued_at: clientInfo.registrationDate,
  };

  if (
    options.includeClientSecret &&
    typeof clientInfo.clientSecret === 'string' &&
    clientInfo.clientSecret.length > 0
  ) {
    response.client_secret = clientInfo.clientSecret;
    response.client_secret_expires_at = 0;
    response.client_secret_issued_at = clientInfo.registrationDate;
  }

  const registrationAccessToken = await deps.createRegistrationAccessToken(env, clientInfo.clientId);
  if (registrationAccessToken) {
    response.registration_client_uri = getClientRegistrationManagementUrl(origin, clientInfo.clientId);
    response.registration_access_token = registrationAccessToken;
  }

  return response;
}

function buildRegistrationDiscoveryResponse<TEnv extends RegistrationEnv>(
  request: Request,
  env: TEnv,
  deps: Pick<RegistrationDeps<TEnv>, 'withRegistrationCors'>,
): Response {
  const url = new URL(request.url);
  const body = {
    registration_endpoint: url.toString(),
    registration_supported: true,
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'none',
    ],
    grant_types_supported: [...HOSTED_MCP_OAUTH_CONTRACT.grantTypesSupported],
    response_types_supported: [...HOSTED_MCP_OAUTH_CONTRACT.responseTypesSupported],
    code_challenge_methods_supported: ['S256'],
  };

  return deps.withRegistrationCors(
    new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        allow: 'GET, HEAD, POST, OPTIONS',
      },
    }),
    request,
    env,
  );
}

async function handleClientRegistrationManagement<TEnv extends RegistrationEnv>(
  request: Request,
  env: TEnv,
  clientId: string,
  deps: RegistrationDeps<TEnv>,
): Promise<Response> {
  const requestSummary = await summarizeOAuthRequest(request);
  const presentedToken = deps.extractBearerToken(request.headers.get('authorization')) || '';

  if (!presentedToken) {
    const response = deps.withRegistrationCors(
      deps.jsonRegistrationError('invalid_token', 'Registration access token is required.', 401),
      request,
      env,
    );
    emitOAuthDiagnostic(env, 'oauth.register.management_unauthorized', {
      ...requestSummary,
      client_id: clientId,
      reason: 'missing_registration_access_token',
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  const oauthHelpers = deps.getOAuthHelpers(env);
  const clientInfo = await oauthHelpers.lookupClient(clientId);
  if (!clientInfo) {
    const response = deps.withRegistrationCors(
      deps.jsonRegistrationError('invalid_client', 'Registered client not found.', 404),
      request,
      env,
    );
    emitOAuthDiagnostic(env, 'oauth.register.management_missing', {
      ...requestSummary,
      client_id: clientId,
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  if (!(await deps.verifyRegistrationAccessToken(env, clientId, presentedToken))) {
    const response = deps.withRegistrationCors(
      deps.jsonRegistrationError('invalid_token', 'Registration access token is invalid.', 401),
      request,
      env,
    );
    emitOAuthDiagnostic(env, 'oauth.register.management_unauthorized', {
      ...requestSummary,
      client_id: clientId,
      reason: 'registration_access_token_mismatch',
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  if (request.method === 'GET') {
    const response = deps.withRegistrationCors(
      new Response(
        JSON.stringify(
          await mapRegistrationResponse(new URL(request.url).origin, clientInfo, env, deps, {
            includeClientSecret: false,
          }),
        ),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
        },
      ),
      request,
      env,
    );
    emitOAuthDiagnostic(env, 'oauth.register.management_read', {
      ...requestSummary,
      client_id: clientId,
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  if (request.method === 'DELETE') {
    await oauthHelpers.deleteClient(clientId);
    const response = deps.withRegistrationCors(
      new Response(null, {
        status: 204,
        headers: {
          'cache-control': 'no-store',
        },
      }),
      request,
      env,
    );
    emitOAuthDiagnostic(env, 'oauth.register.management_delete', {
      ...requestSummary,
      client_id: clientId,
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  if (request.method === 'PUT') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const response = deps.withRegistrationCors(
        deps.jsonRegistrationError('invalid_client_metadata', 'Request body must be valid JSON.'),
        request,
        env,
      );
      emitOAuthDiagnostic(env, 'oauth.register.management_update_failed', {
        ...requestSummary,
        client_id: clientId,
        reason: 'invalid_json',
        ...(await summarizeOAuthResponse(response)),
      });
      return response;
    }

    const validated = validateClientMetadataShape(body, { requireRedirectUris: false });
    if (!validated.ok) {
      const response = deps.withRegistrationCors(validated.response, request, env);
      emitOAuthDiagnostic(env, 'oauth.register.management_update_failed', {
        ...requestSummary,
        client_id: clientId,
        reason: validated.reason,
        ...(await summarizeOAuthResponse(response)),
      });
      return response;
    }

    const updates: Partial<ClientInfo> = {};
    applyClientMetadata(updates, validated.metadata);

    const updatedClient = await oauthHelpers.updateClient(clientId, updates);
    if (!updatedClient) {
      const response = deps.withRegistrationCors(
        deps.jsonRegistrationError('invalid_client', 'Registered client not found.', 404),
        request,
        env,
      );
      emitOAuthDiagnostic(env, 'oauth.register.management_update_failed', {
        ...requestSummary,
        client_id: clientId,
        reason: 'client_not_found',
        ...(await summarizeOAuthResponse(response)),
      });
      return response;
    }

    const response = deps.withRegistrationCors(
      new Response(
        JSON.stringify(
          await mapRegistrationResponse(new URL(request.url).origin, updatedClient, env, deps, {
            includeClientSecret: false,
          }),
        ),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
        },
      ),
      request,
      env,
    );
    emitOAuthDiagnostic(env, 'oauth.register.management_update', {
      ...requestSummary,
      client_id: clientId,
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  const response = deps.withRegistrationCors(
    deps.jsonRegistrationError('invalid_request', 'Method not allowed', 405),
    request,
    env,
  );
  emitOAuthDiagnostic(env, 'oauth.register.management_reject', {
    ...requestSummary,
    client_id: clientId,
    reason: 'method_not_allowed',
    ...(await summarizeOAuthResponse(response)),
  });
  return response;
}

export async function handleWorkerDynamicClientRegistration<TEnv extends RegistrationEnv>(
  request: Request,
  env: TEnv,
  deps: RegistrationDeps<TEnv>,
): Promise<Response> {
  const url = new URL(request.url);
  const origin = deps.getRequestOrigin(request);
  const allowedOrigins = deps.getRegistrationAllowedOrigins(env);
  const requestSummary = await summarizeOAuthRequest(request);
  const managementPrefix = `${HOSTED_MCP_OAUTH_CONTRACT.paths.register}/`;

  if (url.pathname.startsWith(managementPrefix)) {
    const clientId = decodeURIComponent(url.pathname.slice(managementPrefix.length)).trim();
    if (!clientId) {
      const response = deps.withRegistrationCors(
        deps.jsonRegistrationError('invalid_request', 'Client identifier is required.', 400),
        request,
        env,
      );
      emitOAuthDiagnostic(env, 'oauth.register.management_reject', {
        ...requestSummary,
        reason: 'missing_client_id',
        ...(await summarizeOAuthResponse(response)),
      });
      return response;
    }
    return handleClientRegistrationManagement(request, env, clientId, deps);
  }

  if (request.method === 'OPTIONS') {
    if (origin && !deps.isAllowedOrigin(origin, allowedOrigins)) {
      const response = new Response('Forbidden origin', { status: 403 });
      emitOAuthDiagnostic(env, 'oauth.register.options_forbidden', {
        ...requestSummary,
        ...(await summarizeOAuthResponse(response)),
      });
      return response;
    }

    const response = new Response(null, {
      status: 204,
      headers: deps.buildCorsHeaders(origin, allowedOrigins),
    });
    emitOAuthDiagnostic(env, 'oauth.register.options', {
      ...requestSummary,
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    const response = buildRegistrationDiscoveryResponse(request, env, deps);
    emitOAuthDiagnostic(env, 'oauth.register.discovery', {
      ...requestSummary,
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  if (request.method !== 'POST') {
    const response = deps.withRegistrationCors(
      deps.jsonRegistrationError('invalid_request', 'Method not allowed', 405),
      request,
      env,
    );
    emitOAuthDiagnostic(env, 'oauth.register.reject', {
      ...requestSummary,
      reason: 'method_not_allowed',
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const response = deps.withRegistrationCors(
      deps.jsonRegistrationError('invalid_client_metadata', 'Request body must be valid JSON.'),
      request,
      env,
    );
    emitOAuthDiagnostic(env, 'oauth.register.invalid_json', {
      ...requestSummary,
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  const validated = validateClientMetadataShape(body, { requireRedirectUris: true });
  if (!validated.ok) {
    const response = deps.withRegistrationCors(validated.response, request, env);
    emitOAuthDiagnostic(env, 'oauth.register.invalid_metadata', {
      ...requestSummary,
      reason: validated.reason,
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  try {
    const clientCreatePayload: Partial<ClientInfo> = {};
    applyClientMetadata(clientCreatePayload, validated.metadata);

    const clientInfo = await deps.getOAuthHelpers(env).createClient(clientCreatePayload);
    const response = deps.withRegistrationCors(
      new Response(
        JSON.stringify(
          await mapRegistrationResponse(url.origin, clientInfo, env, deps, {
            includeClientSecret: true,
          }),
        ),
        {
          status: 201,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
        },
      ),
      request,
      env,
    );
    emitOAuthDiagnostic(env, 'oauth.register.created', {
      ...requestSummary,
      client_id: clientInfo.clientId,
      redirect_uri_count: clientInfo.redirectUris.length,
      token_endpoint_auth_method: clientInfo.tokenEndpointAuthMethod,
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid client metadata.';
    const response = deps.withRegistrationCors(
      deps.jsonRegistrationError('invalid_client_metadata', message),
      request,
      env,
    );
    emitOAuthDiagnostic(env, 'oauth.register.create_failed', {
      ...requestSummary,
      error_message: redactSecretsInText(message),
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }
}

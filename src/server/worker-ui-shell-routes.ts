export interface HandleWorkerUiShellRoutesDeps<TEnv> {
  spaBuildId: string;
  jsonError: (message: string, status: number, errorCode: string) => Response;
  fetchSpaAsset: (request: Request, env: TEnv) => Promise<Response>;
  spaAssetResponse: (
    assetResponse: Response,
    contentType: string,
    buildId: string,
    extraHeaders?: HeadersInit,
  ) => Response;
  generateCspNonce: () => string;
  getOrCreateCsrfCookieHeader: (request: Request, env: TEnv) => string | null;
  htmlResponse: (html: string, nonce: string, extraHeaders?: HeadersInit) => Response;
  renderSpaShellHtml: (buildId: string) => string;
  redirectResponse: (location: string, status?: number, extraHeaders?: HeadersInit) => Response;
}

export interface HandleWorkerUiShellRoutesParams<TEnv> {
  request: Request;
  url: URL;
  env: TEnv;
  deps: HandleWorkerUiShellRoutesDeps<TEnv>;
}

const SPA_JS_PATH = '/app/spa.js';
const SPA_CSS_PATH = '/app/spa.css';

export async function handleWorkerUiShellRoutes<TEnv>(
  params: HandleWorkerUiShellRoutesParams<TEnv>,
): Promise<Response | null> {
  const { request, url, env, deps } = params;
  const publicSpaPaths = new Set(['/', '/get-started', '/account']);
  const hostedAuthRedirectPath = `/auth/start?${new URLSearchParams({ return_to: '/app/account' }).toString()}`;

  if (request.method === 'GET' && url.pathname === '/app/assets/spa.js') {
    const asset = await deps.fetchSpaAsset(
      new Request(new URL(SPA_JS_PATH, request.url), request),
      env,
    );
    return deps.spaAssetResponse(asset, 'application/javascript; charset=utf-8', deps.spaBuildId);
  }

  if (request.method === 'GET' && url.pathname === '/app/assets/spa.css') {
    const asset = await deps.fetchSpaAsset(
      new Request(new URL(SPA_CSS_PATH, request.url), request),
      env,
    );
    return deps.spaAssetResponse(asset, 'text/css; charset=utf-8', deps.spaBuildId);
  }

  if (url.pathname.startsWith('/app/assets/') && request.method !== 'GET') {
    return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
  }

  if (
    request.method === 'GET' &&
    (publicSpaPaths.has(url.pathname) ||
      url.pathname === '/app' ||
      url.pathname.startsWith('/app/'))
  ) {
    if (url.pathname.startsWith('/app/assets/')) {
      return deps.jsonError('Asset not found', 404, 'asset_not_found');
    }
    const nonce = deps.generateCspNonce();
    const csrfCookieHeader = deps.getOrCreateCsrfCookieHeader(request, env);
    return deps.htmlResponse(
      deps.renderSpaShellHtml(deps.spaBuildId),
      nonce,
      csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined,
    );
  }

  if (request.method === 'GET') {
    const previousUiPathMap: Record<string, string> = {
      '/signup': '/app/signup',
      '/login': '/app/login',
      '/signin': hostedAuthRedirectPath,
      '/sign-in': hostedAuthRedirectPath,
      '/oidc': hostedAuthRedirectPath,
      '/oidc/': hostedAuthRedirectPath,
      '/reset-password': '/app/reset-password',
      '/keys': '/app/keys',
      '/chat': '/app/console',
    };
    const redirectedPath = previousUiPathMap[url.pathname];
    if (redirectedPath) {
      const redirectUrl = new URL(redirectedPath, request.url);
      const csrfCookieHeader = deps.getOrCreateCsrfCookieHeader(request, env);
      return deps.redirectResponse(
        redirectUrl.toString(),
        302,
        csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined,
      );
    }
  }

  return null;
}

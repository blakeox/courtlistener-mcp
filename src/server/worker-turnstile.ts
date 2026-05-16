interface TurnstileRuntimeEnv {
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  MCP_TURNSTILE_ENFORCED_ROUTES?: string;
}

export interface TurnstileVerificationResult {
  enforced: boolean;
  success: boolean;
  siteKey: string | null;
  errorCode?: string;
  reason?: string;
  action?: string;
}

function parseCsvSet(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function extractTurnstileToken(request: Request): string {
  const headerToken = request.headers.get('cf-turnstile-response')?.trim();
  if (headerToken) return headerToken;
  const bodyToken = request.headers.get('x-turnstile-token')?.trim();
  return bodyToken || '';
}

export function getTurnstileSiteKey<TEnv extends TurnstileRuntimeEnv>(env: TEnv): string | null {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() || '';
  return siteKey || null;
}

export function isTurnstileEnforcedForRoute<TEnv extends TurnstileRuntimeEnv>(
  env: TEnv,
  routeId: string,
): boolean {
  const routes = parseCsvSet(env.MCP_TURNSTILE_ENFORCED_ROUTES);
  return routes.has(routeId);
}

export async function verifyTurnstileForRoute<TEnv extends TurnstileRuntimeEnv>(
  request: Request,
  env: TEnv,
  routeId: string,
  remoteIp?: string | null,
): Promise<TurnstileVerificationResult> {
  const siteKey = getTurnstileSiteKey(env);
  const secret = env.TURNSTILE_SECRET_KEY?.trim() || '';
  const enforced = isTurnstileEnforcedForRoute(env, routeId);

  if (!enforced) {
    return { enforced: false, success: true, siteKey };
  }

  if (!siteKey || !secret) {
    return {
      enforced: true,
      success: false,
      siteKey,
      errorCode: 'turnstile_not_configured',
      reason: 'Turnstile is enforced for this route but site/secret keys are missing.',
    };
  }

  const token = extractTurnstileToken(request);
  if (!token) {
    return {
      enforced: true,
      success: false,
      siteKey,
      errorCode: 'turnstile_token_missing',
      reason: 'Missing Turnstile token.',
    };
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteIp?.trim()) {
    body.set('remoteip', remoteIp.trim());
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const payload = (await response.json()) as {
      success?: boolean;
      'error-codes'?: string[];
      action?: string;
    };
    if (payload.success === true) {
      if (payload.action !== routeId) {
        return {
          enforced: true,
          success: false,
          siteKey,
          errorCode: 'turnstile_action_mismatch',
          reason: `Turnstile token action ${payload.action || 'unknown'} does not match ${routeId}.`,
          ...(payload.action ? { action: payload.action } : {}),
        };
      }
      return { enforced: true, success: true, siteKey };
    }
    return {
      enforced: true,
      success: false,
      siteKey,
      errorCode: payload['error-codes']?.[0] || 'turnstile_verification_failed',
      reason: 'Turnstile verification failed.',
      ...(payload.action ? { action: payload.action } : {}),
    };
  } catch (error) {
    return {
      enforced: true,
      success: false,
      siteKey,
      errorCode: 'turnstile_verification_unavailable',
      reason: error instanceof Error ? error.message : 'Turnstile verification unavailable.',
    };
  }
}

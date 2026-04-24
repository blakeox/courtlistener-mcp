import { parsePositiveInt } from '../common/validation.js';

interface RegistrationTokenEnv {
  MCP_OAUTH_REGISTRATION_TOKEN_SECRET?: string;
  MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS?: string;
  MCP_UI_SESSION_SECRET?: string;
  COURTLISTENER_API_KEY?: string;
}

function getRegistrationTokenSigningSecret(env: RegistrationTokenEnv): string | null {
  return (
    env.MCP_OAUTH_REGISTRATION_TOKEN_SECRET?.trim() ||
    env.MCP_UI_SESSION_SECRET?.trim() ||
    env.COURTLISTENER_API_KEY?.trim() ||
    null
  );
}

function getRegistrationTokenTtlSeconds(env: RegistrationTokenEnv): number {
  return parsePositiveInt(env.MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS, 24 * 60 * 60);
}

function encodeBase64Url(input: Uint8Array): string {
  const base64 = Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64UrlBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return new Uint8Array(Buffer.from(padded, 'base64'));
  } catch {
    return null;
  }
}

function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftByte = left[index];
    const rightByte = right[index];
    if (leftByte === undefined || rightByte === undefined) return false;
    mismatch |= leftByte ^ rightByte;
  }
  return mismatch === 0;
}

async function signRegistrationPayload(
  payloadBytes: Uint8Array,
  secret: string,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, Buffer.from(payloadBytes)));
}

export async function createRegistrationAccessToken(
  env: RegistrationTokenEnv,
  clientId: string,
): Promise<string | null> {
  const secret = getRegistrationTokenSigningSecret(env);
  if (!secret) return null;

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    v: 1,
    cid: clientId,
    iat: issuedAt,
    exp: issuedAt + getRegistrationTokenTtlSeconds(env),
  });
  const payloadBytes = new TextEncoder().encode(payload);
  const signature = await signRegistrationPayload(payloadBytes, secret);
  return `clreg.v1.${encodeBase64Url(payloadBytes)}.${encodeBase64Url(signature)}`;
}

export async function verifyRegistrationAccessToken(
  env: RegistrationTokenEnv,
  clientId: string,
  presentedToken: string,
): Promise<boolean> {
  const secret = getRegistrationTokenSigningSecret(env);
  if (!secret) return false;

  const [prefix, version, encodedPayload, encodedSignature] = presentedToken.split('.');
  if (prefix !== 'clreg' || version !== 'v1' || !encodedPayload || !encodedSignature) {
    return false;
  }

  const payloadBytes = decodeBase64UrlBytes(encodedPayload);
  const signatureBytes = decodeBase64UrlBytes(encodedSignature);
  if (!payloadBytes || !signatureBytes) return false;

  const expectedSignature = await signRegistrationPayload(payloadBytes, secret);
  if (!timingSafeEqualBytes(expectedSignature, signatureBytes)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadBytes).toString('utf-8')) as {
      v?: number;
      cid?: string;
      exp?: number;
    };
    return (
      payload.v === 1 &&
      payload.cid === clientId &&
      typeof payload.exp === 'number' &&
      payload.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

/**
 * Web-platform base64url helpers shared by the Worker runtime.
 *
 * These deliberately avoid Node's Buffer so deployed Workers do not need a
 * Node compatibility shim merely to encode cursors or signed payloads.
 */

const BASE64_PADDING = (length: number): string => '='.repeat((4 - (length % 4)) % 4);

export function encodeBase64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

export function decodeBase64UrlBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized + BASE64_PADDING(normalized.length));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function decodeBase64Url(value: string): string | null {
  const bytes = decodeBase64UrlBytes(value);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

import { webcrypto } from 'node:crypto';

export function installNodeWebCryptoForTests(): void {
  if (typeof globalThis.crypto !== 'undefined') {
    return;
  }

  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

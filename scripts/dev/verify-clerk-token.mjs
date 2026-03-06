import { createLocalJWKSet, jwtVerify } from 'jose';

const token = process.argv[2];
if (!token) {
  console.error('token required');
  process.exit(1);
}
const issuer = 'https://learning-cobra-42.clerk.accounts.dev';
const jwksUrl = 'https://learning-cobra-42.clerk.accounts.dev/.well-known/jwks.json';
const res = await fetch(jwksUrl, { headers: { accept: 'application/json' } });
const jwks = await res.json();
console.log(JSON.stringify({ jwksKids: jwks.keys.map(k => ({ kid: k.kid, alg: k.alg, kty: k.kty })) }, null, 2));
const JWKS = createLocalJWKSet(jwks);
try {
  const out = await jwtVerify(token, JWKS, { issuer });
  console.log(JSON.stringify({ ok: true, protectedHeader: out.protectedHeader, payload: out.payload }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, name: error?.name, message: error?.message, code: error?.code }, null, 2));
}

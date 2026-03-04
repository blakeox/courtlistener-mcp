import assert from 'node:assert/strict';

export interface ProtocolHeaderNegotiationCase {
  name: string;
  required: boolean;
  headerValue: string | null;
  expectedStatus: number | null;
  expectedError?: string;
}

export function createProtocolHeaderNegotiationCases(
  supportedVersion: string,
  unsupportedVersion = '2099-01-01',
): ProtocolHeaderNegotiationCase[] {
  return [
    {
      name: 'missing protocol header when required',
      required: true,
      headerValue: null,
      expectedStatus: 400,
      expectedError: 'missing_protocol_version',
    },
    {
      name: 'unsupported protocol header',
      required: false,
      headerValue: unsupportedVersion,
      expectedStatus: 400,
      expectedError: 'unsupported_protocol_version',
    },
    {
      name: 'supported protocol header',
      required: true,
      headerValue: supportedVersion,
      expectedStatus: null,
    },
  ];
}

export interface InvalidSessionLifecycleCase {
  name: string;
  sessionId: string;
}

export function createInvalidSessionLifecycleCases(
  closedSessionId: string,
): InvalidSessionLifecycleCase[] {
  return [
    {
      name: 'unknown session id',
      sessionId: 'invalid-session-id',
    },
    {
      name: 'closed session id',
      sessionId: closedSessionId,
    },
  ];
}

interface ErrorPayload {
  error?: string;
  message?: string;
}

export async function assertAuthFailureShape(
  response: Response,
  expectedStatus: number,
  expectedError: string,
): Promise<ErrorPayload> {
  assert.equal(response.status, expectedStatus);
  const payload = (await response.json()) as ErrorPayload;
  assert.equal(payload.error, expectedError);
  assert.equal(typeof payload.message, 'string');
  return payload;
}

interface JsonRpcInvalidSessionPayload {
  jsonrpc?: string;
  error?: {
    code?: number;
    message?: string;
  };
}

export function assertInvalidSessionLifecycleShape(payload: unknown): void {
  const typed = payload as JsonRpcInvalidSessionPayload;
  assert.equal(typed.jsonrpc, '2.0');
  assert.equal(typed.error?.code, -32000);
  assert.equal(typed.error?.message, 'Invalid or missing session');
}

export interface InvalidSessionLifecyclePayload {
  jsonrpc: '2.0';
  error: {
    code: -32000;
    message: 'Invalid or missing session';
  };
}

export function createInvalidSessionLifecycleResponse(status = 400): Response {
  const payload: InvalidSessionLifecyclePayload = {
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Invalid or missing session',
    },
  };

  return Response.json(payload, { status });
}

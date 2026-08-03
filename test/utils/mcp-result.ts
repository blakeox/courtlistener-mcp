/**
 * Read the machine-readable payload from a modern MCP tool result.
 *
 * Successful ResponseBuilder results wrap handler data in `data`, while
 * errors expose the envelope itself. Keeping that distinction here lets
 * tests assert the public MCP contract instead of the human summary text.
 */
export function getStructuredPayload<T>(result: { structuredContent?: unknown }): T {
  const structuredContent = result.structuredContent;
  if (!structuredContent || typeof structuredContent !== 'object') {
    throw new Error('MCP result is missing structuredContent');
  }

  const envelope = structuredContent as Record<string, unknown>;
  return ('data' in envelope ? envelope.data : envelope) as T;
}

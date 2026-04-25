export type HostedOAuthCompletionSource = 'browser_oauth_complete' | 'cloudflare_oauth';

export function buildHostedOAuthCompletionDetails(
  source: HostedOAuthCompletionSource,
  userId: string,
): {
  metadata: {
    source: HostedOAuthCompletionSource;
    approved_at: string;
  };
  props: {
    userId: string;
    authMethod: HostedOAuthCompletionSource;
  };
} {
  return {
    metadata: {
      source,
      approved_at: new Date().toISOString(),
    },
    props: {
      userId,
      authMethod: source,
    },
  };
}

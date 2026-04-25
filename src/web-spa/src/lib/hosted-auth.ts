export const DEFAULT_AUTH_RETURN_TO = '/app/account';

export function buildHostedAuthStartHref(returnTo = DEFAULT_AUTH_RETURN_TO): string {
  return `/auth/start?${new URLSearchParams({ return_to: returnTo }).toString()}`;
}

export function redirectToHostedAuth(returnTo = DEFAULT_AUTH_RETURN_TO): void {
  window.location.replace(buildHostedAuthStartHref(returnTo));
}

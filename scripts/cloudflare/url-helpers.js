/** True when a redirect targets Cloudflare Access login. */
export function isCloudflareAccessLoginRedirect(location) {
  if (!location) return false;
  try {
    const parsed = new URL(location, 'https://placeholder.invalid');
    if (parsed.pathname.includes('/cdn-cgi/access/login')) {
      return true;
    }
    return parsed.hostname.endsWith('.cloudflareaccess.com');
  } catch {
    return false;
  }
}

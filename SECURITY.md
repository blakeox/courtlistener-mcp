# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it
responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email security concerns to the repository maintainers via the
contact information in the repository profile, or use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
feature.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix or mitigation**: Best effort, typically within 30 days

## Scope

The following are in scope for security reports:

- Hosted OAuth/OIDC authorization, token, registration, and discovery endpoints
- Worker-owned UI session and CSRF protection
- MCP v2 protocol endpoint (`/mcp`)
- Explicit service-token path (`x-mcp-service-token`)
- Cross-origin resource sharing (CORS) configuration
- Content Security Policy (CSP)

## Authentication Overview

- **MCP endpoint**: OAuth/OIDC bearer tokens via `Authorization`;
  `MCP_AUTH_TOKEN` is reserved for the explicit service-token header path
- **Web UI**: Worker-owned signed session cookies with CSRF protection and
  hosted OAuth/OIDC handoff
- **Local stdio**: Clients provide their own `COURTLISTENER_API_KEY`; it is not
  exposed through the hosted Worker

## Data Handling

- No user data is stored beyond the authentication/session metadata required by
  the configured Worker flow
- All API calls to CourtListener are proxied server-side; user tokens are never
  exposed to the client
- Session tokens use HMAC-SHA256 signing with server-side secrets
- OAuth/OIDC credentials remain with the configured identity provider

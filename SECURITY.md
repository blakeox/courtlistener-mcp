# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email security concerns to the repository maintainers via the contact information in the repository profile, or use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) feature.

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

- Authentication and session management (`/api/login`, `/api/session`, `/api/signup`)
- API key creation and revocation (`/api/keys`)
- CSRF protection and cookie handling
- MCP protocol endpoint (`/mcp`)
- Cross-origin resource sharing (CORS) configuration
- Content Security Policy (CSP)

## Authentication Overview

- **MCP endpoint**: Bearer token authentication via `Authorization` header or `SSE_AUTH_TOKEN`
- **Web UI**: Session cookies with CSRF protection, Supabase-backed user management
- **API keys**: User-scoped keys with configurable expiration, stored server-side

## Data Handling

- No user data is stored beyond authentication credentials and API key metadata
- All API calls to CourtListener are proxied server-side; user tokens are never exposed to the client
- Session tokens use HMAC-SHA256 signing with server-side secrets
- Passwords are managed by Supabase Auth (bcrypt hashing)

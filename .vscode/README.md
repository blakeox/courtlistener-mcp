# VS Code workspace configuration

The workspace configuration follows the current pnpm and Cloudflare Workers
topology and exposes only supported repository commands.

Available tasks include:

- Build and Typecheck
- Watch TypeScript
- Unit and Workers tests
- Cloudflare startup profiling
- Edge and MCP Worker local development

The launch configurations start the local Node MCP parity runtime or debug the
currently open test file. Use the repository scripts in `package.json` as the
source of truth for CI, deployment, and hosted Worker validation.

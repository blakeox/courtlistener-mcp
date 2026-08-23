# Code Mode evaluation boundary

## Decision

Do not add Code Mode to the production Edge or MCP Worker yet. Keep
`CODEMODE_ENABLED=false` and keep the direct MCP tool surface unchanged.

The current Cloudflare package is `@cloudflare/codemode` 0.5.1. Cloudflare's
current integration uses a Worker Loader binding, `DynamicWorkerExecutor`, and
either `createCodeTool()` or `codeMcpServer()`. The Cloudflare documentation
labels the Code Mode MCP pattern experimental, so adding it to the production
Worker would create a second execution boundary before its controls are
independently proven.

## Required preview shape

The first implementation must be a separate preview Worker with its own name,
route, secrets, Durable Object state, and Worker Loader binding. It may call a
host-owned allowlist of read-only MCP handlers, but it must not receive the
CourtListener API key or the general MCP service catalog.

The preview boundary must enforce all of the following before it can be enabled:

- only explicitly annotated read-only tools are exposed;
- `DynamicWorkerExecutor` uses a bounded timeout and `globalOutbound: null`;
- generated code receives proxy methods, never `env`, secrets, filesystem, or
  arbitrary network access;
- CPU, execution, tool-call, output-size, and concurrency limits are explicit;
- execution records include execution ID, principal, code hash, selected tools,
  result class, duration, and failure reason without storing generated source;
- direct-tool and Code Mode fixtures produce equivalent normalized results;
- disabling the preview route prevents new executions while direct MCP traffic
  remains available.

## Promotion gates

Promotion is blocked until the preview has protocol, authorization, rate-limit,
audit, negative-network, secret-isolation, timeout, output-limit, kill-switch,
and result-parity evidence. A failed gate leaves the preview disabled and does
not change MCP sessions, Queue state, OAuth records, or direct read-only tools.

## Operational burden

Code Mode adds a Worker Loader dependency, a sandbox lifecycle, a new audit
surface, and a second tool-dispatch contract. That burden is justified only if
measured token reduction and latency improvement exceed the direct-tool baseline
without increasing failure or authorization ambiguity. Until then, the durable
choice is to keep the capability evaluated but disabled.

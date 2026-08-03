# MCP Current State Analysis

**Date**: June 16, 2026 **SDK Version**: 1.29.0

---

## Current Capabilities

- **Tools**: 49 governed research handlers + 3 async control tools (52 total)
- **Resources**: Static examples + URI templates via `resources/templates/list`
- **Prompts**: 12 governed prompts
- **Logging**: `logging/setLevel` + `notifications/message` bridge
- **Sampling**: Optional (`SAMPLING_ENABLED=true`)
- **Instructions**: Returned on `initialize` (`MCP_SERVER_INSTRUCTIONS`)

---

## Best-Practice Alignment

### Implemented

1. Honest capability advertisement (`buildServerCapabilities`)
2. Human-readable text + `structuredContent` in tool responses
3. Accurate tool annotations for mutating/destructive tools
4. Per-session resource subscriptions + `notifications/resources/updated`
5. Build-time package version injection for Workers
6. Unified `SAMPLING_ENABLED` flag
7. **Server instructions** on initialize
8. **`resources/templates/list`** for dynamic URI discovery
9. **Session subscription cleanup** on HTTP session close
10. **Integration tests** (`test/integration/test-mcp-surface-protocol.ts`,
    wired into `npm run test:integration`)
11. **`outputSchema` on all governed tools** — generated via
    `tool-output-schema-contract.ts` + `generate-tool-schemas.mjs`, attached in
    `buildToolDefinitions`
12. **Runtime `/health` unified contract** — shared core fields plus
    `diagnostics.session_topology`, `diagnostics.cloudflare`, and
    `diagnostics.metrics` across Worker, streamable HTTP, and diagnostics HTTP
13. **Proactive resource refresh notifications** — TTL-driven
    `resources/updated` while subscriptions remain active
14. **MCP progress notifications** — `notifications/progress` when the client
    requests progress tracking during `tools/call`
15. **Native MCP tasks (optional)** — `MCP_NATIVE_TASKS_ENABLED=true` bridges
    async jobs to `tasks/*` for in-memory and queue-backed Worker workflows
16. **Diagnostics `/health` contract** — diagnostics HTTP server uses the same
    unified payload envelope as streamable HTTP and Worker
17. **Session topology validation** — shared `session-topology-config.ts` for
    startup diagnostics and deploy checks; Worker-vs-Node invalid-session
    contract in `test:integration`
18. **`listChanged` notifications (optional)** — `MCP_LIST_CHANGED_ENABLED=true`
    advertises and emits `notifications/*/list_changed` when catalogs mutate

---

## Feature Flags

| Variable                     | Default | Effect                                                                             |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `LOGGING_ENABLED`            | `true`  | Advertise logging + forward server logs                                            |
| `SAMPLING_ENABLED`           | `false` | Advertise sampling + enable `SamplingService`                                      |
| `MCP_RESOURCE_SUBSCRIPTIONS` | `true`  | Advertise `resources.subscribe`                                                    |
| `MCP_NATIVE_TASKS_ENABLED`   | `false` | Advertise native MCP `tasks/*` and map async jobs to task records                  |
| `MCP_LIST_CHANGED_ENABLED`   | `false` | Advertise `listChanged` for tools/resources/prompts and emit catalog notifications |

---

## Testing

- `test/unit/test-mcp-best-practices.ts`
- `test/unit/test-subscription-manager.ts`
- `test/unit/test-handler-registry.ts`
- `test/unit/test-runtime-health-contract.ts` — unified `/health` diagnostics
  envelope across runtimes
- `test/unit/test-http-server.ts`
- `test/unit/test-async-workflow-task-store.ts`
- `test/unit/test-mcp-progress-and-tasks.ts`
- `test/unit/test-session-topology-config.ts`
- `test/unit/test-startup-session-topology.ts`
- `test/unit/test-protocol-list-changed-notifier.ts`
- `test/integration/test-mcp-surface-protocol.ts` — instructions, templates,
  logging, subscribe, structuredContent, outputSchema, initialize capabilities,
  progress notifications, proactive refresh TTL, native tasks flag, listChanged
  notifications
- `test:transport:http` — streamable HTTP transport contract (also in
  `test:integration` and `startup-diagnostics` CI gate)
- `test:protocol` — bundles surface + session contract + HTTP transport
- `test:session:contract` — Worker-vs-Node invalid-session lifecycle parity
  (also in `test:integration`)
- `test/unit/test-manifest-contract.ts` — governed tool outputSchema +
  regenerated manifest metadata

---

_Last updated: June 16, 2026_

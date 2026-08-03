# Cloudflare release receipt

This is the minimum evidence record for a CourtListener MCP Worker promotion. It
is a release artifact, not a substitute for Cloudflare state verification.

## State machine

```text
planned -> validated -> uploaded -> previewed -> canary -> promoted
                  \-> rejected
uploaded -> quarantined
canary -> rolled-back
```

The release controller must be idempotent by release ID, source SHA, Worker, and
environment. A retry discovers an existing upload instead of creating an
untracked version.

## Read-only live preflight

Release validation runs `pnpm run cloudflare:check:live` after environment
isolation checks. The job requires:

- `CLOUDFLARE_ACCOUNT_ID` as a GitHub environment variable;
- `CLOUDFLARE_READONLY_API_TOKEN` as a GitHub environment secret with only the
  read permissions needed for account, Worker, and Queue inventory. Local
  preflight accepts either `CLOUDFLARE_READONLY_API_TOKEN` or the workflow's
  mapped `CLOUDFLARE_API_TOKEN` variable.

The preflight uses GET requests only. It verifies Worker names, the single
intended Queue consumer, retry policy, and the configured DLQ. It must fail
before upload when live state is missing or divergent. It does not create,
update, purge, deploy, rollback, or rotate Cloudflare resources.

## Required receipt fields

```json
{
  "schema_version": "v1",
  "release_id": "release-<unique-id>",
  "environment": "staging|production",
  "source_sha": "<40-char-sha>",
  "workflow_run": "<github-run-id>",
  "deployment_authority": "github-actions",
  "toolchain": {
    "node": "<version>",
    "pnpm": "<version>",
    "wrangler": "<version>",
    "compatibility_date": "2026-03-02"
  },
  "workers": {
    "auth_limiter": { "version_id": "<id>", "traffic_percent": 0 },
    "edge": { "version_id": "<id>", "traffic_percent": 0 },
    "mcp": { "version_id": "<id>", "traffic_percent": 0 }
  },
  "topology": {
    "routes_hash": "<hash>",
    "bindings_hash": "<hash>",
    "resource_manifest": "<artifact-or-commit-path>"
  },
  "probes": {
    "health": "<artifact-path>",
    "readiness": "<artifact-path>",
    "oauth": "<artifact-path>",
    "mcp_initialize": "<artifact-path>",
    "direct_mcp_denial": "<artifact-path>",
    "version_override": "<artifact-path>"
  },
  "queue": {
    "consumer_owner": "<worker>",
    "max_retries": 3,
    "dead_letter_queue": "<queue>",
    "oldest_message_age_seconds": 0
  },
  "rollback": {
    "target_version_ids": ["<prior-auth>", "<prior-edge>", "<prior-mcp>"],
    "migration_reversal_allowed": false,
    "kill_switches": ["MCP_ASYNC_QUEUE_ENABLED=false", "CODEMODE_ENABLED=false"]
  },
  "decision": "promote|hold|rollback",
  "approved_by": "<principal>",
  "recorded_at": "<timestamp>"
}
```

## Promotion gates

1. Local build, typecheck, protocol, Workers-runtime, redaction, queue, and IaC
   ownership checks pass.
2. Wrangler dry-run is reviewed with the exact source SHA and compatibility
   date.
3. All three Worker versions are uploaded without normal traffic.
4. Preview/version-override probes prove the paired Edge → MCP binding and
   direct-MCP denial behavior.
5. Staging readiness, OAuth, MCP initialize, Queue/DLQ, and rollback probes are
   recorded.
6. Canary traffic is promoted only with a fresh receipt and an operator
   decision.

Never treat Edge `/health` alone as release proof. Do not reverse Durable Object
migrations during rollback; keep data changes forward-compatible and restore the
prior compatible Worker versions instead.

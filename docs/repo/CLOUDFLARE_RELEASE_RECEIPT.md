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

The release controller uses the release ID and Worker role as a unique version
tag. Before uploading Edge or MCP, it queries Wrangler's deployable version list
and reuses one exact tagged version; duplicate tag matches fail closed. Wrangler
only exposes its recent deployable version window, so an operator must restore
the release state artifact for retries outside that window rather than creating
an untracked upload.

The implementation is `scripts/cloudflare/release-controller.mjs`, exposed as
`pnpm run cloudflare:release` and invoked by
`.github/workflows/cloudflare-release.yml`. The workflow is manual and binds to
the selected GitHub environment. It runs the repository/IaC/live preflight,
deploys the declarative-exports auth-limiter directly at 100%, uploads Edge and
MCP inactive first, then deploys the auth-limiter at 100%, canaries the
versioned pair, and promotes only when the explicit `promote` input is approved.
A held canary remains an artifact-backed state rather than silently becoming
production traffic.

The controller also refuses to operate when the release ID, source SHA, prior
100-percent version, or two-version traffic split is ambiguous. Rollback uses
the recorded prior version IDs and does not reverse Durable Object lifecycle
changes. The exports-managed auth-limiter uses `wrangler rollback`, while Edge
and MCP use versioned 100% deployment. The auth-limiter is recorded at 100%
during a canary because Cloudflare's declarative Durable Object lifecycle cannot
use `wrangler versions upload` or gradual lifecycle deployment.

The paired probe step uses Cloudflare's `Cloudflare-Workers-Version-Overrides`
dictionary header to pin the public Edge request to the uploaded Edge version
and the forwarded service-binding request to the uploaded MCP version. The probe
artifacts record the requested IDs and status outcomes; Workers Logs/Tail
remains the authoritative evidence that the selected versions actually executed.

## Read-only live preflight

Release validation runs `pnpm run cloudflare:check:live` after environment
isolation checks. The job requires:

- `CLOUDFLARE_ACCOUNT_ID` as a GitHub environment variable when the
  authenticated Wrangler identity has multiple accounts; a single-account
  Wrangler identity is resolved automatically;
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
    "compatibility_date": "2026-08-18"
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
    "mcp_discovery": "<artifact-path>",
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
3. Edge and MCP versions are uploaded without normal traffic; the auth-limiter
   is deployed directly at 100% only after those uploads succeed.
4. Preview/version-override probes prove the paired Edge → MCP binding and
   direct-MCP denial behavior.
5. Staging readiness, OAuth, MCP v2 discovery, Queue/DLQ, and rollback probes
   are recorded.
6. Canary traffic is promoted only with a fresh receipt and an operator
   decision.

The controller workflow does not create secrets, bypass missing required
secrets, or treat an unauthenticated protocol response as an OAuth success.
Those are explicit preflight and authenticated-probe gates.

Never treat Edge `/health` alone as release proof. Do not reverse Durable Object
lifecycle changes during rollback; keep data changes forward-compatible and
restore the prior compatible Worker versions instead.

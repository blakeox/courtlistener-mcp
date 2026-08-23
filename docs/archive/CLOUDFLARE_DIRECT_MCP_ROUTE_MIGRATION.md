# Direct MCP route migration artifact

Status: retained for emergency rollback reference; not an active deployment
configuration.

The active architecture uses the Edge custom domain as the only public ingress.
The Edge Worker owns OAuth, WAF/rate-limit policy, `/mcp`, and `/sse`, then
forwards authenticated requests through the private `MCP_SERVICE` binding.

The retired MCP zone route inventory was:

```jsonc
[
  {
    "pattern": "courtlistenermcp.blakeoxford.com/mcp",
    "zone_name": "blakeoxford.com",
  },
  {
    "pattern": "courtlistenermcp.blakeoxford.com/mcp/*",
    "zone_name": "blakeoxford.com",
  },
  {
    "pattern": "courtlistenermcp.blakeoxford.com/sse",
    "zone_name": "blakeoxford.com",
  },
  {
    "pattern": "courtlistenermcp.blakeoxford.com/sse/*",
    "zone_name": "blakeoxford.com",
  },
]
```

Do not restore these routes as a normal operating state. Emergency rollback
requires a recorded incident/change decision, a verified prior Edge/MCP pair,
and confirmation that the public Edge path is unavailable. Re-run OAuth,
protocol, readiness, WAF, and route-inventory probes after rollback. Restore the
Edge-only topology once the failure is understood; do not operate both ingress
paths indefinitely.

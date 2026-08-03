/**
 * MCP server instructions returned during initialize.
 * Helps clients choose the right tools, auth model, and long-running patterns.
 */
export const MCP_SERVER_INSTRUCTIONS = `CourtListener MCP provides read-only legal research tools plus a small set of alert-management mutations.

Usage guidelines:
- Prefer smart_search for natural-language legal questions; use search_opinions/search_cases for structured filters.
- Use lookup_citation or validate_citations when the user supplies a reporter citation.
- Read-only tools are safe to retry; mutating tools (manage_alerts, create_docket_alert, get_enhanced_recap_data with action=email, mcp_async_cancel_job) change external state.
- Long-running work returns an async envelope when explicitly enabled; poll with mcp_async_get_job and fetch results via mcp_async_get_job_result.
- Resources are available at courtlistener:// URIs; call resources/templates/list to discover URI patterns before resources/read.
- Subscribe to resources when you need notifications/resources/updated after reads.
- Dynamic resources (for example courtlistener://api/status) emit proactive refresh notifications on a TTL while subscribed.
- Long-running sync tool calls emit notifications/progress when the client requests progress tracking during tools/call.
- Enable MCP_NATIVE_TASKS_ENABLED=true to use native MCP tasks/* alongside the mcp_async_* controls.
- Queue-backed async execution is disabled by default; when enabled with MCP_ASYNC_QUEUE_ENABLED=true, only the read-only queue allowlist is eligible and delivery is at-least-once.
- Enable MCP_LIST_CHANGED_ENABLED=true to receive notifications/tools/list_changed, notifications/resources/list_changed, and notifications/prompts/list_changed when catalogs change.
- Hosted deployments require OAuth; local stdio clients typically provide COURTLISTENER_API_KEY.`;

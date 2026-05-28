/// <reference types="@cloudflare/workers-types" />

/**
 * Slim Worker entry for AuthFailureLimiterDO only.
 * Main MCP worker calls this script via AUTH_FAILURE_LIMITER script_name binding.
 */
export { AuthFailureLimiterDO } from './server/auth-failure-limiter-do.js';

export default {
  async fetch(): Promise<Response> {
    return new Response('Auth limiter durable object worker', { status: 404 });
  },
};

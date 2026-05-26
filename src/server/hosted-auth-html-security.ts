import { HOSTED_MCP_BROWSER_AUTH_CONTRACT } from '../auth/oauth-contract.js';
import type { HtmlResponseSecurityOptions } from './worker-response-runtime.js';

/** Inline scripts injected by Cloudflare/captive portals on hosted auth pages (hashes from browser CSP reports). */
export const HOSTED_AUTH_INLINE_SCRIPT_HASHES = [
  "'sha256-CsRg1c/uAShTQr6MSbfT26yXsxtsm7ZpMgc41yupCOo='",
  "'sha256-PBIIO99gDQxCFzWUcG6igjK4mjItQrNaA+ccPy87s0M='",
] as const;

/** CSP options for all Worker-hosted auth HTML pages (/auth/start, /oauth/approve, logout, errors). */
export const HOSTED_AUTH_HTML_SECURITY: HtmlResponseSecurityOptions = {
  omitFormAction: true,
  allowHostedAuthInlineScriptHashes: true,
};

const APPROVE_FORM_ACTION = HOSTED_MCP_BROWSER_AUTH_CONTRACT.paths.approve;

/**
 * Regression guard: hosted auth HTML must omit form-action so same-origin POST to
 * /oauth/approve is not blocked in Chrome/Cursor when redirect_uri uses opaque origins.
 */
export function assertHostedAuthHtmlContentSecurityPolicy(cspHeader: string | null): void {
  const csp = (cspHeader ?? '').trim();
  if (!csp) {
    throw new Error('Hosted auth HTML response is missing Content-Security-Policy');
  }
  if (/form-action/i.test(csp)) {
    throw new Error(
      'Hosted auth HTML CSP must omit form-action (Chrome/Cursor blocks same-origin approve POST otherwise)',
    );
  }
  if (/\bcursor:/i.test(csp)) {
    throw new Error('Hosted auth HTML CSP must not include cursor: scheme origins');
  }
  for (const hash of HOSTED_AUTH_INLINE_SCRIPT_HASHES) {
    if (!csp.includes(hash)) {
      throw new Error(`Hosted auth HTML CSP is missing required script hash ${hash}`);
    }
  }
  if (!csp.includes("script-src 'self'")) {
    throw new Error("Hosted auth HTML CSP must include script-src 'self'");
  }
}

/**
 * Approve form posts to a fixed path; return_to travels in the body to avoid long
 * form-action allowlists that break under CSP in embedded browsers.
 */
export function assertOAuthApproveFormMarkup(html: string): void {
  if (/action="[^"]*\/oauth\/approve\?/i.test(html)) {
    throw new Error('OAuth approve form action must not include query parameters');
  }
  const escapedApprovePath = APPROVE_FORM_ACTION.replace(/\//g, '\\/');
  if (!new RegExp(`action="${escapedApprovePath}"`).test(html)) {
    throw new Error(`OAuth approve form action must be exactly "${APPROVE_FORM_ACTION}"`);
  }
  if (!/name="return_to"/i.test(html)) {
    throw new Error('OAuth approve form must include a return_to field');
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

data "cloudflare_zone" "mcp" {
  filter = {
    name = var.zone_name
  }
}

resource "cloudflare_ruleset" "oauth_probe_skip" {
  zone_id     = data.cloudflare_zone.mcp.id
  name        = "Allow hosted OAuth probes"
  description = "Skips bot/rate-limit edge checks for the hosted OAuth monitoring probe user-agent."
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [{
    ref         = "allow_oauth_probe_monitoring"
    description = "Allow hosted OAuth CI/probe traffic"
    expression  = "(http.host eq \"${var.mcp_hostname}\" and http.user_agent contains \"courtlistener-mcp-oauth-probe\")"
    action      = "skip"
    enabled     = true

    action_parameters = {
      phases   = ["http_request_sbfm", "http_ratelimit"]
      products = ["bic", "uaBlock", "securityLevel"]
    }

    logging = {
      enabled = true
    }
  }]
}

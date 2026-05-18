variable "cloudflare_api_token" {
  type        = string
  description = "API token with Zone.Zone Read and Zone.WAF Edit."
  sensitive   = true
}

variable "zone_name" {
  type        = string
  description = "Cloudflare zone that hosts the MCP custom domain."
  default     = "blakeoxford.com"
}

variable "mcp_hostname" {
  type        = string
  description = "Worker custom domain hostname for hosted OAuth probes."
  default     = "courtlistenermcp.blakeoxford.com"
}

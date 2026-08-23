# Cloudflare infrastructure ownership

Wrangler is authoritative for Worker source, bindings, routes, compatibility
flags, versions, and Durable Object lifecycle declarations. See the repository
ownership manifest at `infra/cloudflare/resource-ownership.json`.

The Terraform configuration is intentionally limited to account/zone-level rules
that are not part of the Worker deployment bundle. The current ruleset must be
imported into Terraform state before any apply. Do not run a broad
`terraform apply`, `terraform destroy`, or dashboard-to-Terraform conversion.

Required control sequence:

1. Export a redacted Cloudflare resource inventory.
2. Confirm the resource ID and current ruleset match the intended Terraform
   address.
3. Import the existing resource into a restricted remote state backend.
4. Run `terraform plan` and require a no-op or explicitly reviewed
   non-destructive plan.
5. Record the plan and ownership receipt before changing the resource.

Terraform must not acquire ownership of Workers, service bindings, routes,
Queues, KV namespaces, Durable Object namespaces/lifecycle, or Worker secrets.
Those remain Wrangler-owned or are queried read-only through the Cloudflare API.

-- MCP auth audit trail table for signup and key lifecycle events.

begin;

create table if not exists public.mcp_audit_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('anonymous', 'service', 'user')),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  api_key_id uuid references public.mcp_api_keys(id) on delete set null,
  action text not null check (
    action in (
      'signup.user_created',
      'signup.initial_key_created',
      'keys.created',
      'keys.revoked'
    )
  ),
  status text not null check (status in ('success', 'error')),
  request_ip text,
  metadata jsonb,
  constraint mcp_audit_logs_metadata_object
    check (metadata is null or jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_mcp_audit_logs_created_at
  on public.mcp_audit_logs (created_at desc);

create index if not exists idx_mcp_audit_logs_target_user
  on public.mcp_audit_logs (target_user_id, created_at desc);

create index if not exists idx_mcp_audit_logs_actor_user
  on public.mcp_audit_logs (actor_user_id, created_at desc);

create index if not exists idx_mcp_audit_logs_action
  on public.mcp_audit_logs (action, created_at desc);

alter table public.mcp_audit_logs enable row level security;

revoke all on table public.mcp_audit_logs from anon, authenticated;
revoke all on sequence public.mcp_audit_logs_id_seq from anon, authenticated;
grant select on table public.mcp_audit_logs to authenticated;

drop policy if exists mcp_audit_logs_read_own_or_admin on public.mcp_audit_logs;
create policy mcp_audit_logs_read_own_or_admin
on public.mcp_audit_logs
for select
to authenticated
using (
  actor_user_id = auth.uid()
  or target_user_id = auth.uid()
  or public.is_admin(auth.uid())
);

commit;

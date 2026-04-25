-- Supabase schema for MCP auth management.
-- Stores only identity + key metadata (no prompts, tool inputs, or response payloads).

begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roles (
  id bigserial primary key,
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id bigint not null references public.roles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  primary key (user_id, role_id)
);

create table if not exists public.mcp_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_hash text not null unique,
  label text,
  is_active boolean not null default true,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_api_keys_user_id on public.mcp_api_keys (user_id);
create index if not exists idx_mcp_api_keys_is_active on public.mcp_api_keys (is_active);

insert into public.roles (name, description)
values
  ('admin', 'Full MCP auth-management access'),
  ('member', 'Default authenticated user')
on conflict (name) do nothing;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.has_role(required_role text, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = target_user
      and r.name = required_role
  );
$$;

create or replace function public.is_admin(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin', target_user);
$$;

create or replace function public.bootstrap_first_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  admin_role_id bigint;
  admin_exists boolean;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.name = 'admin'
  ) into admin_exists;

  if admin_exists then
    return false;
  end if;

  select id into admin_role_id from public.roles where name = 'admin';
  if admin_role_id is null then
    raise exception 'Admin role is not configured';
  end if;

  insert into public.user_roles (user_id, role_id, assigned_by)
  values (current_user_id, admin_role_id, current_user_id)
  on conflict do nothing;

  return true;
end;
$$;

create or replace function public.assign_role(target_user uuid, role_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_role_id bigint;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can assign roles';
  end if;

  select id into resolved_role_id from public.roles where name = role_name;
  if resolved_role_id is null then
    raise exception 'Role % does not exist', role_name;
  end if;

  insert into public.user_roles (user_id, role_id, assigned_by)
  values (target_user, resolved_role_id, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.revoke_role(target_user uuid, role_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_role_id bigint;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can revoke roles';
  end if;

  select id into resolved_role_id from public.roles where name = role_name;
  if resolved_role_id is null then
    raise exception 'Role % does not exist', role_name;
  end if;

  delete from public.user_roles
  where user_id = target_user
    and role_id = resolved_role_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_role_id bigint;
begin
  insert into public.profiles (user_id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do nothing;

  select id into member_role_id from public.roles where name = 'member';
  if member_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    values (new.id, member_role_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_mcp_api_key(p_label text default null, p_expires_at timestamptz default null)
returns table(id uuid, token text, created_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_token text;
  token_hash text;
  new_id uuid;
  created_ts timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  raw_token := encode(gen_random_bytes(32), 'hex');
  token_hash := encode(digest(raw_token, 'sha256'), 'hex');

  insert into public.mcp_api_keys (user_id, key_hash, label, expires_at)
  values (auth.uid(), token_hash, p_label, p_expires_at)
  returning mcp_api_keys.id, mcp_api_keys.created_at, mcp_api_keys.expires_at
  into new_id, created_ts, expires_at;

  id := new_id;
  token := raw_token;
  created_at := created_ts;
  return next;
end;
$$;

create or replace function public.revoke_mcp_api_key(p_key_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mcp_api_keys
  set
    is_active = false,
    revoked_at = now()
  where id = p_key_id
    and (user_id = auth.uid() or public.is_admin(auth.uid()))
    and revoked_at is null
    and is_active = true;

  return found;
end;
$$;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.mcp_api_keys enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.roles from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;
revoke all on table public.mcp_api_keys from anon, authenticated;
revoke all on sequence public.roles_id_seq from anon, authenticated;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.roles, public.user_roles to authenticated;
grant select on public.mcp_api_keys to authenticated;
grant execute on function public.has_role(text, uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.bootstrap_first_admin() to authenticated;
grant execute on function public.assign_role(uuid, text) to authenticated;
grant execute on function public.revoke_role(uuid, text) to authenticated;
grant execute on function public.create_mcp_api_key(text, timestamptz) to authenticated;
grant execute on function public.revoke_mcp_api_key(uuid) to authenticated;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin
on public.profiles
for update
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()))
with check (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists roles_read_all_authenticated on public.roles;
create policy roles_read_all_authenticated
on public.roles
for select
to authenticated
using (true);

drop policy if exists user_roles_read_own_or_admin on public.user_roles;
create policy user_roles_read_own_or_admin
on public.user_roles
for select
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write
on public.user_roles
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists mcp_api_keys_read_own_or_admin on public.mcp_api_keys;
create policy mcp_api_keys_read_own_or_admin
on public.mcp_api_keys
for select
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists mcp_api_keys_admin_write on public.mcp_api_keys;
create policy mcp_api_keys_admin_write
on public.mcp_api_keys
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

insert into public.profiles (user_id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (user_id) do nothing;

insert into public.user_roles (user_id, role_id)
select u.id, r.id
from auth.users u
join public.roles r on r.name = 'member'
on conflict do nothing;

commit;

-- Usage notes:
-- 1) First user bootstrap:
--    select public.bootstrap_first_admin();
-- 2) Create API key:
--    select * from public.create_mcp_api_key('local-dev', now() + interval '90 days');
-- 3) Revoke API key:
--    select public.revoke_mcp_api_key('<key-id-uuid>');

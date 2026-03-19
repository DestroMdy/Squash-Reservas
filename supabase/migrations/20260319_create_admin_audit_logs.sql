create extension if not exists pgcrypto;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_audit_logs_actor_id_idx
  on public.admin_audit_logs (actor_id);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_action_idx
  on public.admin_audit_logs (action);

alter table public.admin_audit_logs enable row level security;

comment on table public.admin_audit_logs is
'Historial de acciones sensibles realizadas por administradores.';

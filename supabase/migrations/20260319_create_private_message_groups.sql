create extension if not exists pgcrypto;

create table if not exists public.private_message_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.private_message_group_members (
  group_id uuid not null references public.private_message_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (group_id, user_id)
);

create table if not exists public.private_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.private_message_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint private_group_messages_body_length check (char_length(trim(body)) between 1 and 1000)
);

create index if not exists private_message_group_members_user_idx
  on public.private_message_group_members (user_id);

create index if not exists private_group_messages_group_idx
  on public.private_group_messages (group_id, created_at desc);

create or replace function public.set_private_message_groups_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_private_message_groups_updated_at on public.private_message_groups;
create trigger set_private_message_groups_updated_at
before update on public.private_message_groups
for each row
execute function public.set_private_message_groups_updated_at();

create or replace function public.set_private_group_messages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_private_group_messages_updated_at on public.private_group_messages;
create trigger set_private_group_messages_updated_at
before update on public.private_group_messages
for each row
execute function public.set_private_group_messages_updated_at();

alter table public.private_message_groups enable row level security;
alter table public.private_message_group_members enable row level security;
alter table public.private_group_messages enable row level security;

comment on table public.private_message_groups is
'Grupos privados de mensajería entre jugadores.';

comment on table public.private_message_group_members is
'Integrantes de grupos privados y su último estado de lectura.';

comment on table public.private_group_messages is
'Mensajes enviados dentro de grupos privados.';

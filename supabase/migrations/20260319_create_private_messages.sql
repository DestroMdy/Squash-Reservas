create extension if not exists pgcrypto;

create table if not exists public.private_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint private_messages_body_length check (char_length(trim(body)) between 1 and 1000),
  constraint private_messages_no_self_send check (sender_id <> recipient_id)
);

create index if not exists private_messages_sender_id_idx
  on public.private_messages (sender_id);

create index if not exists private_messages_recipient_id_idx
  on public.private_messages (recipient_id);

create index if not exists private_messages_pair_created_at_idx
  on public.private_messages (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id),
    created_at desc
  );

create or replace function public.set_private_messages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_private_messages_updated_at on public.private_messages;

create trigger set_private_messages_updated_at
before update on public.private_messages
for each row
execute function public.set_private_messages_updated_at();

alter table public.private_messages enable row level security;

drop policy if exists "Users can read their own private messages" on public.private_messages;
create policy "Users can read their own private messages"
on public.private_messages
for select
to authenticated
using (
  auth.uid() = sender_id or auth.uid() = recipient_id
);

drop policy if exists "Users can send private messages" on public.private_messages;
create policy "Users can send private messages"
on public.private_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
);

comment on table public.private_messages is
'Mensajes privados entre jugadores. Solo emisor y receptor pueden leerlos.';

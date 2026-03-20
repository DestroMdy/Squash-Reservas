create extension if not exists pgcrypto;

create table if not exists public.match_availability_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  available_on date not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint match_availability_requests_user_day_unique unique (user_id, available_on)
);

create index if not exists match_availability_requests_available_on_idx
  on public.match_availability_requests (available_on desc);

create or replace function public.set_match_availability_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_match_availability_requests_updated_at on public.match_availability_requests;

create trigger set_match_availability_requests_updated_at
before update on public.match_availability_requests
for each row
execute function public.set_match_availability_requests_updated_at();

alter table public.match_availability_requests enable row level security;

drop policy if exists "Users can read match availability requests" on public.match_availability_requests;
create policy "Users can read match availability requests"
on public.match_availability_requests
for select
to authenticated
using (true);

drop policy if exists "Users can create own match availability requests" on public.match_availability_requests;
create policy "Users can create own match availability requests"
on public.match_availability_requests
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own match availability requests" on public.match_availability_requests;
create policy "Users can update own match availability requests"
on public.match_availability_requests
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own match availability requests" on public.match_availability_requests;
create policy "Users can delete own match availability requests"
on public.match_availability_requests
for delete
to authenticated
using (auth.uid() = user_id);

comment on table public.match_availability_requests is
'Avisos diarios de jugadores que están buscando partido casual.';

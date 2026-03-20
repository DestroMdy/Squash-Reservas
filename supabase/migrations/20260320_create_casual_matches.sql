create extension if not exists pgcrypto;

create table if not exists public.casual_matches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  player_one_id uuid not null references public.profiles(id) on delete cascade,
  player_two_id uuid not null references public.profiles(id) on delete cascade,
  played_on date not null,
  location text,
  score_player_one integer not null check (score_player_one >= 0),
  score_player_two integer not null check (score_player_two >= 0),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint casual_matches_no_self_match check (player_one_id <> player_two_id),
  constraint casual_matches_no_draw check (score_player_one <> score_player_two)
);

create index if not exists casual_matches_played_on_idx
  on public.casual_matches (played_on desc);

create index if not exists casual_matches_player_one_idx
  on public.casual_matches (player_one_id);

create index if not exists casual_matches_player_two_idx
  on public.casual_matches (player_two_id);

create or replace function public.set_casual_matches_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_casual_matches_updated_at on public.casual_matches;

create trigger set_casual_matches_updated_at
before update on public.casual_matches
for each row
execute function public.set_casual_matches_updated_at();

alter table public.casual_matches enable row level security;

drop policy if exists "Participants can read casual matches" on public.casual_matches;
create policy "Participants can read casual matches"
on public.casual_matches
for select
to authenticated
using (auth.uid() = player_one_id or auth.uid() = player_two_id or auth.uid() = created_by);

drop policy if exists "Participants can create casual matches" on public.casual_matches;
create policy "Participants can create casual matches"
on public.casual_matches
for insert
to authenticated
with check (
  auth.uid() = created_by and
  auth.uid() = player_one_id
);

drop policy if exists "Creators can update casual matches" on public.casual_matches;
create policy "Creators can update casual matches"
on public.casual_matches
for update
to authenticated
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

drop policy if exists "Creators can delete casual matches" on public.casual_matches;
create policy "Creators can delete casual matches"
on public.casual_matches
for delete
to authenticated
using (auth.uid() = created_by);

comment on table public.casual_matches is
'Partidos casuales entre jugadores con resultado e historial.';

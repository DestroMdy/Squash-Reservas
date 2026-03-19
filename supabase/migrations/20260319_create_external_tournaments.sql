create extension if not exists pgcrypto;

create table if not exists public.external_tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text not null check (platform in ('rankedin', 'tournamentsoftware', 'otro')),
  event_date date,
  location text,
  url text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists external_tournaments_event_date_idx
  on public.external_tournaments (event_date);

create index if not exists external_tournaments_active_idx
  on public.external_tournaments (is_active);

alter table public.external_tournaments enable row level security;

drop policy if exists "Public can read active external tournaments" on public.external_tournaments;
create policy "Public can read active external tournaments"
on public.external_tournaments
for select
to public
using (is_active = true);

comment on table public.external_tournaments is
'Torneos externos cargados manualmente desde admin con links a plataformas como Rankedin o Tournament Software.';

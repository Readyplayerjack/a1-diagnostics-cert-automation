-- Social / identity tables. `users` comes first because plays.user_id references it.
-- Note: public.users is the app's own table for Phase 2 magic-link accounts.
-- Guests never get a row here (or in auth.users); they are identified by device_id.

create table public.users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique check (position('@' in email) > 1),
  created_at  timestamptz not null default now()
);

create table public.streaks (
  subject_id    text primary key,
  subject_type  text not null check (subject_type in ('user', 'device')),
  current       int not null default 0 check (current >= 0),
  best          int not null default 0 check (best >= 0),
  last_date     date null,
  freezes       int not null default 0 check (freezes >= 0),
  constraint streaks_best_ge_current check (best >= current)
);

create table public.leagues (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (length(code) between 4 and 32),
  name        text not null check (length(btrim(name)) > 0),
  created_by  text not null,
  created_at  timestamptz not null default now()
);

create table public.league_members (
  league_id     uuid not null references public.leagues (id) on delete cascade,
  member_id     text not null,
  display_name  text not null check (length(btrim(display_name)) > 0),
  joined_at     timestamptz not null default now(),
  primary key (league_id, member_id)
);

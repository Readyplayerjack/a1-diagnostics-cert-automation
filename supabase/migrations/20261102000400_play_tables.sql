-- Play tables. Append-only for clients (via server routes); only service_role
-- updates them, e.g. Phase 2 midnight finalisation of final_points / total_final.

create table public.plays (
  id                 uuid primary key default gen_random_uuid(),
  device_id          text not null check (length(device_id) between 8 and 128),
  user_id            uuid null references public.users (id) on delete set null,
  date               date not null,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz null,
  -- 5 prompts x 100 points max.
  total_provisional  int null check (total_provisional between 0 and 500),
  total_final        int null check (total_final between 0 and 500),
  constraint plays_device_date_unique unique (device_id, date),
  constraint plays_finished_after_start check (finished_at is null or finished_at >= started_at)
);
create index plays_date_idx on public.plays (date);

create table public.play_answers (
  id                  uuid primary key default gen_random_uuid(),
  play_id             uuid not null references public.plays (id) on delete cascade,
  prompt_id           uuid not null references public.prompts (id),
  raw                 text not null,
  norm                text not null,
  answer_id           uuid null references public.canonical_answers (id),
  matched_by          text not null check (matched_by in
                        ('exact', 'alias', 'fuzzy', 'did_you_mean', 'embedding', 'judge', 'human', 'none')),
  provisional_points  int null check (provisional_points between 0 and 100),
  final_points        int null check (final_points between 0 and 100),
  valid               boolean not null,
  reason              text null,
  created_at          timestamptz not null default now(),
  constraint play_answers_play_prompt_unique unique (play_id, prompt_id),
  -- Hard rule 10: every rejected answer carries a plain-English reason.
  constraint play_answers_invalid_has_reason
    check (valid or (reason is not null and length(btrim(reason)) > 0))
);
create index play_answers_prompt_answer_idx on public.play_answers (prompt_id, answer_id);
create index play_answers_play_id_idx on public.play_answers (play_id);

-- Keyed by date so counts never bleed across days when a prompt is reused.
create table public.answer_counts (
  date        date not null,
  prompt_id   uuid not null references public.prompts (id) on delete cascade,
  answer_id   uuid not null references public.canonical_answers (id) on delete cascade,
  c           int not null default 0 check (c >= 0),
  updated_at  timestamptz not null default now(),
  primary key (date, prompt_id, answer_id)
);

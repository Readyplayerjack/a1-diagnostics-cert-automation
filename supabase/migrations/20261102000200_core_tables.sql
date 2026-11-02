-- Core content tables: prompts, canonical answers, aliases, judge cache, daily sets.
-- These hold answer data and must never be readable by clients (RLS + revokes in
-- the security migration).

create table public.prompts (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (length(btrim(text)) > 0),
  category    text not null check (length(btrim(category)) > 0),
  region      text not null default 'GB',
  status      text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  created_at  timestamptz not null default now()
);

create table public.canonical_answers (
  id            uuid primary key default gen_random_uuid(),
  prompt_id     uuid not null references public.prompts (id) on delete cascade,
  label         text not null check (length(btrim(label)) > 0),
  wikidata_qid  text null check (wikidata_qid ~ '^Q[0-9]+$'),
  prior_p       numeric not null check (prior_p > 0 and prior_p <= 1),
  status        text not null default 'active' check (status in ('active', 'merged', 'rejected')),
  merged_into   uuid null references public.canonical_answers (id),
  created_at    timestamptz not null default now(),
  -- A merged answer must say what it was merged into, and nothing else may.
  constraint canonical_answers_merge_consistent
    check ((status = 'merged') = (merged_into is not null)),
  constraint canonical_answers_not_self_merged check (merged_into is distinct from id)
);
create index canonical_answers_prompt_id_idx on public.canonical_answers (prompt_id);

create table public.aliases (
  id          uuid primary key default gen_random_uuid(),
  answer_id   uuid not null references public.canonical_answers (id) on delete cascade,
  -- Denormalised from canonical_answers for unique(prompt_id, alias_norm) and
  -- fast in-prompt lookups (DECISIONS.md).
  prompt_id   uuid not null references public.prompts (id) on delete cascade,
  alias_norm  text not null check (length(alias_norm) > 0),
  source      text not null check (source in ('seed', 'human', 'judge', 'fuzzy', 'embedding')),
  created_at  timestamptz not null default now(),
  constraint aliases_prompt_alias_unique unique (prompt_id, alias_norm)
);
create index aliases_alias_norm_trgm_idx on public.aliases using gin (alias_norm extensions.gin_trgm_ops);
create index aliases_answer_id_idx on public.aliases (answer_id);

create table public.judge_cache (
  id          uuid primary key default gen_random_uuid(),
  prompt_id   uuid not null references public.prompts (id) on delete cascade,
  norm_string text not null check (length(norm_string) > 0),
  verdict     text not null check (verdict in ('valid', 'invalid', 'needs_review')),
  answer_id   uuid null references public.canonical_answers (id) on delete set null,
  reason      text not null check (length(btrim(reason)) > 0),
  model       text not null,
  created_at  timestamptz not null default now(),
  constraint judge_cache_prompt_norm_unique unique (prompt_id, norm_string)
);
create index judge_cache_prompt_id_idx on public.judge_cache (prompt_id);

create table public.daily_sets (
  date          date primary key,
  -- Postgres cannot enforce FKs on array elements; the publisher validates ids.
  prompt_ids    uuid[] not null check (cardinality(prompt_ids) = 5),
  published_at  timestamptz null
);

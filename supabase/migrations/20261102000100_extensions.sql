-- Extensions. Installed into the `extensions` schema (Supabase convention) so
-- their functions are not exposed in `public`.
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
-- pgvector: embedding column itself is deferred to Phase 2 (see DECISIONS.md).
create extension if not exists vector with schema extensions;
-- pg_trgm: in-prompt fuzzy alias matching (PLAN item 6).
create extension if not exists pg_trgm with schema extensions;

# DECISIONS

Format: `## YYYY-MM-DD — Title` then **Decision / Reason / Alternatives considered**. Newest at the bottom.

## 2026-11-02 — aliases carries a denormalised prompt_id
**Decision:** `aliases.prompt_id` duplicates `canonical_answers.prompt_id`. **Reason:** Needed for `unique(prompt_id, alias_norm)` (an alias maps to one answer per prompt) and for fast in-prompt exact/trigram lookups without a join. **Alternatives considered:** Join through canonical_answers at lookup time (no way to express the uniqueness constraint; slower); a trigger-maintained column (more moving parts for no gain at this stage).

## 2026-11-02 — answer_counts is keyed by date
**Decision:** Primary key `(date, prompt_id, answer_id)`. N for scoring = that day's plays of that prompt. **Reason:** Counts must never bleed across days when a prompt is reused (unlimited mode, archive). **Alternatives considered:** Key by `(prompt_id, answer_id)` only (breaks on reuse); key by daily_set (couples counts to the daily set and excludes unlimited mode).

## 2026-11-02 — One daily play per device
**Decision:** `plays` has `unique(device_id, date)`. **Reason:** One daily play per device is the game; enforcing it in the database stops double plays from racing requests. **Alternatives considered:** Application-level check only (racy).

## 2026-11-02 — Embedding column deferred to Phase 2
**Decision:** pgvector is installed now, but no `vector(n)` column exists yet. **Reason:** The dimension depends on the embedding model, which is chosen in Phase 2 (PLAN item 17). **Alternatives considered:** Guess a dimension now (would need a rewrite migration if wrong).

## 2026-11-02 — Points-based band thresholds
**Decision:** Bands are `BAND_THRESHOLDS = [0, 20, 40, 60, 80]` (inclusive lower bounds, points) in config/game.ts, index-aligned with the labels in `brand.bands`. **Reason:** Labels are branding and numbers are game rules, so they live in different files; the values are deliberately unlike any competitor's tier values. A tuple (not a label-keyed object) keeps label text out of game.ts so a rename stays a one-file edit. **Alternatives considered:** An object keyed by label (duplicates labels outside brand.ts); keyed by internal ids (more indirection for five numbers).

## 2026-11-02 — Odds display = round(1/p_hat) as "X/1"
**Decision:** Display odds as `round(1 / p_hat)` + "/1", capped at 999/1. **Reason:** Odds are a metaphor for rarity, and "1 in 33" reading as "33/1" is immediately understood. True fractional odds for 1-in-33 would be 32/1, which we explicitly don't use. **Alternatives considered:** True fractional odds (pedantic and confusing); decimal odds (less pub/racing flavour).

## 2026-11-02 — pg_trgm enabled now
**Decision:** `pg_trgm` is installed with a GIN trigram index on `aliases.alias_norm`. **Reason:** In-prompt fuzzy matching (PLAN item 6) needs it, and the index belongs with the table definition. **Alternatives considered:** Add it in prompt 6 (a second migration for no benefit).

## 2026-11-02 — text + check constraints instead of Postgres enums
**Decision:** Every enum-like column is `text` with a `check (... in (...))`. **Reason:** Adding or removing values is a simple constraint swap inside a transaction; `ALTER TYPE ... ADD VALUE` has transaction restrictions and values can't be dropped. **Alternatives considered:** Native enums; lookup tables (overkill).

## 2026-11-02 — RLS forced and default privileges revoked
**Decision:** Every public table has RLS enabled **and forced**, with no anon/authenticated policies. All privileges are revoked from anon/authenticated on existing tables, sequences and functions, and via `alter default privileges` for future objects (EXECUTE on functions is also revoked from PUBLIC by default). service_role is granted explicitly, now and by default. `supabase/config.toml` sets `auto_expose_new_tables = false`. **Reason:** Defence in depth: a forgotten policy or grant on a future table still leaves it locked. Verified: a table created after the migrations had no anon/authenticated privileges, and `test:rls` flagged it for missing RLS. **Alternatives considered:** RLS without FORCE (owner bypasses silently); relying on RLS alone without revokes.

## 2026-11-02 — canonical_answers.merged_into
**Decision:** A self-referencing `merged_into` FK plus `status = 'merged'`, with a check that `merged_into` is set exactly when status is 'merged' and never to itself. **Reason:** Admin merges keep history and let past play_answers resolve to the surviving answer. **Alternatives considered:** Delete and re-point (loses history).

## 2026-11-02 — streaks keyed by subject_id + subject_type
**Decision:** `streaks(subject_id text primary key, subject_type in ('user','device'))`. **Reason:** Unambiguous: a streak belongs to either a guest device or an account, and the type says which. **Alternatives considered:** A single `user_or_device_id` column (ambiguous); two nullable FK columns (awkward PK and checks).

## 2026-11-02 — LONGSHOT built at repo root on its feature branch, replacing the previous project there
**Decision:** The repository held an unrelated project (A1 Diagnostics certificate automation). On branch `claude/longshot-foundations-scaffold-sj7t1l` those files were removed in a separate commit, and LONGSHOT was built at the repo root as specified. **Reason:** The spec requires a root layout (/app, /config, /supabase…) that clashes with the old project's package.json, tsconfig, src/, scripts/ and migrations/. The old project stays untouched on `main` and in git history. **Alternatives considered:** A `longshot/` subdirectory (breaks the root layout every future prompt assumes); moving the old project into `legacy/` (mixes two products in one tree). **Follow-up:** Merging this branch into `main` would delete the old project from main. Prefer moving LONGSHOT into its own repository.

## 2026-11-02 — Node 22 LTS, pinned by major
**Decision:** `.nvmrc` = `22`; `engines.node` = `22.x`. **Reason:** Node 22 is the installed active LTS, and Vercel supports it. **Alternatives considered:** Node 20 (closer to EOL); `>=22` (lets CI and production drift across majors).

## 2026-11-02 — Next.js 16 defaults kept; no web fonts
**Decision:** Kept create-next-app defaults (Turbopack with the `@tailwindcss/turbopack` loader, `cacheComponents`), dropped the Geist Google fonts, and use system font stacks. **Reason:** No third-party requests (hard rule 8 spirit), no build-time font download, fast first paint. **Alternatives considered:** next/font/google (self-hosted at build time, but needs network at build); bundling a font file (revisit at the UI phase).

## 2026-11-02 — Theme: brand.ts → CSS variables → Tailwind tokens
**Decision:** `lib/theme.ts#themeCss(brand.colors)` emits `--brand-*` variables for light mode and `prefers-color-scheme: dark`. The root layout injects them, and `app/globals.css` maps them to Tailwind colours (`bg-paper`, `text-racing-green`, …) without any literal colour values. Colour tokens are named by role (`paper` = page background, `ink` = body text), so dark mode just swaps their values. **Reason:** Single source of truth in brand.ts; no other file hard-codes a colour. **Alternatives considered:** Generating a CSS file at build time (an extra step); Tailwind dark: variants with duplicated tokens.

## 2026-11-02 — Declared contrast pairs
**Decision:** `brand.contrastPairs` lists every foreground/background pair actually used for text. The test checks each pair in both modes against 4.5:1. **Reason:** Testing every possible pair would fail on combinations nobody uses (e.g. brass on oxblood); declaring the pairs makes intent explicit. New text/background combinations must be added to the list. **Alternatives considered:** All-pairs matrix.

## 2026-11-02 — Extra integrity constraints beyond the spec
**Decision:** Added checks: non-blank prompt text/labels, `wikidata_qid ~ '^Q[0-9]+$'`, `play_answers` invalid ⇒ non-blank reason (hard rule 10), play totals 0–500, `finished_at >= started_at`, `device_id` length 8–128, `streaks.best >= current` (all non-negative), league code length 4–32, `answer_counts.c >= 0`, `judge_cache.reason` and `.model` NOT NULL. FK delete behaviour: content cascades from prompts; play history is never cascade-deleted by content changes (`play_answers.prompt_id` / `answer_id` use the default NO ACTION); `plays.user_id` is set null if a user is deleted. **Reason:** The database should reject states the game rules forbid. **Alternatives considered:** Leave validation to the app layer only.

## 2026-11-02 — Extensions live in the `extensions` schema
**Decision:** pgcrypto, vector and pg_trgm are created `with schema extensions`; the trigram index uses `extensions.gin_trgm_ops`. **Reason:** Supabase convention; it keeps extension functions out of `public`, so the public-schema revokes don't touch them. **Alternatives considered:** Install into public.

## 2026-11-02 — Env validation
**Decision:** `lib/server/env.ts` validates NEXT_PUBLIC_SUPABASE_URL (URL), SUPABASE_SERVICE_ROLE_KEY, PLAY_TOKEN_SECRET (≥ 32 chars) and ADMIN_PASSWORD. Empty strings count as missing, and every problem is reported at once ("Missing required environment variable: X"). NEXT_PUBLIC_SUPABASE_ANON_KEY is in .env.example but not required, because clients never touch tables. **Reason:** Fail fast with actionable messages. **Alternatives considered:** Requiring the anon key (unused by design).

## 2026-11-02 — RLS test design
**Decision:** `supabase/tests/rls.test.ts` (a) discovers tables from information_schema; (b) asserts RLS is enabled+forced on every table (pg_class), that no policies exist for anon/authenticated/public, and that anon/authenticated hold no table privileges; (c) under `set role anon|authenticated`, SELECT/INSERT/UPDATE/DELETE on every table must fail with 42501; (d) inserts one fixture row per table as service_role so "zero rows visible" is meaningful, and fails if a table has no fixture; (e) via supabase-js with the anon key, select/insert/update/delete must error or return zero rows, and row counts must be unchanged; the service-role key must read every table. `RLS_DB_ONLY=1` explicitly skips (e) for Postgres-only environments. Verified with a negative control: without the security migration, 5 tests fail and name every table. **Reason:** The spec's API-level check plus a DB-level check that doesn't depend on PostgREST. **Alternatives considered:** API-level only (an empty table makes "zero rows" vacuous).

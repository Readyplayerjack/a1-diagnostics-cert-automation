# CHANGELOG

## 2026-11-02 — PM message #2 answers + Prompt #4: daily sets and GET /api/daily (PLAN item 4)

**Shipped**
- Docs: CLAUDE.md hard rule 9 clarified and new hard rule 13 (wording, 13+, no prizes); "Game rules" and "Privacy" sections; new commands. PLAN item 4 marked done; item 12 gains a "re-run against REAL Supabase" checkbox.
- `config/game.ts`: LAUNCH_DATE, PRIOR_UNSEEN, did-you-mean limits, DAILY_REUSE_DAYS, DAILY_CHECK_DAYS, CATEGORY_KEYS, rate limits, retention, minimum age. `config/brand.ts`: "Evens", category labels, API error strings, `formatOdds`.
- `lib/time.ts`: gameDate, londonMidnight, endOfGameDay, nextRollover, secondsUntilRollover, gameNumber, plus date helpers.
- Content schema updated to the PM rules.
- `lib/daily-schedule.ts` and `scripts/daily-schedule.ts`, `daily-check.ts`, `daily-store.ts`, `db.ts`; commands `pnpm daily:schedule` and `pnpm daily:check`.
- `lib/daily-schema.ts`, `lib/server/daily.ts`, `app/api/daily/route.ts`, `app/api/daily/[date]/route.ts`.
- Tests: time (54), scheduler (11, fixture of 42 fake prompts), daily API (23), banned-word guard, PM expected-value scoring cases, content rule updates; DB leak test `supabase/tests/daily.test.ts`.

**Verified:** see the build-session report (lint, typecheck, unit tests, build; DB tests on Postgres 16; CLI end to end; route smoke test on `next start`).

**Not verified:** route handlers through supabase-js against a real Supabase Data API (layer 2 of the leak test); `supabase start`/`db reset`. Pushing: no LONGSHOT remote exists yet.

## 2026-11-02 — PLAN item 3 (part): content format, validator and seeder

**Shipped**
- `lib/content/schema.ts` (format and rules), `lib/content/ids.ts` (UUID v5, RFC test vector passes), `lib/content/seed-plan.ts` (pure files → rows).
- `scripts/seed-apply.ts`, `scripts/seed.ts` and `scripts/validate-content.ts`; new commands `pnpm content:validate`, `pnpm seed` and `pnpm test:db`.
- `content/README.md` (format) and `content/LICENCES.md` (credits). The `content/prompts/` folder is empty, waiting for real prompts.
- Tests: `tests/content.test.ts` (16, including an answer-leak guard proven to catch both `@/content` and relative `lib/content` imports from app/components) and `supabase/tests/seed.test.ts` (3 integration tests).

**Verified:** 202/202 unit tests; lint, typecheck and build pass. Against Postgres 16 with all migrations: `test:db` gives 12 passed, plus 2 PostgREST tests skipped on purpose. CLI end to end: validate → seed (approved only: 0 rows) → `--include-drafts` (20 aliases) → rerun (0 new).

**Not done:** the open-data drafting script and the 30 prompts. This needs the PM's content brief, and Wikidata, ONS and Wikipedia are all blocked by this session's network policy (connect_rejected).

## 2026-11-02 — PLAN item 2: Normalisation + scoring library

**Shipped**
- `lib/normalise.ts`: `normalise` and `singularise` (NFKC, diacritic folding, lowercase, & → and, apostrophes, punctuation, whitespace, one leading article, per-word simple plurals).
- `lib/scoring.ts`: `pHat`, `oddsX`, `formatOdds`, `points`, `bandFor`, `scoreValid`, `scoreInvalid`, implementing the CLAUDE.md formula with constants from `config/game.ts`.
- `config/brand.ts` share text now uses the shared `formatOdds`.
- Tests: `tests/normalise.test.ts` and `tests/scoring.test.ts` (134 new tests; 186 total). Coverage is 100% statements, branches, functions and lines for both modules. Mutation spot-checks also fail as they should: floor instead of round fails 2 scoring tests; dropping the -sses rule fails 1 normalise test.

**Verified:** lint, typecheck, test (186/186), build and format:check all pass.

**Still open from item 1:** local Supabase verification (Docker images blocked in the cloud session) and pushing to GitHub (no repo access yet; the plan is a new dedicated repo).

## 2026-11-02 — Prompt #1: Foundations (PLAN item 1)

**Shipped**
- Shared memory: CLAUDE.md, PLAN.md, DECISIONS.md, CHANGELOG.md.
- Scaffold: Next.js 16.4 (App Router, Turbopack), TypeScript strict (+ `noUncheckedIndexedAccess`, `noImplicitOverride`), Tailwind v4, ESLint, Prettier, Vitest, pnpm, Node 22 (`.nvmrc`, `engines`).
- Config: `config/brand.ts` (name, copy, bands, light/dark racing-slip palette, share/OG text) and `config/game.ts` (constants, band thresholds 0/20/40/60/80).
- Theme: brand colours → CSS variables (`lib/theme.ts`) → Tailwind tokens. Placeholder home page shows name, tagline and disclaimer from brand.ts.
- Server: `lib/server/env.ts` (zod-validated env with clear errors), `lib/server/db.ts` (service-role client, no session persistence). Both `import "server-only"`.
- `lib/time.ts` stub (re-exports TIMEZONE).
- Database: 5 migrations (extensions; core; social; play; security), `seed.sql` placeholder, `supabase/config.toml` (`auto_expose_new_tables = false`).
- Tests: share text/OG, WCAG contrast, branding guard, env validation, game config sanity, theme CSS, server-only marker (52 unit tests); RLS suite (`pnpm test:rls`).
- CI: `.github/workflows/ci.yml` runs install (frozen lockfile), lint, typecheck and test.
- The previous A1 Diagnostics project files were removed from this branch only. They remain on `main`; see DECISIONS.md.

**Verified in this session:** install, lint, typecheck, test, build, dev and start; home page and metadata render from brand.ts; a one-line rename in brand.ts changes the page and title (0 leftovers); the branding guard fails on a stray literal; a client import of `lib/server/db.ts` fails the build; migrations apply cleanly to Postgres 16 + pgvector; the DB layer of `test:rls` passes (9/9), with a negative control (no security migration → 5 failures) and a future-table check.

**Not verified (blocker):** `supabase start` / `supabase db reset` and the PostgREST/anon-key layer of `test:rls`. Docker ran, but this session's network policy blocks the image blob hosts (`d2glxqk2uabbnd.cloudfront.net` for public.ecr.aws, `pkg-containers.githubusercontent.com` for ghcr.io), and Docker Hub returned 429. Run these on a machine with Docker, then mark PLAN item 1 [done].

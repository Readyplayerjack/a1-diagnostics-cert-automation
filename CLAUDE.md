# CLAUDE.md — LONGSHOT (working title)

Read this file first, every session. Then read PLAN.md, DECISIONS.md and the latest CHANGELOG.md entry before writing code. Update all four before you finish.

## What this is
A daily, UK-first word game. Every player gets the same 5 prompts per day. One open-text answer per prompt, 25 seconds each. The rarer an answer among real players, the more points it scores. Rarity is shown as racing-style odds ("33/1"). Odds are a metaphor only: no stakes, no currency, no gambling mechanics.
Provisional score is instant; scores finalise at 00:00 Europe/London. Next day the player sees final odds, their rank and "answers nobody else gave".

## Hard rules (never break these)
1. Not a clone. Never use the name, art, copy, ocean/depth theme, tier names or tier values (10/15/30/60/85/100) of any competitor (notably Krillion). Never scrape or reuse anyone's answer data.
2. No answer leakage. Canonical answers, aliases, priors and judge verdicts never reach the client before submission: not in payloads, the JS bundle or static JSON. Server-only modules start with `import 'server-only'`.
3. Server-authoritative timing. Each prompt gets a signed token at start. Answers after 25s + 2s grace are rejected server-side. "Did you mean?" pauses are tracked server-side.
4. RLS on every table, with no anon/authenticated policies. Clients never touch tables. All reads/writes go through Next.js server routes using the service-role key.
5. Guests never create Supabase Auth users. Guest identity = random device_id in localStorage.
6. plays and play_answers are append-only for clients. Counts are aggregated server-side.
7. All branding lives in /config/brand.ts: name, strings, band labels, colours, share text, OG text. Renaming the game must only require editing that file.
8. No ads, no consent managers, no third-party trackers. Analytics are first-party, cookieless and aggregate.
9. Content comes from open data only: Wikidata (CC0), ONS baby names (OGL v3.0, credited), Wikipedia text only with CC BY-SA attribution. Reject prompts with one obvious correct answer.
10. Every rejected answer carries a plain-English reason. Unseen answers are judged, never silently scored 0.
11. The LLM provider sits behind /lib/llm.ts. Cache every verdict, and only call it for first-seen normalised strings.
12. Finish Phase 1 fully before Phase 2. Don't build ahead of PLAN.md.

## Stack
Next.js (App Router), TypeScript strict, Tailwind CSS, Vercel Pro · Supabase Postgres + pgvector + pg_trgm, Supabase CLI for local dev · pnpm · Vitest (unit/integration) · Playwright (e2e, from the UI phase) · Cloudflare Turnstile (later Phase 1 prompt)

## Repo layout
/app — Next.js routes (UI + /api)
/components — UI components
/config/brand.ts — ALL branding, strings and colours (client-safe)
/config/game.ts — game constants: alpha, timer, grace, band thresholds, caps (client-safe, no answer data)
/lib — shared pure logic (scoring, normalise, time)
/lib/server — server-only code (db client, tokens, matching with data, llm)
/supabase/migrations — timestamped SQL migrations
/supabase/tests — RLS tests
/content — reviewed prompt JSON + licences/attribution
/scripts — content drafting, seeding, load tests
/tests — Vitest + Playwright

## Scoring (implement exactly; constants live in /config/game.ts)
c_a = players who gave answer a; N = plays of that prompt that day; pi_a = prior; alpha = 50
p_hat  = (c_a + alpha * pi_a) / (N + alpha)
odds   = 1 / p_hat → display "X/1", capped at 999/1
points = clamp(round(10 * log2(1 / p_hat)), 0, 100)
Invalid answer = 0 points + reason.
Bands (labels in brand.ts, point thresholds in game.ts): Favourite, Fancied, Outsider, Longshot, Rank Outsider.

## Matching pipeline
1. Normalise: NFKC, lowercase, strip punctuation and leading articles, collapse whitespace, simple plurals
2. Exact alias lookup within the prompt
3. Fuzzy match within the prompt (pg_trgm); a near miss triggers "did you mean?" with the timer paused server-side
4. Embedding nearest-neighbour (Phase 2): cosine > 0.90 auto-merges; 0.75–0.90 goes to the LLM judge; below that, the judge decides or rejects
5. LLM judge (Phase 1 = stub): strict JSON {valid, canonical_label, reason}, cached and queued for human review

## Time
All "game day" logic uses Europe/London via a single helper in /lib/time.ts. Never use server-local time or naive UTC midnight. BST/GMT transitions must be tested.

## Commands
Verified 2026-11-02 (Node 22, pnpm 10). Items marked * need Docker + Supabase images and could not be run in the session that wrote them; see CHANGELOG.md.
- `pnpm install` — install dependencies (CI: `pnpm install --frozen-lockfile`)
- `pnpm dev` — dev server on http://localhost:3000
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm lint` — ESLint
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — Vitest unit tests (excludes RLS tests)
- `pnpm format` / `pnpm format:check` — Prettier (Markdown is excluded so these docs stay verbatim)
- `pnpm db:start` * — `supabase start` (local stack in Docker)
- `pnpm db:reset` * — `supabase db reset` (re-applies migrations + seed.sql)
- `pnpm test:rls` — RLS/privilege tests against a running database (reads `supabase status`). DB layer verified on Postgres 16 + pgvector; the PostgREST/anon-key layer * needs `pnpm db:start`. Postgres without the Supabase API: `SUPABASE_DB_URL=postgres://... RLS_DB_ONLY=1 pnpm test:rls`

## Conventions
- Small, pure, tested functions in /lib; route handlers stay thin.
- Validate every request body with zod.
- No `any`. Named exports, except where Next.js requires a default.
- Every user-facing string comes from brand.ts.
- Accessibility: keyboard play, prefers-reduced-motion, WCAG AA contrast.
- Log every non-obvious choice in DECISIONS.md (date, decision, reason, alternatives).
- Add a CHANGELOG.md entry per prompt/session.
- Never commit secrets. .env*.local stays gitignored.

## End-of-task report (always)
What shipped · what was tested (with real results) · what's left · exact commands to run · blockers/questions.

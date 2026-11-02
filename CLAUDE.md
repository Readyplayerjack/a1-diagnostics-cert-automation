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
9. Answer lists come from open data (Wikidata CC0; ONS OGL v3.0, credited; Wikipedia text only with CC BY-SA attribution, and only when a prompt needs it) OR are original writing by us (human-written, or LLM-drafted then human-reviewed; licence "original"). Never copy from copyrighted lists, other games or scraped data. Reject prompts with one obvious correct answer. No alcohol brands and no gambling/betting brands (pubs as places/names are fine).
10. Every rejected answer carries a plain-English reason. Unseen answers are judged, never silently scored 0.
11. The LLM provider sits behind /lib/llm.ts. Cache every verdict, and only call it for first-seen normalised strings.
12. Finish Phase 1 fully before Phase 2. Don't build ahead of PLAN.md.
13. Not gambling, ever. Banned in UI copy: bet, wager, stake, punt, bookie, bookmaker, win money, payout, cash, jackpot, odds-on, tips (enforced by tests/branding-guard.test.ts over /app, /components and brand.ts strings; the only exemption is the mandatory disclaimer's negation "No stakes"). Prefer: back an answer, long shot, the field, form, outsider, favourite. Minimum age 13+. The "just for fun" disclaimer stays visible on play and result screens. No prizes of any kind, ever; no paid feature may ever affect scores.

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

## Game rules (PM-confirmed 2026-11-02; constants in /config/game.ts)
- c and N include the player's own answer (provisional and final use the same rule; the first player sees c=1, N=1).
- N counts VALID answers only. Blank and invalid answers score 0 with a reason and are excluded from N.
- Out of time: 0 points, reason "Out of time — no answer given.", auto-advance.
- "Did you mean?": at most 1 per question; server-side pause ≤ 10 s; the player can only accept or decline (no retyping); declining sends the original answer to the judge.
- A play belongs to the London date it started on; its per-question tokens stay valid until they expire, even after midnight.
- Game number: LAUNCH_DATE (game.ts, placeholder) is #1.
- A brand-new answer accepted mid-day gets prior PRIOR_UNSEEN = 0.002.
- Odds that round to 1 display as brand.strings.evens ("Evens").
- Daily total = sum of 5 answers, 0–500, shown as "340 pts".
- Players see only their OWN unique answers plus top answers from the curated canonical list; no other player's text is ever published.
- Rate limits (constants now, implementation items 5/11): 30 req/min per device_id and 120 req/min per IP on play endpoints; >15 new device_ids per IP in 24 h → Turnstile on next play start; /api/daily is CDN-cached with no app-level limit; over limit → 429 with a brand string.

## Privacy
- device_id is personal data (UK GDPR). Raw answer text is kept RAW_ANSWER_RETENTION_DAYS (90) days, then only the normalised form/answer_id.
- Minimum age 13+. Privacy notice: PM drafts before launch, owner gets it checked (ICO data protection fee likely applies).

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
- `pnpm content:validate` — validate every /content/prompts/*.json (exit 1 on problems)
- `pnpm seed` — seed approved prompts (`--include-drafts`, `--dry-run`); DB from SUPABASE_DB_URL or `supabase status`
- `pnpm daily:schedule --from YYYY-MM-DD --days N [--seed S] [--reuse-days 60] [--dry-run]` — fill missing daily sets (never alters existing dates, never past dates)
- `pnpm daily:check` — exit 1 if any of the next 7 London days lacks a published set
- `pnpm test:db` — all database tests (RLS + seeder + daily endpoints leak test); same DB requirements as test:rls
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

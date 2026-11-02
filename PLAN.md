# PLAN
## Phase 1 — MVP (finish fully before Phase 2)
1.  [in progress] Foundations: scaffold, shared-memory files, brand/game config, schema, RLS — all done except verification on real local Supabase (`supabase start` / `db reset` / PostgREST layer of `test:rls`), blocked by container-registry access in the build session. Mark [done] once those pass on a Docker machine.
2.  [done] Normalisation + scoring library (pure TS, exhaustively unit-tested)
3.  [in progress] Content: open-data drafting script, 30 reviewed UK prompts, seeder — file format, validator (PM rules: ≥25 answers, ≤80 chars, ≥3 priors < 0.01, priors ≤ 0.9) and seeder done; drafting script + 30 prompts await PM Prompt #3, owner example prompts and network access to Wikidata/ONS
4.  [done] Daily set publishing + GET /api/daily (static JSON from CDN, London rollover, BST/GMT tests) — Supabase Data API path of the routes awaits real Supabase (see item 12)
5.  Play API: start/answer/finish, signed per-prompt tokens, timing, rate limits
6.  Matching steps 1–3 + judge stub + 100-case UK test set (≥90% target)
7.  60-second count aggregation + provisional scoring end-to-end
8.  Play UI: mobile one-hand, big timer, odds animation, accessibility
9.  Result screen + spoiler-free share card (text + OG image, link/link-free flag)
10. Admin review (/admin/review): approve, merge, reject, bulk alias add
11. Turnstile on suspicious bursts + first-party cookieless analytics
12. Hardening: load tests (p95 < 800ms; 100 req/s on /api/daily), bundle leak scan, RLS check, full acceptance sweep
    - [ ] Re-run `pnpm test:db` (RLS + seeder + daily leak test, including the PostgREST/route-handler layers) against a REAL Supabase project (cloud dev project or the owner's Mac with Docker) before launch. So far these ran on plain Postgres 16 + pgvector with emulated Supabase roles.
## Phase 2
13. Midnight finalisation (Europe/London) · 14. Next-day results · 15. Magic-link accounts + streaks · 16. Private leagues · 17. Embeddings + real LLM judge · 18. Archive
## Phase 3
Unlimited mode · one-time supporter purchase (Stripe) · pub/team mode · Discord Activity

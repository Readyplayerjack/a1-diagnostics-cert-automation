# PLAN
## Phase 1 — MVP (finish fully before Phase 2)
1.  [in progress] Foundations: scaffold, shared-memory files, brand/game config, schema, RLS — all done except verification on real local Supabase (`supabase start` / `db reset` / PostgREST layer of `test:rls`), blocked by container-registry access in the build session. Mark [done] once those pass on a Docker machine.
2.  Normalisation + scoring library (pure TS, exhaustively unit-tested)
3.  Content: open-data drafting script, 30 reviewed UK prompts, seeder
4.  Daily set publishing + GET /api/daily (static JSON from CDN, London rollover, BST/GMT tests)
5.  Play API: start/answer/finish, signed per-prompt tokens, timing, rate limits
6.  Matching steps 1–3 + judge stub + 100-case UK test set (≥90% target)
7.  60-second count aggregation + provisional scoring end-to-end
8.  Play UI: mobile one-hand, big timer, odds animation, accessibility
9.  Result screen + spoiler-free share card (text + OG image, link/link-free flag)
10. Admin review (/admin/review): approve, merge, reject, bulk alias add
11. Turnstile on suspicious bursts + first-party cookieless analytics
12. Hardening: load tests (p95 < 800ms; 100 req/s on /api/daily), bundle leak scan, RLS check, full acceptance sweep
## Phase 2
13. Midnight finalisation (Europe/London) · 14. Next-day results · 15. Magic-link accounts + streaks · 16. Private leagues · 17. Embeddings + real LLM judge · 18. Archive
## Phase 3
Unlimited mode · one-time supporter purchase (Stripe) · pub/team mode · Discord Activity

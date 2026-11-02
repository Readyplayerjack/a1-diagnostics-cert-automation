# LONGSHOT (working title)

A daily, UK-first word game. Everyone gets the same five prompts each day and has 25 seconds to answer each one. The rarer your answer among real players, the more points it scores, shown as racing-style odds ("33/1"). The odds are just for fun: no stakes, no money, ever.

Branding lives in [`config/brand.ts`](config/brand.ts). Project rules and context are in [`CLAUDE.md`](CLAUDE.md), the roadmap in [`PLAN.md`](PLAN.md), and design choices in [`DECISIONS.md`](DECISIONS.md).

## Prerequisites

- Node.js 22 (`nvm use` reads `.nvmrc`)
- pnpm 10 (`corepack enable`)
- Docker (running), for the local Supabase stack

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm db:start                  # starts local Supabase in Docker; prints URL + keys
pnpm exec supabase status      # copy API URL / service_role key into .env.local
pnpm db:reset                  # applies supabase/migrations + seed.sql
pnpm dev                       # http://localhost:3000
```

Generate `PLAY_TOKEN_SECRET` (32 random bytes):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit tests (Vitest), excluding RLS tests |
| `pnpm test:rls` | RLS/privilege tests (needs `pnpm db:start`) |
| `pnpm db:start` | `supabase start` |
| `pnpm db:reset` | `supabase db reset` |
| `pnpm format` | Prettier |

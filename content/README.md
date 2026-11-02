# Content

One JSON file per prompt in `content/prompts/<slug>.json`, validated by `lib/content/schema.ts`.

- `pnpm content:validate` checks every file (CI-friendly; exit 1 on problems).
- `pnpm seed` loads **approved** prompts into the database (`--include-drafts` for local dev, `--dry-run` to preview). Idempotent; never deletes; preserves admin merges.

**Hard rules:** answers from open data (Wikidata CC0, ONS OGL v3.0 credited, Wikipedia text only with CC BY-SA attribution) or original writing by us (licence `original`); never copied from copyrighted lists, other games or scraped data; reject prompts with one obvious answer; no alcohol or gambling brands; this folder must never be imported by `/app` or `/components` (enforced by `tests/content.test.ts`).

## File format (rules confirmed by the PM, message #2)

```json
{
  "slug": "uk-crisp-flavours",
  "text": "Name a crisp flavour sold in the UK",
  "category": "food_drink",
  "region": "GB",
  "status": "draft",
  "review": { "reviewer": "name", "date": "YYYY-MM-DD", "notes": "optional" },
  "sources": [
    { "name": "Wikidata", "url": "https://www.wikidata.org/wiki/Q...", "licence": "CC0-1.0", "retrieved": "YYYY-MM-DD" }
  ],
  "answers": [
    { "label": "Salt & Vinegar", "wikidata_qid": "Q...", "prior": 0.12, "prior_source": "wikidata_sitelinks", "aliases": ["salt and vinegar", "s&v"] }
  ]
}
```

Rules: category is one of `config/game.ts` CATEGORY_KEYS; prompt text ≤ 80 characters; ≥ 25 answers; no prior above 0.35; at least 3 priors below 0.01 (a real long shot); priors sum ≤ 0.9 (0.1 reserved for unexpected answers); `prior_source` per answer (`wikidata_sitelinks` | `ons_count` | `manual`); open-data sources need a `url` (`original` sources don't); no alias may normalise to another answer's alias; `approved` requires `review`; CC BY-SA sources require `attribution`. Licence and attribution credits are collected in `content/LICENCES.md`.

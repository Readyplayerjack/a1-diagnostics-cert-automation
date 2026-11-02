# Content

One JSON file per prompt in `content/prompts/<slug>.json`, validated by `lib/content/schema.ts`.

- `pnpm content:validate` checks every file (CI-friendly; exit 1 on problems).
- `pnpm seed` loads **approved** prompts into the database (`--include-drafts` for local dev, `--dry-run` to preview). Idempotent; never deletes; preserves admin merges.

**Hard rules:** open data only (Wikidata CC0, ONS OGL v3.0 credited, Wikipedia text only with CC BY-SA attribution); reject prompts with one obvious answer; this folder must never be imported by `/app` or `/components` (enforced by `tests/content.test.ts`).

## File format (provisional — awaiting PM content brief)

```json
{
  "slug": "uk-crisp-flavours",
  "text": "Name a crisp flavour sold in the UK",
  "category": "food",
  "region": "GB",
  "status": "draft",
  "review": { "reviewer": "name", "date": "YYYY-MM-DD", "notes": "optional" },
  "sources": [
    { "name": "Wikidata", "url": "https://www.wikidata.org/wiki/Q...", "licence": "CC0-1.0", "retrieved": "YYYY-MM-DD" }
  ],
  "answers": [
    { "label": "Salt & Vinegar", "wikidata_qid": "Q...", "prior": 0.12, "aliases": ["salt and vinegar", "s&v"] }
  ]
}
```

Rules: ≥ 20 answers; no prior above 0.35; priors sum ≤ 1; no alias may normalise to another answer's alias; `approved` requires `review`; CC BY-SA sources require `attribution`. Licence and attribution credits are collected in `content/LICENCES.md`.

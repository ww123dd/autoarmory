# Session Shadow

Session Shadow is a read-only first pass over selected session rollouts. The only manual input is selecting the source sessions.

```bash
node scripts/session-shadow.js --mode rules \
  --session <current-session.jsonl> \
  --out <output-dir>

node scripts/session-shadow.js --mode articles \
  --session <analysis-articles.jsonl> \
  --out <output-dir>
```

`rules` projects `collaboration-rules.md`, `automation-requirements.md` and `hook-requirements.md`. `articles` projects `article-decisions.jsonl`, `case-drafts.jsonl`, `verifier-bindings.jsonl` and `unverifiable.jsonl`.

The extraction is deterministic: URL normalization removes fragments and tracking parameters, duplicate URLs are counted but produce one decision row, and no LLM judge is called. A draft without a matched verifier is reported as `verifier_missing`; it is never closed. A draft with no baseline/observed evidence is `baseline_missing`; a non-actionable decision is `not_a_case`.

The 2026-09-17 real run selected the current main session plus `01a079b4-0de0-7372-a83c-d4d33e1accd4` and explicitly excluded the earlier copy `01a06a68-89ef-7762-bb42-4c3e63e9041a`. The sanitized metrics are in `docs/evidence/session-shadow-20260917.json`.
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

The extraction is deterministic: URL normalization removes fragments and tracking parameters, duplicate URLs are counted but produce one decision row, and no LLM judge is called. A draft without a matched verifier is reported as `verifier_missing`; it is never closed. A text category alone is not enough: the verifier id/kind must be explicit in the draft and the pinned assertion must express `expected_transition`. A mismatch is reported as `verifier_mismatch`; a draft with no baseline/observed evidence is `baseline_missing`; a non-actionable decision is `not_a_case`.

Supported transition checks include `COUNT->0`, `COUNT->N`, `COUNT->>=N`, `COUNT-><=N` and `FAIL->PASS`. The 2026-09-18 resolver rerun turned 18 old `verified_candidate` rows into 0 verified and 18 `verifier_mismatch`; the sanitized evidence is `docs/evidence/session-shadow-resolver-20260918.json`.

The 2026-09-17 real run selected the current main session plus `01a079b4-0de0-7372-a83c-d4d33e1accd4` and explicitly excluded the earlier copy `01a06a68-89ef-7762-bb42-4c3e63e9041a`. The sanitized metrics are in `docs/evidence/session-shadow-20260917.json`.

## Claude JSONL

Claude project JSONL is normalized from 	ype: user|assistant and message.content[]. A single row is split into one event per 	ext, 	ool_use or 	ool_result block; 	ool_use.id is linked to 	ool_result.tool_use_id. The reader counts raw tool blocks before normalization and fails closed with exit 2 when aw > 0 but normalized is zero (SESSION_SHADOW_EMPTY) or counts differ (SESSION_SHADOW_PARTIAL). The real 1ac86d26 session produced raw=699/699 and normalized=699/699.

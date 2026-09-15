# Evidence storage

The storage layer consumes normalized evidence, not raw runner output.

```text
runner artifact
  -> skillcanary import / evidence normalize
  -> evidence envelope JSONL
  -> skillcanary store index
  -> eval-runs.jsonl + eval-case-scores.jsonl
  -> skillcanary store query / export-sql
```

## Evidence envelope

```json
{
  "schema_version": "skillcanary/evidence/v1",
  "run_id": "run-001",
  "skill": "example-skill",
  "skill_hash": "...",
  "engine": "codex",
  "model": "...",
  "kind": "case",
  "case_id": "c01",
  "before": { "pass": 0, "total": 3 },
  "after": { "pass": 3, "total": 3 },
  "verification": {
    "verified_by": "independent-oracle",
    "oracle": "runner",
    "result": "pass"
  },
  "artifacts": [],
  "observed_at": "..."
}
```

## Commands

```bash
skillcanary evidence normalize raw-result.json --output evidence.json
skillcanary evidence record evidence.json --log .skillcanary/evidence.jsonl
skillcanary evidence stats --log .skillcanary/evidence.jsonl

skillcanary store index --input .skillcanary/evidence.jsonl --dir .skillcanary/store
skillcanary store query --dir .skillcanary/store --verdict FAIL->PASS --json
skillcanary store export-sql --dir .skillcanary/store --output .skillcanary/store/store.sql
```

`store index` materializes two table-shaped JSONL files:

- `schemas/eval-run.schema.json`
- `schemas/eval-case-score.schema.json`

`store export-sql` emits generic `CREATE TABLE` and `INSERT` statements for SQLite, MySQL or PostgreSQL-compatible stores. SkillCanary does not ship a hosted database or dashboard.

Do not build a dashboard until these tables are actually queried by real users.

## Shipped vs not shipped

| Status | Capability |
|---|---|
| Shipped | envelope normalization, JSONL append, table materialization, query filters, SQL export |
| Not shipped | hosted store, cross-repository aggregation, signed records, retention policy |

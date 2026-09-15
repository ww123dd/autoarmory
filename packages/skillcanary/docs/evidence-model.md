# Evidence model

SkillCanary keeps the "no target, no change" rule, but broadens what a target can be.

```json
{
  "target": {
    "kind": "case",
    "id": "c12"
  },
  "expected_transition": "FAIL->PASS",
  "evidence": {
    "kind": "case",
    "before": { "pass": 0, "total": 3 },
    "after": { "pass": 3, "total": 3 }
  }
}
```

or:

```json
{
  "target": {
    "kind": "deterministic",
    "id": "dead-pointer-check",
    "check": "selfcheck"
  },
  "expected_transition": "COUNT->0",
  "evidence": {
    "kind": "deterministic",
    "check": "selfcheck",
    "count_before": 2,
    "count_after": 0,
    "evidence": "selfcheck: dead pointers 2 -> 0"
  }
}
```

## Rules

- `target` is always required.
- `case` targets require a stable, non-held-out case and `FAIL->PASS`.
- `deterministic` targets require `COUNT->0` and an actual check output.
- Legacy `target_case` remains accepted for case targets during migration.
- A deterministic target does not require `cases.json`.
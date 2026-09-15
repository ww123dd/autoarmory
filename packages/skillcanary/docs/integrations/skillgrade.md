# skillgrade integration

`skillgrade` runs agents against skills and grades outcomes. SkillCanary does not replace it.

## Flow

1. Run the before baseline with `skillgrade`.
2. Change the skill.
3. Run the after evaluation with `skillgrade`.
4. Import the artifact.
5. Run `skillcanary gate` and `skillcanary report`.

```bash
skillcanary import auto result.json --case c01 --skill my-skill --output .skillcanary/change.json
```

## Supported shapes

```json
{ "before": { "pass": 0, "total": 3 }, "after": { "pass": 3, "total": 3 } }
```

Also accepted:

- `summary.before` / `summary.after`;
- `passed/total` aliases;
- `{ "trials": [{ "pass": true }, ...] }`.

The gate rejects a baseline that already passes, an after result that is not a stable PASS, and any repeat count below the budget.

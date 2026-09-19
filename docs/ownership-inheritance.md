# Ownership Inheritance and Batch Confirmation

Candidates no longer rely on per-item open questioning for ownership.

## Inheritance

`inferOwner(candidate)` derives a visible proposal from, in order:

- explicit `owner_scope`;
- `skill_id` / `owner` / `change.skill` / `target.skill`;
- a `skills/<name>/SKILL.md` path in evidence or source.

The result is explicitly labelled:

```text
explicit | inherited | cross_domain | unknown
```

An inherited value is a proposal, not authorization.

## Batch confirmation

`proposeBatch(candidates)` produces one question:

```text
这批 N 条默认归 X，除 M 条跨域——对吗？
```

`confirmBatch()` accepts the batch and explicit exception overrides, then writes:

```json
{
  "owner_scope": "...",
  "owner_confirmation": {
    "status": "approved",
    "batch_id": "..."
  }
}
```

## Admission boundary

`admit()` now requires confirmed ownership in addition to gate proof.
Unconfirmed, unknown, or cross-domain candidates remain in `holding` with a
machine-readable `reason_code`.

The CLI is:

```bash
node scripts/ownership-batch.js --candidates candidates.jsonl --json
node scripts/ownership-batch.js --candidates candidates.jsonl --confirm \
  --approved-by user --owners '{"cand-x":"数仓开发"}' --out confirmed.jsonl --json
```

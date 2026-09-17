# Change Inspector

The first standing version does not create cases. It produces a **Change Inventory**.

```bash
node scripts/change-inspect.js \
  --session <rollout.jsonl> \
  --session <rollout.jsonl> \
  --state <state-dir> \
  --once
```

It scans only new bytes on each run. Re-running with the same state is idempotent. With no source sessions it returns an empty inventory instead of fabricating one.

Signals:

- `file_changed`
- `command_called`
- `check_seen`
- `check_gap`
- `command_result_passed` / `command_result_failed` only when the transcript contains a structured exit code
- `result_text_unstructured` when output text exists but no structured result does
- `repeat_signature`
- `risk_signal`
- `exec_record_gap` when a check command was not wrapped by `exec-record`

`check_gap` means no later observed check in the local window. It does not mean `unverified`.

High-signal candidates are written to `candidate-cases.jsonl` and `notifications.jsonl`. Low-signal changes are recorded but suppressed. No item is closed by the inspector; `close_without_verifier_count` stays zero and `false_close_count` is a lagging indicator requiring a future counterexample.
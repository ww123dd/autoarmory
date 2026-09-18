# Stop Shadow

Stop Shadow is the automatic first pass that runs when a Codex session stops. It has no user trigger: the Stop hook reads the session identity from stdin, finds the session rollout, scans only new bytes, and writes drafts.

```text
Stop
  -> resolve transcript_path or find <session_id>.jsonl
  -> incremental Change Inspector
  -> case-drafts.jsonl
  -> session-case-drafts.jsonl
  -> session-unverifiable.jsonl
  -> high-signal.json
  -> pending/<change_id>.json
  -> stop-shadow-summary.json
```

Stop never runs a verifier. A detached `history-runner --drain` consumes pending jobs after Stop, resolves the registered verifier, runs it, and writes `reuse-records/<change_id>.json`.

The `session-*` files are the fixed session-shadow resolver output over the bytes newly scanned on this Stop. They are candidate drafts, not a verifier binding, run, close or verdict.

`change-records.jsonl` is the canonical append-only ledger; `candidate-cases.jsonl` is legacy. Change Inspector writes `new-drafts.jsonl` for the current increment. Stop Shadow rebuilds `case-drafts.jsonl` only when that increment contains candidates or the projection policy version changed; a no-new Stop only updates `last-stop.json`. `case-drafts.jsonl` is a derived projection, not an append-only ledger. The current event may fill a missing `session_id` / `turn_id`, but it must never overwrite provenance that already exists. A polluted bare-UUID row is marked `provenance_status=attribution_lost`, not guessed back to a session. `latest_cwd` is diagnostic-only and is never accepted as a canonical session. Projection dedupe uses `change_id`, falling back to `session_id|id` only for legacy rows.

It only records observations:

- changed files
- commands called
- checks seen / `check_gap`
- structured result status when present
- unstructured result text when no structured result exists
- high-signal candidates

It does **not** create a final case, bind a verifier, record a run, close a case, or produce a verdict. The stop-facing files are stripped of `verifier_resolution` and `verifier_ref`; a draft is marked `verification_state=unresolved`.

The scan is incremental and idempotent through the Change Inspector state file. Session lookup tries exact filename, session-id tail, then the newest rollout with matching `cwd`; a missing session, scan failure or timeout appends a `shadow_gap` and exits successfully. The host Stop hook writes the event to a temp file, spawns this scanner detached and returns immediately; the scanner deletes the event file after reading it. Every non-recursive Stop writes append-only `last-run.jsonl` and the latest `last-run.json`, with match mode, search root, elapsed time, candidate count and draft counts. Set `STOP_SHADOW_OFF=1` to disable this hook only; `AUTOARMORY_STOP_SHADOW_SCRIPT` can point the host hook at this script.

The host wiring is intentionally outside the repository: the local `~/.codex/hooks/stopGuard-codex.js` runs this script after its existing guard logic. The repository test suite exercises the script with a synthetic session and asserts no verifier/run/close/verdict artifacts.

Sanitized acceptance evidence: `docs/evidence/stop-shadow-20260918.json`.

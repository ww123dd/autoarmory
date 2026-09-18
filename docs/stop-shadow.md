# Stop Shadow

Stop Shadow is the automatic first pass that runs when a Codex session stops. It has no user trigger: the Stop hook reads the session identity from stdin, finds the session rollout, scans only new bytes, and writes drafts.

```text
Stop
  -> resolve transcript_path or find <session_id>.jsonl
  -> incremental Change Inspector
  -> case-drafts.jsonl
  -> high-signal.json
  -> stop-shadow-summary.json
```

It only records observations:

- changed files
- commands called
- checks seen / `check_gap`
- structured result status when present
- unstructured result text when no structured result exists
- high-signal candidates

It does **not** create a final case, bind a verifier, record a run, close a case, or produce a verdict. The stop-facing files are stripped of `verifier_resolution` and `verifier_ref`; a draft is marked `verification_state=unresolved`.

The scan is incremental and idempotent through the Change Inspector state file. A missing session, scan failure or timeout appends a `shadow_gap` and exits successfully. The hook never blocks session Stop. Set `STOP_SHADOW_OFF=1` to disable this hook only; `AUTOARMORY_STOP_SHADOW_SCRIPT` can point the host hook at this script.

The host wiring is intentionally outside the repository: the local `~/.codex/hooks/stopGuard-codex.js` runs this script after its existing guard logic. The repository test suite exercises the script with a synthetic session and asserts no verifier/run/close/verdict artifacts.

Sanitized acceptance evidence: `docs/evidence/stop-shadow-20260918.json`.

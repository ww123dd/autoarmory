# Hook Gate

The hook gate has exactly two blocking points:

1. A production, irreversible or external-side-effect action without explicit approval.
2. A completion/stop claim without a verifier reference.

Ordinary `Edit` / `Write` / `apply_patch` events are recorded and allowed. The gate does not close cases, create verdicts or block normal development.

```bash
node scripts/hook-gate.js --event event.json --state <state-dir> --json
```

Every decision is appended to `hook-decisions.jsonl`. Runtime registration in the host hook system is a separate integration step; this script is the executable contract.
Claude Stop is now connected as an additional hook: it feeds Claude JSONL sessions into the same change-inspector normalization path. See ~/.claude/settings.json and 	ests/claude-stop-hook.js.

# Chain Check

`node scripts/chain-check.js --root <state-root> --repo <repo> --json` is a **local operational verifier**, not a clone-only release gate. It reports:

- `state_root`, `repo`, `commit`, `version`
- per-chain `pass`, `evidence`, source counts, sample sources, and `failed_reason`
- separate `verdict_freshness` (`fresh` / `stale` / `expired` / `missing`) and `gate_decision` (`allow` / `degrade` / `block`)
- the same `verdictFor()` / `mechanism.status()` source used by the gate; it never treats `reuse-record.status='closed'` as current state
- explicit `--root` and `--repo`; a missing `--repo` is an error, never an implicit lookup next to the state root
- explicit `local_only_dependencies`

It reports effective verdict state (`fresh` / `stale` / `valid-fail` / `reopened` / `expired` / `superseded`) separately from chain liveness. A zero `high_signal_total` is valid when the projection policy has run and the candidate/starvation metrics are present. Chain liveness and verdict freshness are separate outputs: a stale verdict does not make the capture/history/reading chains fail.

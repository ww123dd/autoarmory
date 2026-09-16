# Negative Control Matrix

Step 0 runs one real chain, twelve automated negative mutations, and one live replay against the real esc-3 pid file. It does not simulate a large benchmark.

```bash
npm run test:negative-controls
```

The controls are:

1. self-reported pass with a failing verifier
2. adapter tamper
3. bridge tamper
4. missing input hash
5. missing output hash
6. unregistered verifier
7. non-readonly verifier
8. missing approval
9. missing gate proof
10. missing counterexample
11. exit-code mismatch
12. external verifier-lock anchor tamper / write guard
13. live incident replay: the real esc-3 pid file truncated to 0 bytes

Each control must produce one of:

```text
REJECT
MISMATCH
UNVERIFIABLE
BLOCK
```

The matrix reports:

- `tamper_detection_rate`
- `unverifiable_rate`
- `false_success_rate`
- `wrong_admission_rate`

`false_success_rate` is only meaningful after a deliberate forged-pass attempt. The first run records that attempt rather than assuming a denominator.

## Control 13: live incident replay

Controls 1-12 run on fixtures. Control 13 replays the original esc-3 incident against the real file, so one reading of the chain comes from the outside world rather than from a fixture:

```bash
F="C:/Users/Administrator/Documents/Codex/2026-08-25/du/tableau-bitable-plugin/backend/.server.pid"
cp "$F" "$F.bak"   # backup: 52656
: > "$F"           # reproduce the incident: server.pid written as 0 bytes
# run the verifier, record the run, try close, run mechanism-preflight, restore
```

Observed on 2026-09-16 (full JSON: `.selfforge/esc3-incident-replay.json`):

| expectation | observed |
|---|---|
| verifier while truncated | `status=captured`, `passed=false`, `exit_code=1`, `observed.raw=""`, `parse_ok=false`, `alive=false` |
| counterexample | non-empty: `kind=pid_file_truncated_to_zero_bytes`, observed carries the empty pid file |
| recorded run | `result=fail`, `exit_code=1`, bound to `runner_sha256=7b4bb10ca857...` and `case_sha256=7dbe17409e27...` |
| `close` with that run | refused: `run did not pass` |
| `mechanism-preflight` | `MECHANISM_PREFLIGHT_BLOCK` / `mech-esc-3-pid-file: bypassed - latest run failed or regressed` (exit 2) |
| after restoring the file | verifier `exit_code=0`, run recorded, case closed again, `stale_verdict_escape_count=0` |
| tamper window | `2513 ms`, file restored byte-identical to the backup |

This control is deliberately not part of `scripts/negative-controls.js`: it mutates a live project file, so it is a reviewed manual replay with a measured window, not an unattended test. The recovery run is recorded in the same chain, so the case ends closed on freshly re-derived evidence.
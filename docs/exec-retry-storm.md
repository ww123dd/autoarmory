# Exec Retry Storm Stop-Loss

The mechanism stops an agent from burning more exec calls when the same
normalized failure signature repeats. It is a stop decision, not an environment
repair.

## Deterministic signal

Input is a sequence of exec outputs. Failures are normalized with the existing
`change-inspector` algorithm:

- lowercase
- hex-like identifiers become `<id>`
- numbers become `<n>`
- whitespace is collapsed

A run of the same normalized signature reaching `3` produces
`should_have_stopped=true`, `occurrences`, `first_stop_index`, and an evidence
hash. A run of `2` does not fire. Alternating signatures do not fire.

## Real replay

`node scripts/exec-retry-storm-replay.js --records <change-records.jsonl> --json`

The current local corpus separates:

- sessions with a run of at least `3`;
- signatures whose maximum count is exactly `2` (the negative library);
- alternating-signature negative control.

## Global ownership

`examples/mechanisms/exec-retry-storm-stop.json` declares `owner=global` and
`enforcement.mode=observe` with `coverage=none`. The mechanism remains a
candidate until the deployed Stop hook is wired to consume the verifier and
shadow observations are clean.

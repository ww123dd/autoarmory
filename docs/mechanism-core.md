# Mechanism Core

Status: v0.5 vertical slice
Scope: case admission, mechanism registration, independent replay, closure, and verdict

## Core objects

- `case`: a reproducible failure with an expected transition.
- `mechanism`: a control asset that covers one or more failure modes.
- `mechanism_run`: a replay with input/output hashes, environment fingerprint, exit code, and independent verification.
- `closure`: proof that a verified, non-regressing mechanism run closed a case.

## Commands

```bash
autoarmory mechanism case-admit case.json --state .selfforge
autoarmory mechanism register mechanism.json --state .selfforge
autoarmory mechanism run run.json --state .selfforge
autoarmory mechanism close --case case-id --run run-id --state .selfforge
autoarmory mechanism status mechanism-id --state .selfforge
```

## Verdicts

```text
unverified | verified | expired | bypassed | closed
```

`closeCase` rejects a run unless it:

- belongs to the case and mechanism;
- is independently verified (`verified_by !== actor`);
- passed;
- did not introduce a regression;
- records both input and output SHA-256 hashes.

The first slice does not run external tools. It records replay evidence supplied by the caller and only judges whether that evidence is sufficient to close a case.
# Mechanism Core

Status: v0.5 vertical slice
Scope: case admission, mechanism registration, independent replay, closure, and verdict

## Core objects

- `case`: a reproducible failure with an expected transition.
- `mechanism`: a control asset that covers one or more failure modes.
- `mechanism_run`: a replay with input/output hashes, environment fingerprint, exit code, and independent verification.
- `closure`: proof that a verified, non-regressing mechanism run closed a case.

## Commands

The case, mechanism, and run records are produced by the internal mechanism library and consumed by existing workflows. The user-facing action is closure:

```bash
autoarmory close --case case-id --run run-id --state .selfforge
```

`close` returns the resulting verdict, so no separate status command is required.

## Verdicts

```text
unverified | verified | expired | bypassed | closed
```

`closeCase` rejects a run unless it:

- belongs to the case and mechanism;
- is independently verified (`verified_by !== actor`);
- passed;
- did not introduce a regression;
- records both input and output SHA-256 hashes;- records a non-empty counterexample.

The first slice does not run external tools. It records replay evidence supplied by the caller and only judges whether that evidence is sufficient to close a case.

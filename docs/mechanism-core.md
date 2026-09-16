# Mechanism Core

Status: v0.5 vertical slice
Scope: case admission, mechanism registration, independent replay, closure, and verdict

## Core objects

- `case`: a reproducible failure with an expected transition.
- `mechanism`: a control asset that covers one or more failure modes and declares the registered `verifier_id` used to judge it.
- `mechanism_run`: a replay with `evidence_refs`, re-derived input/output digests, environment fingerprint, exit code, counterexample, and a judge-produced verification result.
- `closure`: proof that a freshly verified, non-regressing mechanism run closed a case.

## Commands

The case, mechanism, and run records are produced by the internal mechanism library and consumed by existing workflows. The user-facing action is closure:

```bash
autoarmory close --case case-id --run run-id --state .selfforge --repo <repo-root>
```

`close` returns the resulting verdict, so no separate status command is required.

## External fact verification

`src/lib/verify.js` defines `verifyRefs` / `verifyRecord` / `captureRefs`.

A record is verified only when the judge can re-derive the fact now:

- the mechanism declares a registered `verifier_id`, and its adapter integrity is checked at registration;
- the run's `evidence_refs` include that same `verifier`; a run that uses an unrelated registered verifier is rejected even if that unrelated verifier re-derives successfully;
- the record points to an `evidence_ref` whose `verifier` is registered in the active local `verifiers.lock.json`; the core repo ships an example under `examples/profiles/`, not a machine-specific lock;
- the verifier is explicitly `readonly`;
- the adapter is inside the repository and its SHA-256 matches the pinned adapter digest;
- the active local profile pins the bridge adapter and its source-specific descriptor; the shipped Doris/MCP adapter is only an example, not a core assumption;
- the adapter is re-run and produces fresh `input_sha256`, `output_sha256`, and `exit_code`;
- those fresh values match the recorded ref;
- the same output digest reproduces across the configured trials (`Pass^k` style stability check);
- the run's top-level digests, exit code, and result match the re-derived facts.

Missing refs, unknown verifiers, non-readonly adapters, missing recorded hashes, adapter drift, non-zero adapter exits, or a missing pinned assertion all produce `unverifiable` or `mismatch`; they never produce `verified`.

`verified_by`, `independent: true`, and a stored `verification_result` are not trust roots. `closeCase` and `status` re-run the verifier at read time. A caller that writes `result: pass` while the verifier re-derives `exit_code: 1` is rejected.

Boundary: this proves that the registered adapter re-derives the recorded fact through the active local profile's pinned read-only path. The core is environment-neutral; Doris, MCP, paths, and `readonly_aa` belong to the example profile, not to the judge core. The remaining trust-root boundaries are rewritten git history or a compromised local adapter/MCP server/configuration.

`scripts/verifier-preflight.js` runs on pre-commit when an active local profile exists, and fails closed if any verifier artifact or pinned adapter digest drifts, or if the checker loses its known positive/negative behavior. `scripts/mechanism-preflight.js` gives mechanism verdicts a real cost: a repository with mechanism state cannot commit while a mechanism is `unverified`, `expired`, or `bypassed`.

## Verdicts

```text
unverified | verified | expired | bypassed | closed
```

`closeCase` rejects a run unless it:

- belongs to the case and mechanism;
- has verified `evidence_refs` from the mechanism's declared `verifier_id` after a fresh re-derivation;
- has re-derived input/output SHA-256 hashes and `exit_code`;
- passed according to the re-derived exit code;
- did not introduce a regression;
- records a non-empty counterexample.

The first slice does not execute external tools as part of the control plane. It re-runs only registered, read-only verifier adapters whose digest is pinned in the trust root.

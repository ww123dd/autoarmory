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

A run is recorded from the mechanism declaration plus a fresh capture of its declared verifier:

```bash
node scripts/mechanism-declare.js --descriptor mechanism-descriptor.json   # admit the case + register the mechanism
node scripts/mechanism-record.js --mechanism mech-esc-3-pid-file --close --json
```

`scripts/mechanism-declare.js` takes `{ "case": ..., "mechanism": ... }` and refuses a mechanism whose `verifier_id` the active profile does not register, so a mechanism cannot be declared against a verifier that cannot judge it.

The one artefact an agent must never author is the operator approval. `scripts/approve.js` keeps the decision with the operator and does the boilerplate:

```bash
node scripts/approve.js --candidate <id> --dry-run            # print the approval request
node scripts/approve.js --candidate <id> --quote "<operator words>"   # record the decision
```

It refuses to record anything without the operator own words in `--quote`, refuses a candidate that is not in `pending_approval`, and writes the record the transition needs (`requested_by: agent`, `approved_by: user`, scope, channel, quote).

`scripts/mechanism-record.js` reads the mechanism and case from state, captures the ref through the active local profile, records the re-derived digests, and (with `--close`) closes the case. It is the mechanical step to run after `scripts/verifier-pin.js` changes a pin: a recorded run embeds the pinned bridge digest, so an unpinned run stops reproducing until it is re-recorded.

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

`scripts/verifier-preflight.js` runs on pre-commit when an active local profile exists, and fails closed if any verifier artifact or pinned adapter digest drifts, or if the checker loses its known positive/negative behavior.

The local trust anchor for verifiers.lock.json lives outside the repository (for this machine, under ~/.codex/hooks/). The repository preflight fails closed if the lock digest does not match that external anchor; the guard also blocks Write/Edit to verifiers.lock.json. That block is not a request for a human to hand-write the trust root: declaring a verifier stays mechanical — write a descriptor and run `node scripts/verifier-pin.js --merge <descriptor.json>`, which recomputes every pinned digest and rewrites both halves of the trust root. The operator approves the change instead of typing it. `scripts/mechanism-preflight.js` gives mechanism verdicts a real cost: a repository with mechanism state cannot commit while a mechanism is `unverified`, `expired`, or `bypassed`.

## Runner identity and freshness

A verdict is only as good as the runner that produced it. Every mechanism run and closure records:

```json
{
  "runner_id": "<verifier id>",
  "runner_sha256": "<sha256 over adapter, bridge, declared MCP config/entry, statement, assertion and invocation contract version>",
  "invocation_contract_version": "autoarmory/invocation-contract/v1",
  "verifier_version": "<human-readable compatibility label>",
  "case_sha256": "<canonical digest of the case record this verdict judges>"
}
```

The rules:

- a record that cannot name its runner is `unverifiable`;
- a record whose runner differs from the active profile is `mismatch`;
- a closure is only valid while the run that produced it is still fresh, so changing the runner cannot leave a case closed;
- rewriting the case record changes its `case_sha256`, which invalidates every run and closure that judged the previous bytes; a verdict describes a case, not a case id;
- `close`, `status` and `scripts/mechanism-preflight.js` share this single rule, and the preflight reports `stale_verdict_escape_count`;
- `runner_sha256` covers the pinned artifacts, the declared statement/assertion and the invocation contract; the human-readable `version` is excluded, so bumping it is compatibility metadata rather than a change of trust;
- `scripts/mechanism-record.js` binds a new run to the runner the active profile declares instead of accepting a caller-supplied identity.

A case is not bound to a runner at admission time: the case exists before a mechanism chooses one. The binding lives on the mechanism (`verifier_id`), then on each run, then on the closure.

`tests/stale-verdict.js` drives the whole loop: verified -> runner change -> stale -> close refused -> re-bind -> re-verify -> closed, plus adapter tamper, invocation-contract change and case rewrite, and asserts `stale_verdict_escape_count=0`.

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

The first slice does not execute external tools as part of the verifier core. It re-runs only registered, read-only verifier adapters whose digest is pinned in the trust root.

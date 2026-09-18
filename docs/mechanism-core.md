# Mechanism Core

Status: v2.7 Done Contract slice
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

## Lifecycle

A verdict is not a promotion. `promote` records a separate, evidence-backed decision that names the run it rested on:

```bash
node scripts/mechanism-lifecycle.js --mechanism <id> --promote
node scripts/mechanism-lifecycle.js --mechanism <id> --rollback-if-stale
node scripts/mechanism-lifecycle.js --list
```

`--promote` refuses unless the current verdict is `verified` or `closed`, and records `from -> promoted` with an evidence pointer (run id, result, exit code, runner digest, case digest). `--rollback-if-stale` does nothing while the evidence holds; when the evidence is gone it appends `promoted -> retired` carrying the fact that forced it, and is idempotent per (evidence, status).

`scripts/mechanism-preflight.js` refuses to let a promotion outlive its evidence: it reports `stale_lifecycle_escape_count` and blocks with the exact command until the rollback record exists. A retired mechanism is not an unhandled failure - the record explains why its verdict is gone - so preflight passes once the loop is closed, and re-promotion is allowed again after the runner is re-bound and re-verified.

`tests/rollback.js` drives all of it: promote (evidence-backed), healthy (no rollback), stale promoted (BLOCK with count 1), rollback (recorded + idempotent), post-rollback (0 + pass), recovery (re-promoted), stale promotion (refused).

## Boundary Policy

`examples/boundary-policy.json` is the task-level policy that sits beside the case, not inside it. Each task class declares its `stop_conditions` and the action tiers it permits. The transition command classifies every candidate action before writing state and refuses an unclassified action or an explicit tier that conflicts with the policy.

`scripts/boundary-audit.js` reads candidates and transitions and reports only derived facts:

- `authorized_action_without_approval_count`
- `action_classification_conflict_count`
- `unlabeled_rule_count`
- `stop_conditions_missing_count`
- `boundary_policy_escape_count`

The four allowed rule categories are `project-knowledge`, `risk-boundary`, `context-routing` and `done-criteria`. The category declaration is machine-checkable; whether a rule belongs in that category remains a human or Agent judgment.
## Done Contract

A case may be admitted without a completion contract so historical records keep their schema. `close` is where the contract becomes mandatory:

- `case.verifier` must name the registered verifier that proves completion;
- `case.done_criteria` must be a non-empty string or object;
- the named verifier must equal the mechanism verifier and appear in the run evidence;
- the same real execution must have re-derived a passing run, a non-zero counterexample and no regression.

The resolved criteria and their SHA-256 are written into the closure as `done_contract`, together with `verification_gap_count`. Missing criteria, a mismatched verifier, a failed re-derivation or a missing counterexample all fail closed. `src/lib/done-contract.js` is the single completion family used by `closeCase`; it does not introduce a second judge.
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
- records a non-empty counterexample;`n- declares and passes the case Done Contract bound to that same verifier and run.

The first slice does not execute external tools as part of the verifier core. It re-runs only registered, read-only verifier adapters whose digest is pinned in the trust root.

## Mechanism Scope & Validity

`mechanism` keeps the same object. The new fields are split by authority:

| Class | Fields | Authority |
| --- | --- | --- |
| Declaration | `scope`, `expires_at`, `reopen_trigger` | Operator/agent input; schema fields |
| Projection | `scope_sha256`, `scope_status`, `expiry_status`, `reopen_required` | Computed by `status`; never supplied at registration |

`scope_sha256` is derived from `scope` at registration for drift detection. It proves integrity and equality only; it does not prove the scope is correct. Supplying any projection field is rejected.

The three time/validity states are different outcomes:

| State | Trigger | Effect |
| --- | --- | --- |
| `stale_verification` | run age exceeds `verification_stale_days` | warning; verdict remains usable |
| `expired` | `expires_at` has passed | `status` must not return `verified` or `closed`; close/promote reject |
| `reopen_required` | a computable `reopen_trigger` predicate hits | reopen verification before reuse; close/promote reject |

Trigger kinds are limited to computable predicates: `runner_changed`, `case_changed`, `scope_changed`, `file_changed`, `evidence_expired`, `environment_changed`. `file_changed` requires `target` and `expected_sha256`; free-text triggers are rejected. `promote` can be evaluated against a requested scope and rejects `out_of_scope`.

Preflight reports `unscoped_promotion_count`, `out_of_scope_reuse_count`, `expired_mechanism_reuse_count`, `legacy_unscoped_promotion_count`, `reopen_trigger_invalid_count` and `reopen_required_escape_count`.

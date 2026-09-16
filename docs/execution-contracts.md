# Selection, Execution and Outcome Contracts

AutoArmory keeps three layers separate:

```text
Selecting a skill
!= executing the selected skill
!= producing a verified outcome
```

The layers use different evidence and cannot be collapsed into one reward.

## Selection

- Request contract: `schemas/routing-request.schema.json`
- Decision contract: `schemas/routing-decision.schema.json`

A routing decision records `candidate_set`, `top_k`, `selected`, `fallback_chain`, `selection_margin`, `selection_confidence` and `confidence_method`.

`selection_confidence` remains `null` until a real benchmark has calibrated the route scores. Thompson-sampling scores are not probabilities and must not be presented as calibrated confidence.

## Execution

- Contract: `schemas/execution-trace.schema.json`
- Library: `src/lib/execution-trace.js`
- CLI: `autoarmory execution record|list`

An execution trace may be linked to a routing decision. When no routing decision exists, it records `selection_status: unlinked` instead of failing. It records:

- expected and observed steps;
- order and stop-condition adherence;
- environment fingerprint;
- process/workspace isolation evidence;
- dependency versions;
- artifact references.

A trace is `conformant` only when required steps completed, order and stop conditions passed, and both an independent process and temporary workspace were observed. Otherwise it is recorded as `nonconformant`; it is never silently treated as success.

## Outcome

Two different records have different authority:

- `capability-outcome` is a learning signal. It can update reliability and drift statistics.
- `mechanism-run + verification_result` is the trusted closure path. It requires a registered readonly verifier and fresh re-derivation.

An outcome may reference an `execution_id`; when it does, AutoArmory checks that the execution trace belongs to the same routing decision and selected capability. A self-reported `verified: true` boolean is not an independent trust root.

## Approval boundary

Promotion uses `pending_approval` as the single human interaction point:

```text
candidate -> pending_approval -> gated
```

The Agent prepares the candidate, case/mutation evidence, gate proof, rollback and verification commands. The user approves the transition; the Agent executes it. An approval record is authorization evidence only and never replaces gate proof.

## Operator friction

`autoarmory execution friction record|list` records interaction friction and selects one of three actions:

```text
auto_execute       Agent executes; user only approves
approval_required  high-impact or irreversible action needs approval
record_only        vague or one-off frustration is recorded, not generalized
```

The friction record stores `user_actions_required` and an empty `manual_steps` list for Agent-executed paths. A friction decision is operational policy, not verifier evidence.
## Router boundary

AutoArmory does not add a multi-skill router by default.

Router work is deferred until shadow evidence shows that selection is the bottleneck:

```text
P(outcome failure | wrong selection)
  vs
P(outcome failure | correct selection)
```

If failures come mainly from execution, isolation, dependencies or missing outcome verification, fix those layers first.
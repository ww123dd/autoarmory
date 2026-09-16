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

An execution trace is linked to one routing decision and records:

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

## Router boundary

AutoArmory does not add a multi-skill router by default.

Router work is deferred until shadow evidence shows that selection is the bottleneck:

```text
P(outcome failure | wrong selection)
  vs
P(outcome failure | correct selection)
```

If failures come mainly from execution, isolation, dependencies or missing outcome verification, fix those layers first.
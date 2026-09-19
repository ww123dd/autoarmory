# Claim Resolution v1

This contract fixes the mapping from a recorded change to a nomination. It is the boundary between discovery and verification. The scanner nominates; only a registered verifier or a pinned mechanical binding decides.

## Pipeline

```text
change_records
  -> claim_draft
  -> owner_source
  -> verifier_candidate
  -> resolver_result
  -> disposition
```

The pipeline produces nominations only:

```text
ready_for_verifier
no_capability
unverifiable
blocked  (reason_code: blocked_by_access | blocked_by_owner | expected_transition_missing)
```

`ready_for_verifier` is a resolver output, not a lifecycle state. No scanner may write `pending`, `mechanism-runs`, `closures`, or `reuse-records`.

## 1. Claim draft

A claim draft is a falsifiable candidate statement derived from real change records. It may be incomplete.

```text
schema_version        autoarmory/claim-draft/v1
change_id             source change primary key
source_refs           change-record ids that produced this draft
claim                 optional human/agent-authored hypothesis; null is legal
expected_transition   optional at draft time; mandatory before bind/declare
owner                 optional at draft time
owner_source          explicit | owner_registry | case_owner | missing
verifier_candidate    resolver output for the observed command/files
disposition           ready_for_verifier | no_capability | unverifiable | blocked
reason_codes          [] | no_capability | blocked_by_access | blocked_by_owner | expected_transition_missing | expected_provenance_missing
```

Rules:

- `expected_transition` may be empty in a draft.
- A draft cannot become `ready_for_verifier` unless `expected_transition` is non-empty, owner is resolved, and the verifier capability schema matches.
- `claim` is never evidence. It is only a nomination.

## 2. Owner and expected provenance

Allowed owner sources, in priority order:

1. `explicit`: a declaration names this `change_id`.
2. `owner_registry`: `<state>/owners.json` maps project/task/action to an owner.
3. `case_owner`: an admitted case already names the owner.
4. `missing`: no unique owner exists.

If owner is missing:

```text
disposition = blocked
reason_codes += blocked_by_owner
```

Never infer an owner from cwd, session id, or the last editor.

Expected value provenance is mandatory before a claim is ready:

```text
expected_provenance in owner_approval | baseline_manifest | commit | pinned_verifier
```

`agent_inferred` and free-form expected values are refused. The expected value, claim instance and provenance all enter `claim_sha256`.

## 3. Capability schema

A verifier is not matched by `id` or `kind` alone. Every registered verifier declares:

```text
transition_types
artifact_type
required_inputs
optional_inputs
expected_provenance
assertion_schema
action_class
scope_schema
owner
```

The resolver must satisfy the schema before the claim is `ready_for_verifier`.

## 4. Verifier candidate source

The resolver may return only these mechanical classes as decidable:

```text
registered
project_test
file_hash
git_status
```

These are candidates only and must not be marked resolved:

```text
verifier_candidate: http | sql | process | dom | build_artifact
verifier_missing
```

A candidate may become decidable only after it is registered or pinned as a mechanical binding with a captured command hash, cwd, repo head and expected value.

## 5. Resolver result -> disposition

```text
matched capability
  + expected_transition present
  + owner resolved
  + expected_provenance trusted
  -> ready_for_verifier

matched capability / missing expected_transition
  -> unverifiable (expected_transition_missing)

known claim / no accessible capability
  -> blocked (blocked_by_access)

no matching capability
  -> no_capability (registry backlog, not a lifecycle state)
```

`blocked_by_access`, `blocked_by_owner` and `no_capability` are reason codes. They are not lifecycle states and must not be written into `cases.jsonl`, `mechanisms.jsonl`, or `reuse-records`.

## 6. Authority boundary

```text
LLM / Agent      may nominate, explain, and propose an owner or verifier
registered verifier or pinned mechanical binding
                 decides pass/fail
history-runner   may run a ready verifier and write a reuse-record
load-gate        consumes only effective verdicts computed by mechanism.status()
```

No LLM judgment, self-report, or unregistered command may produce a verdict. No synthetic record may be used to fill an empty stream; an empty stream yields `insufficient_real_stream` with zero nominations.

## 7. Provenance

Every nomination must be traceable to real records:

```text
change_id
session_id          when uniquely recoverable
turn_id             when uniquely recoverable
source_message_id   when uniquely recoverable
source_refs         change-record ids
```

If provenance cannot be uniquely recovered:

```text
session_link_status = link_lost
```

Missing provenance is reported, not guessed.

## Implementation

- `src/lib/reuse-linker.js` / `scripts/link-reuse-records.js` recover only unique session links and mark the rest `link_lost`.
- `src/lib/decision-scan.js` / `scripts/decision-scan.js` produce nomination-only drafts; they never write pending jobs or verdicts.
- `src/lib/decision-orchestrator.js` / `scripts/decision-orchestrate.js` turn only `ready_for_verifier` drafts into pending jobs; they do not run the verifier.
- `src/lib/verifier-resolver.js` matches claim capabilities; `scripts/verifier-preflight.js` refuses a verifier without a capability schema.
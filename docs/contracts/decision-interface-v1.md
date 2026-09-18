# Decision Interface v1

The contract that turns facts into verdicts and connects verdicts to actions.
Verifier runs produce facts. A verdict is one decision's claim bound to one
run. The gate maps `action_class x verdict_state` to allow/degrade/block
through a versioned policy table. Nothing here lets an LLM judge or a
self-report decide.

Status legend: **[v1]** implemented in this version, **[existing]** already
implemented before this contract was written down.

## 1. Decision — the only door to a verdict **[existing]**

A decision exists when these fields are recorded. The first real instance is
`docs/evidence/phase-a-tableau-release-20260918.json` (owner, claim, artifact
digest, verifier, real run, closed).

```text
change_id            primary key; the decision is about this change
claim                the falsifiable statement ("release zip == approved build")
owner                who answers for the decision (a name, never "agent")
action_class         which class of consumer action this claim gates
origin               change-derived | standing (registration-time claim)
source_ref           change record, registration entry, or evidence file
```

A standing decision is created at verifier registration time: the pinned
assertion in `verifiers.lock.json` already is a claim; the registration must
also name its `action_class` and `owner`. Scheduled verifier runs then
maintain that decision's verdict freshness — they never create verdicts for
undecided claims.

## 2. Verdict — decision + run, immutable **[existing]**

Store: `<state>/reuse-records/<change_id>.json`, written by the
history-runner after a real verifier run.

```text
status          closed | failed | unverifiable | expired | retired | reopen_required
verifier        registered verifier id
run             { id, result, exit_code, input_sha256, output_sha256, ... }
expires_at      min(stale_days, evidence-source availability)
reason          why, verbatim, on anything not closed
```

The effective state is always **computed, never stored**:
`no-verdict | valid-pass | valid-fail | expired | retired | reopened |
unverifiable`. Time moves the answer; the record stays byte-identical.

## 3. Action registry + gate query **[v1]**

```text
action_class registry (versioned): publish | deploy | ddl | external-write | load | exploration

gate.consultAction(state, {action_class, change_id?, consumer_ref?, artifact_ref?})
  -> { behavior: allow|degrade|block|observe,
       would_behavior,            # what enforce would decide (observe classes)
       mode, verdict_state, reason_code, policy_version, at }
```

`behavior='observe'` means record-only: the call passes, the decision is
logged, and `would_behavior` accumulates the case for flipping the class to
enforce.

## 4. Policy table — strategy is data, not a field **[v1]**

Default `POLICY_V1` ships in `src/lib/load-gate.js`; a state root may override
it with `decision-policy.json` (`autoarmory/decision-policy/v1`, must declare
`classes`, `mode`, `rules`).

```text
mode    per class: enforce | observe
rules   per class: verdict_state -> allow | degrade | block

POLICY_V1:
  publish / deploy / ddl / external-write   enforce
    no-verdict->block  valid-pass->allow  valid-fail->block
    expired->block  retired->block  reopened->block  unverifiable->block
  load / exploration                         observe
    no-verdict->degrade  valid-pass->allow  valid-fail->degrade
    expired->degrade  retired->block  reopened->block  unverifiable->degrade
```

## 5. Consumption log + scoped invariants + fact refresh **[v1]**

Consumption events append to `<state>/consumption.jsonl`:

```text
{ schema_version: "autoarmory/consumption/v1", at, action_class, change_id,
  consumer_ref, artifact_ref, verdict_state, mode, behavior, would_behavior,
  policy_version }
```

Invariants (scoped, measured by `loadGate.violations(state)`):

- **enforce_gate_hole_count = 0** — an enforce-mode allow with
  `verdict_state=no-verdict` is a gate hole and must be impossible by
  construction; any non-zero count is a policy regression, not an operator
  error.
- **observe_would_block_count** grows while a class is in observe mode; it is
  the evidence used to flip a class to enforce. It is never zeroed by hand.

Fact refresh (`loadGate.refresh(state)`, CLI `--refresh`) recomputes effective
states for every reuse-record, appends one
`autoarmory/verdict-event/v1` per state transition to
`verdict-events.jsonl`, and writes the `decision-state.json` snapshot. It
never runs a verifier and never creates a verdict; re-runs stay the job of the
verifier schedule. The second refresh after no change reports
`transitions: 0`.

## What this contract deliberately does not do

- No LLM judge anywhere in the path; extraction may nominate (future,
  `extractor: llm`), only pinned verifiers decide.
- Orphan verdicts are legal: a validated fact with no consumer yet is not an
  error. The protected invariant lives on the action side.
- `blocked_by_access` / `blocked_by_owner` are gate reason codes, not
  lifecycle states; `declare/verified/closed/retired` stays pure.

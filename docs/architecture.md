# Architecture

AutoArmory is an auto-battle control plane for agent capabilities.

```text
local signals / logs / tests / issues
              |
              v
           observe
              |
              v
          incidents.jsonl
              |
              v
           propose
              |
              v
         candidates.jsonl
              |
              v
      gate / SkillCanary
              |
              v
        decisions.jsonl
              |
              v
            learn
              |
              v
      next recommendation
```

## Observation adapters

Observation accepts files, directories and stdin. `observe - --format log|junit|github|jsonl` lets external CLI and runner output enter the pipeline without AutoArmory running that command itself. This keeps execution authority with the user while preserving reproducible incident input.

## Gate execution

`gate` and `evolve` call `skillcanary gate --json` with a canonical `skillcanary/change/v1` request. AutoArmory records the dependency version, gate exit code, gate result, warnings and a SHA-256 of the submitted change. A missing dependency or malformed gate response is a failure, not a skipped check.

## State machine

Candidate state transitions are append-only records in `.selfforge/transitions.jsonl`: `candidate -> gated -> shadow -> canary -> promoted`. `rejected` may terminate a pre-promotion path with a reason, and `retired` closes a promoted candidate. Gate proof is required before `gated`/`shadow`; structured outcome evidence is required before `canary`/`promoted`.

## Decision evidence

A decision is only appended when it carries a successful SkillCanary gate proof. Verified decisions also carry structured outcome evidence and an environment fingerprint, so later learning can distinguish changes that worked from changes that only appeared to work in a different environment.

## Planes

- **SkillCanary**: evidence, provenance, compatibility and the change gate.
- **AutoArmory evolution engine**: observe, propose, record, learn and evolve the artifacts that enter the system.
- **Capability Manager**: discover, normalize, certify, health-check, route, compose, degrade, replace and retire capability modules.

Dependencies are one-way at the code level. Capability Manager reads canonical outcome and replacement-suggestion records emitted by the evolution engine; it does not import the evolution engine internals. A suggestion is a data contract, not a reverse code dependency.

## Separation

SkillCanary owns:

- evidence contracts;
- provenance;
- change gate;
- adapters;
- compatibility.

AutoArmory owns:

- incident collection;
- candidate generation;
- self-improvement policy;
- experiment history;
- learning across rounds.

The interface is deliberately one-way. SkillCanary can be used without AutoArmory. AutoArmory can use SkillCanary through the CLI or canonical JSON records.

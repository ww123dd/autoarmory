# SelfForge

**Self-evolution runtime for agent skills and tools.**

SelfForge is the self-improvement layer. SkillCanary remains the evidence, provenance and change-gate control plane. SelfForge consumes real incidents, proposes changes, sends candidates through a gate, records outcomes and recommends the next action.

```text
observe -> incident -> candidate -> gate -> decision -> learn
```

## Why separate

- SkillCanary should remain stable, small and compatible.
- SelfForge can experiment with algorithms, memory, active learning and policy.
- SelfForge must be able to improve SkillCanary, but SkillCanary must not depend on SelfForge.

## Commands

```bash
selfforge init
selfforge observe logs/ --output .selfforge/incidents.jsonl
selfforge propose .selfforge/incidents.jsonl --output .selfforge/candidates.jsonl
selfforge gate .selfforge/candidate.json --skillcanary ../20260914_SkillCanary --cases examples/skillcanary-cases.json
selfforge record --candidate cand-1 --action add_case --reward 1.5 --verified true
selfforge learn .selfforge/decisions.jsonl
selfforge environment --write
selfforge experiment compare before.json after.json
selfforge policy .selfforge/decisions.jsonl
selfforge acquire .selfforge/candidates.jsonl --top 10
selfforge evolve logs/ --format auto --skillcanary ../20260914_SkillCanary --cases path/to/cases.json
selfforge doctor
selfforge report --output selfforge-report.md
```

## Gate boundary

`selfforge gate` and `selfforge evolve` both call the real SkillCanary gate. The operation is fail-closed: a missing SkillCanary CLI, invalid gate output, local structural error, or any SkillCanary gate error marks the candidate `rejected`. SelfForge does not promote or execute a candidate by itself.

A gate-ready candidate carries a `change` object. SelfForge fills the shared change fields (`id`, `target`, `expected_transition`, `prediction`) from the candidate, then passes the resulting `skillcanary/change/v1` record to `skillcanary gate`. Case targets must provide a cases file; deterministic targets do not.

Run the real adapter conformance suite with a sibling SkillCanary checkout:

```bash
npm run test:conformance
```

## Boundaries

SelfForge does not:

- run agents;
- scan for vulnerabilities;
- replace SkillCanary;
- execute changes without approval;
- collect private transcripts into public repositories.

The dependency direction is one-way:

```text
SelfForge -> SkillCanary contracts and gate
SkillCanary -X-> SelfForge
```

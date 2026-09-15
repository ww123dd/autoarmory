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
selfforge gate .selfforge/candidate.json --skillcanary ../20260914_SkillCanary
selfforge record --candidate cand-1 --action add_case --reward 1.5 --verified true
selfforge learn .selfforge/decisions.jsonl
selfforge environment --write
selfforge experiment compare before.json after.json
selfforge policy .selfforge/decisions.jsonl
selfforge acquire .selfforge/candidates.jsonl --top 10
selfforge evolve logs/ --format auto
selfforge doctor
selfforge report --output selfforge-report.md
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

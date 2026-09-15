# Architecture

SelfForge is a self-evolution runtime.

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

## Gate execution

`gate` and `evolve` call `skillcanary gate --json` with a canonical `skillcanary/change/v1` request. SelfForge records the dependency version, gate exit code, gate result, warnings and a SHA-256 of the submitted change. A missing dependency or malformed gate response is a failure, not a skipped check.

## Separation

SkillCanary owns:

- evidence contracts;
- provenance;
- change gate;
- adapters;
- compatibility.

SelfForge owns:

- incident collection;
- candidate generation;
- self-improvement policy;
- experiment history;
- learning across rounds.

The interface is deliberately one-way. SkillCanary can be used without SelfForge. SelfForge can use SkillCanary through the CLI or canonical JSON records.

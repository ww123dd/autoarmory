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

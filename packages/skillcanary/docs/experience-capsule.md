# Experience capsule

The useful part of EvoMap/EvoX is not the swarm branding. It is three ideas:

1. unitize experience;
2. separate generation from verification;
3. make verified experience inheritable.

A **capsule** is the unit SkillCanary passes forward.

```json
{
  "id": "capsule-001",
  "skill": "example-skill",
  "problem": "The agent reused a stale assumption after a schema change.",
  "context": "Data warehouse schema migration.",
  "method": "Check the live schema before writing SQL.",
  "evidence": ["session-a", "session-b"],
  "verification": {
    "verified_by": "independent-check",
    "oracle": "DESC + information_schema",
    "result": "pass",
    "evidence": "schema check executed at 2026-09-14T20:00:00+08:00"
  },
  "applicability": "Only when the target table is mutable or recently migrated.",
  "provenance": {
    "source_sessions": ["session-a", "session-b"],
    "generated_by": "skill-scan",
    "derived_from": [],
    "supersedes": []
  },
  "status": "candidate",
  "canary": "must-fail sample for the blocking promotion"
}
```

## Rules

- A capsule is advice until verified.
- Verification must be independent of the generator.
- Blocking requires a deterministic check and a must-fail canary.
- A capsule carries applicability boundaries, not just a conclusion.
- A retired capsule stays in history; it is not deleted.
- Sharing experience is valuable. Automatically expanding scope is not.
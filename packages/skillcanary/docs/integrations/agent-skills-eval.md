# agent-skills-eval integration

`agent-skills-eval` produces grading artifacts, JSONL logs and HTML reports. SkillCanary turns the result into a merge gate.

## CLI

```bash
skillcanary import agent-skills-eval benchmark.json --case c01 --skill my-skill --output .skillcanary/change.json
```

The adapter looks for an `evals[]`, `results[]`, `cases[]` or `benchmarks[]` item matching `--case`, then maps:

- `without_skill`, `no_skill`, `baseline`, `before`, `control` -> before;
- `with_skill`, `skill`, `candidate`, `after`, `treatment` -> after.

Nested `{passed,total}`, `{pass,total}`, `{successes,failures}` and trial arrays are accepted.

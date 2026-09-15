# FAQ

## Is SkillCanary an eval runner?

No. Use `skillgrade`, `agent-skills-eval`, `promptfoo` or your own harness. SkillCanary imports their artifacts and gates the change around the result.

## Is SkillCanary a security scanner?

No. Use `skillwarden`, `skillguard`, `SkillGate`, Mondoo or NVIDIA SkillSpector. SkillCanary can consume their result as an input.

## Does it run an agent?

No. It reads files and JSON records. That makes it cheap and deterministic in CI.

## Does it need a model key?

No.

## Does it ship a dashboard or database?

No. It materializes table-shaped JSONL and can export generic SQL. A hosted store/dashboard is intentionally deferred until the tables are actually queried by real users.

## How does it know a skill is getting worse?

It tracks outcomes after a change: corrections, rework turns, tool errors and verification results. The error budget decides when to stop editing and collect new incidents.

## What does `doctor` do?

`doctor` is the user-facing entry point. It aggregates skill checks, hook rules, evidence state and error budget into one status and a next action.

> Until the first npm release, replace `npx skillcanary` with `node bin/skillcanary.js`.

## Where do I start?

```bash
skillcanary doctor ./skills/my-skill
npx skillcanary init . --with-action
npx skillcanary import auto result.json --case c01 --output .skillcanary/change.json
npx skillcanary gate .skillcanary/change.json .skillcanary/cases.json
npx skillcanary hook doctor
npx skillcanary release preflight
```

# EvoMap / EvoX absorption - 2026-09-14

Source: WeChat article `JMwS7OXUEjby3JXceeV0mQ`.

## Decision

| Idea | Class | Reason | Action |
|---|---|---|---|
| Experience transfer across agents | 可做 | The valuable part is a portable experience unit, not the swarm brand | Add `capsule.schema.json` |
| Separate generation from verification | 可做 | Independent verification prevents self-grading | Require `verified_by` + `oracle` for blocking promotion |
| Gene / Capsule | 可做 | A capsule is a better transfer unit than a raw message or a rule | Define capsule fields: problem / context / method / evidence / verification / applicability / provenance |
| Experience lineage | 可做 | Later agents need to know where a capsule came from and what it supersedes | Add `provenance.derived_from` and `supersedes` |
| Swarm / multi-agent | 不融入（默认） | Multi-agent adds coordination cost; do not make it the default | Keep "not a multi-agent framework by default" |
| Automatic scope expansion | 不融入 | The article praises adding unrequested features; for data/dev work this is scope creep | Keep scope boundaries and handoff rules |
| AutoResearch loop | 印证 | Discovery -> plan -> experiment -> independent verification matches the existing gate | Keep `scan -> advice -> promote -> track` |

## Adopted

- `schemas/capsule.schema.json`
- `docs/experience-capsule.md`
- Blocking promotion now requires:
  - `determinism=deterministic`
  - `canary`
  - independent `verification.verified_by`
  - independent `verification.oracle`
  - `verification.result=pass`

## Rejected

- Swarm-first default.
- Automatic feature expansion.
- Treating vendor claims as independently verified facts.
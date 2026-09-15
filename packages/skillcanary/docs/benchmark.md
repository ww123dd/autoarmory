# Benchmark

SkillCanary separates proof into deterministic fixtures and executable real regressions.

| Suite | Command | Purpose |
|---|---|---|
| Synthetic | `npm run benchmark` | Prevent CLI behavior regressions. |
| Real | `npm run benchmark:real` | Re-run observed failures with an expected exit code. |
| Schema | `npm run benchmark:real:validate` | Validate required fields and observations. |

The synthetic suite is not evidence that a skill content change is good. It is evidence that the gate itself has not broken. Real cases are the bridge between an incident and a regression gate.

Do not count a case as real if the source is invented or the command cannot be executed.

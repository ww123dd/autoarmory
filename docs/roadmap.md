# Roadmap

## 0.1

- [x] incident observation
- [x] candidate proposal
- [x] structural gate
- [x] decision learning
- [x] SkillCanary adapter
- [x] local-first privacy redaction

## 0.2

- [x] ingest JUnit, GitHub issues, logs and JSONL
- [x] ingest real CLI/runner output through stdin adapters
- [x] active candidate acquisition
- [x] sequential outcome comparison
- [x] environment fingerprint
- [x] Thompson policy recommendation with uncertainty
- [x] fail-closed SkillCanary gate proxy
- [x] gate conformance for deterministic and case targets
- [x] decision environment fingerprints and outcome evidence
- [x] append-only shadow -> canary -> promoted/rejected state machine

## 0.3

- [x] public rebrand to AutoArmory with legacy CLI aliases
- [x] single AutoArmory monorepo with vendored SkillCanary package
- [x] Capability Manager architecture specification
- [x] canonical capability, routing-request, routing-decision and outcome contracts
- [x] capability registry plus health and conformance surfaces
- [x] constrained routing and Pareto portfolio
- [x] change-point detection and conformance checks
- [x] guarded calibration and off-policy evaluation
- [x] article and OTel incident adapters with failure taxonomy
- [x] deterministic self-evaluation command with explicit self-assessment bias
- [x] killer demo command
- [x] capability routing benchmark
- [x] runner/scanner/MCP/OTel integration imports
- [x] admission gate with explicit status labels
- [x] scenario profile contracts for coding/support/research
- [~] local API, SDK client and Team CLI kept as optional internals; CLI is the primary operator interface
- [x] external adapter contract and descriptor schema
- [ ] automatic proposal generation from issue history
- [ ] shadow evaluation
- [ ] canary and rollback records
- [ ] cross-repository privacy-preserving learning

## Deferred

- Selection / execution / outcome contracts and the operator-friction policy were designed on `experiment/selection-execution-outcome-contracts`; the branch is retired and the design is archived at tag `freeze/selection-execution-outcome-contracts-20260916` (`git switch -c <branch> freeze/selection-execution-outcome-contracts-20260916`).
- Trigger to revisit: the approval loop stays closed for real tasks, and the friction ledger shows a repeat complaint that the operator still had to act on.
- The earlier mechanism-core line (a separate `mechanism` command plus `mechanism-effectiveness` and `usage-contract` schemas) was superseded by the lib-only mechanism core on master. It is retired and archived at tag `freeze/mechanism-core-20260915`.

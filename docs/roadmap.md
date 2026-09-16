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
- [ ] automatic proposal generation, shadow evaluation and canary/rollback records moved to the 0.5 plan below

## 0.4

- [x] runner identity: every mechanism run and closure names `runner_id`, `runner_sha256`, `invocation_contract_version`
- [x] evidence freshness: runner, adapter, bridge, case or validity change invalidates a verdict; `close`, `status` and preflight share one rule; `stale_verdict_escape_count = 0`
- [x] mechanical trust root: `scripts/verifier-pin.js` recomputes every pin and both halves of the trust root, refuses uncommitted artifacts unless declared, and warns when worktrees share the repository
- [x] portable profile: `examples/profiles/portable.profile.json` runs in a sandbox and must show at least one PASS and one FAIL; `tests/portable-profile.js` flips an expectation to prove the verdict follows the bytes
- [x] externally anchored facts: vendored npm artifact, PyPI artifact, PyPI JSON service digest and a git source blob, re-fetched and compared by `npm run check:anchors` (four channels)
- [x] operator loop without hand-written JSON: `scripts/approve.js` records the operator decision (and refuses an unattributed one), `scripts/mechanism-declare.js` admits case + mechanism against a registered verifier
- [x] live incident replay: the real esc-3 pid file truncated to 0 bytes, detected, refused and recovered (control 13)

## 0.5

- [x] canary and rollback records: a promotion names the run it rested on and refuses a verdict that is not `verified`/`closed`; when the evidence goes stale the mechanism is retired by a rollback record carrying the forcing fact, and preflight reports `stale_lifecycle_escape_count = 0`

## 0.6 (planned)

Ordered by what the current evidence can already support; each item needs the same PASS + FAIL shape before it is called done.
- [ ] shadow evaluation: compare recorded routing decisions with what was actually chosen and executed, once a real task stream exists to compare against
- [ ] automatic proposal generation from issue history: mechanical only; it produces candidates, no verdicts

## Deferred

- Selection / execution / outcome contracts and the operator-friction policy were designed on `experiment/selection-execution-outcome-contracts`; the branch is retired and the design is archived at tag `freeze/selection-execution-outcome-contracts-20260916` (`git switch -c <branch> freeze/selection-execution-outcome-contracts-20260916`).
- Trigger to revisit: the approval loop stays closed for real tasks, and the friction ledger shows a repeat complaint that the operator still had to act on.
- The earlier mechanism-core line (a separate `mechanism` command plus `mechanism-effectiveness` and `usage-contract` schemas) was superseded by the lib-only mechanism core on master. It is retired and archived at tag `freeze/mechanism-core-20260915`.
- Cross-repository privacy-preserving learning stays out: the product is a local capability manager for one operator, and shared learning would need a multi-party trust model we deliberately dropped.

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

## 0.6

- [~] shadow evaluation: `capability route` persists recommendations and `scripts/shadow-report.js` compares them with recorded actual usage (follow rate, divergences, outcome splits); the comparator refuses to print metrics while the actual stream is empty (`insufficient_real_stream`), so the number is pending a real consumer rather than fabricated
- [x] automatic proposal generation from issue history: `autoarmory evolve <issues.json> --format github` runs observe -> propose -> acquire -> gate mechanically (verified: one issue produced one incident, one candidate and a gate result)

> Version note: the 0.7 / 0.8 / 0.9 slots were not released before 1.0.0. Their content is delivered on the post-1.0 line as 1.1.0, 1.2.0 and 1.3.0: SemVer does not allow returning to a 0.x line after 1.0 has been published. The slot each release fills is named in its heading.

## 1.1.0 (roadmap slot 0.7)

- [x] portable anchor path: `scripts/lib/http-bytes.js` gives the repository its own audited byte fetcher (bytes unchanged, metadata + sha256 only, an audit line per fetch, https-only with a loopback exception), and `anchor-refresh` falls back to it when the machine guard wrapper is absent, so `npm run check:anchors` is runnable from a plain clone

## 1.2.0 (roadmap slot 0.8, planned)

- [ ] capability health as a projection of evidence: a capability whose evidence is stale or retired must not report `healthy`

## 1.3.0 (roadmap slot 0.9, planned)

- [ ] candidate-side rollback: a promoted candidate whose outcome evidence no longer reproduces is retired with the fact that forced it, and preflight reports the escape count

## 1.0

1.0 is not a feature; it is the statement that the local capability manager does what it claims. `scripts/acceptance-check.js` prints one PASS/FAIL per line, exits non-zero on any FAIL, and runs inside `npm test` (`npm run check:acceptance`):

- [x] a stranger can clone the repository and get PASS and FAIL verdicts offline (`npm test`, `node scripts/profile-run.js`)
- [x] external anchors from at least three channels re-verify (`npm run check:anchors`)
- [x] a verdict that cannot name its runner, or whose runner/case changed, is never reported verified or closed (`stale_verdict_escape_count = 0`)
- [x] a promotion cannot outlive its evidence (`stale_lifecycle_escape_count = 0`)
- [x] the operator loop needs exactly one human decision and no hand-written JSON (`tests/operator-loop.js`)
- [x] the shipped surface claims nothing it does not do: no cross-vendor control plane, `serve` is an internal, and the non-goals are written down (`docs/non-goals.md`)

## Deferred

- Selection / execution / outcome contracts and the operator-friction policy were designed on `experiment/selection-execution-outcome-contracts`; the branch is retired and the design is archived at tag `freeze/selection-execution-outcome-contracts-20260916` (`git switch -c <branch> freeze/selection-execution-outcome-contracts-20260916`).
- Trigger to revisit: the approval loop stays closed for real tasks, and the friction ledger shows a repeat complaint that the operator still had to act on.
- The earlier mechanism-core line (a separate `mechanism` command plus `mechanism-effectiveness` and `usage-contract` schemas) was superseded by the lib-only mechanism core on master. It is retired and archived at tag `freeze/mechanism-core-20260915`.
- Cross-repository privacy-preserving learning stays out: the product is a local capability manager for one operator, and shared learning would need a multi-party trust model we deliberately dropped.

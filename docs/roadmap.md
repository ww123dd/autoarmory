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

## 1.2.0 (roadmap slot 0.8)

- [x] capability health as a projection of evidence: `capability health` reads the mechanism state each capability points at, degrading to `degraded` when the verdict is gone and to `offline` when the proof was rolled back; the projection is additive (no mechanism reference, old behaviour)

## 1.3.0 (roadmap slot 0.9)

- [x] candidate-side rollback: `src/lib/candidate-lifecycle.js` recomputes hashed artifact evidence and retires a promoted candidate with `forced_by.artifact_mismatches` when it no longer reproduces; `scripts/mechanism-preflight.js` reports `stale_candidate_escape_count` and blocks with the exact command. Scope is stated: evidence without a hashed artifact is reported as `uncovered`, never as fresh, and never auto-retired

## 1.4.0

- [x] gap-first inventory: `scripts/inventory-scan.js` scans skills, MCP servers and the verifier profile read-only. It reports **facts only** (path, sha256, existence, registered ids) and lists `judgment_required` (trigger_curation, evidence_refs, task_types) instead of filling what it cannot judge, so a scan can never produce a registerable candidate. Falsifier (external): two scans agree, the scan covers exactly the SKILL.md files present, every recorded hash equals the file on disk, and changing one byte changes the hash. This machine: 50 candidates, 0 registerable, 50 needing judgment

## 1.5.0

- [x] in-toto-shaped attestations for vendored anchors (`subject` + `predicateType` + `predicate`), so third-party tooling can verify our evidence without reading our prose. The shell is the standard in-toto Statement shape; the predicate type is custom because the required SLSA `buildDefinition` / `runDetails` fields would not describe what we record.

## 1.6.0

- [x] trust-root lifetime and change governance: `pinned_at` / `rotate_by` with fail-closed expiry (no override flag), and `--allow-drift` now requires `--reason` and writes a drift journal entry.

## 1.7.0

- [x] execution provenance: `scripts/exec-record.js` captures exit code, duration, input hash and stdout/stderr hashes (never the text), records failures as `failure`, and links a record to a routing decision.

## 1.8.0

- [x] selection baselines over real decisions: `scripts/selection-baseline.js` replays the same stored request through router / first-eligible / keyword, refuses to print metrics without recorded actual usage, and never deploys the router.

## 2.0.0

- [x] lifecycle sweep over the whole inventory: `scripts/lifecycle-sweep.js` decides `retain` / `degrade` / `replace` / `retire` for mechanisms, promoted candidates and capabilities from records only, cites the deciding record on every row, and emits a projection with no self-reported fields.
- [x] fresh-clone release qualification: the `9376fb3` clone passed `npm test`, `check:acceptance`, `test:conformance`, `test:self-eval`, `check:anchors` and `check:attestations` from an ASCII path. A failed attempt from a non-ASCII path is recorded as a harness-location error, not a product verdict.
- [x] untracked experiments are not admitted: the unreferenced `examples/adapters/assert-absent/` experiment was archived outside the release instead of being shipped without a consumer or acceptance test.

## 2.0.1

- [x] public-surface correction: README is clone-first until the npm package exists, the canonical GitHub/Gitee links are on the first screen, package metadata points at the real repository, and the vendored SkillCanary README links back to the AutoArmory trust-root profile.

## 2.0.2

- [x] numeric boundary fix: `sampleBeta` now handles shapes below 1 with the standard gamma boost, refuses non-positive parameters, and is covered by `tests/sampling.js` across `0.01` through `2`.

## 2.0.3

- [x] vendored backport: `packages/skillcanary` is now `0.9.1` with the same Beta/Gamma boundary fix, a recorded backport note in `UPSTREAM.md`, refreshed `VENDOR.sha256`, and a boundary check in its test suite.

## 2.1.0

- [x] user-layer projection: `inbox`, `result`, `approve` and `status` expose only `case / verifier / run / lifetime`.
- [x] generic artifact intake: `intake artifact` hashes any upstream file, records revisions and leaves it unbound until an Agent binds a case and a verifier.
- [x] transition persistence repair: a candidate passed by file is stored before its pending-approval card is projected.
## 2.2.0

- [x] generic artifact binding: `bind artifact` attaches an intake record to an admitted case and an integrity-checked registered verifier, append-only.
- [x] user projection: bound artifacts appear as `ready_to_run` with `action=run` and `lifetime.state=bound`.
## 2.3.0

- [x] artifact run: `run artifact` creates/reuses the binding mechanism, executes the registered verifier through `mechanism-record`, records the run and closes the case on a passing external fact.
- [x] user projection: pre-run artifacts are `ready_to_run`; post-run artifacts project as `lifetime.state=approved`.
## 2.4.0

- [x] generic JSON assertion verifier: `json-assert` reads an external evaluator report and checks a dot/array path against a bounded assertion; missing files/paths fail closed.
- [x] real external evidence path: the local `skill-up` release-gate case `c1-ppr-caliber` produced `result.json`, and its `case_results[0].grading.summary.failed == 0` fact can now be re-derived by AutoArmory.
## 2.5.0

- [x] context budget ruler: deterministic byte/ref/orphan/appendix/link-depth metrics with a budget file and `context_budget_escape_count`.
- [x] audit mechanism: real transcript counts for unwanted skill loads, premature stops, unauthorized actions and missing traces; no LLM judge.
- [x] the Trigger Contract and DoD remain downstream: they are accepted only after this ruler exists.
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

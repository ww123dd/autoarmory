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

## 2.21.0

- [x] resolver matches only explicit verifier identity plus an assertion that expresses `expected_transition`.
- [x] 18 old candidates rerun as 0 `verified_candidate` / 18 `verifier_mismatch`; no fabricated candidate survives.
- [x] one history-derived run is closed with a transition-expressing verifier (`COUNT->>=3`).

## 2.20.1

- [x] Stop hook runs the scanner detached: hook returns immediately; scanner owns timeout and `shadow_gap`.
- [x] Append-only `last-run.jsonl` heartbeat makes missing/never-running shadow observable.
- [x] Event temp file is deleted after read; recursive Stop writes nothing.

## 2.20.0

- [x] Stop hook automatically scans the current session and writes incremental `case-drafts.jsonl` / `high-signal.json`.
- [x] Stop-facing output contains no verifier binding, run, closure or verdict; missing sessions/timeouts record `shadow_gap`.
- [x] Rerun is idempotent and the hook no longer needs a user-triggered scan.

## 2.19.1

- [x] declared inputs separated from projections: `scope`, `expires_at`, `reopen_trigger` vs `scope_sha256`, `scope_status`, `expiry_status`, `reopen_required`.
- [x] stale verification is a usable warning; expiry blocks verified/closed; a predicate hit requires reopen.
- [x] three machine negative controls: file change reopens, past `expires_at` blocks, different scope promotion is rejected.

## 2.19.0

- [x] optional mechanism scope/expiry/reopen trigger fields; no fifth object.
- [x] scope hash, equality and drift are mechanically checked; scope correctness is not claimed.
- [x] trigger predicates are limited to existing facts and free-text triggers are rejected.
- [x] status/promote/close/reuse all honor expiry, scope drift and reopen predicates.
- [x] legacy unscoped mechanisms remain viewable but cannot promote or reuse.
- [x] preflight six-count acceptance: unscoped promotion, out-of-scope reuse, expired reuse, legacy promotion, invalid trigger and reopen escape all zero.
## 2.18.0

- [x] Claude JSONL branch: user/assistant rows split into text, tool_use and tool_result events.
- [x] Tool linkage: `tool_use.id` ↔ `tool_result.tool_use_id`.
- [x] Raw/normalized accounting: 699/699 tool calls and 699/699 tool results on the real Claude session.
- [x] Fail closed: zero normalization exits 2 with `SESSION_SHADOW_EMPTY`; partial normalization exits 2 with `SESSION_SHADOW_PARTIAL`.
- [x] Negative fixture proves unsupported raw tool formats cannot silently succeed.
## 2.17.0

- [x] Hook Gate contract: ordinary Edit/Write records and continues.
- [x] Block only production/irreversible/external-side-effect actions without approval.
- [x] Block only completion/stop claims without a verifier reference.
- [x] Persist every hook decision to `hook-decisions.jsonl`.
- [x] Tests and sanitized evidence added; host registration remains external integration.
## 2.16.0

- [x] Change Inventory aggregate schema: `changed_files`, `commands`, `check_events`, `check_status`, `signals`, `cwd`, `turn_id`.
- [x] Real two-session shadow outputs: `changes.jsonl`, `check-gap-report.json`, `high-signal-changes.json`.
- [x] Mechanical verifier resolution only: registered verifier, project test, file hash and git state.
- [x] HTTP, SQL, process, DOM and build artifact remain `verifier_candidate`.
- [x] `validation-exec` routes test/build/HTTP/SQL commands through `exec-record`; unwrapped commands remain `exec_record_gap`.
- [x] Acceptance: `check_gap_path_computable=true`, `change_inventory_idempotent=true`, `edit_write_blocked_count=0`, `transcript_field_fabrication_count=0`.
## 2.15.0

- [x] standing change inspector: byte-offset increments, stable schema, idempotent reruns and empty inventory on no source.
- [x] honest result states: `check_seen`, `check_gap`, `command_result_passed`, `command_result_failed`, `result_text_unstructured`.
- [x] transcript fabrication guard: no exit code, stdout hash or stderr hash is inferred from unstructured text.
- [x] Edit/Write record-only policy: ordinary edits are inventoried and never blocked.
- [x] high-signal only: candidate drafts and notifications are suppressed unless risk, repeated failure or check gaps require attention.
- [x] `close_without_verifier_count=0`; `false_close_count=null` as a lagging indicator requiring future counterexamples.
## 2.14.0

- [x] session shadow v1: select sessions once, then extract rules and article decisions automatically.
- [x] current-session projection: collaboration rules, automation requirements and hook requirements.
- [x] article-session projection: URL-deduplicated decision ledger, case drafts, verifier bindings and unverifiable items.
- [x] real run: 184 user turns / 182 completions, 301 article decisions, 359 case drafts, 0 manual case/verifier/article labels.
- [x] closure boundary: no verifier match means no closure; the shadow report remains a candidate projection.
## 2.13.0

- [x] deterministic triage: external red/safety/data error/live conflict are `must_fix_now`; missing consumer/stop condition/outsourcing target are `backlog`.
- [x] low-impact gate: naming/docs/version/format/extra evidence is `only_if_decision_impact` unless a real decision impact is recorded.
- [x] theory gate: theoretical completeness with no real consumer is `do_not_do`.
- [x] fail-closed unknown: `needs_evidence` blocks instead of being silently downgraded.
- [x] CLI semantics: `--enforce` blocks only on `must_fix_now` and `needs_evidence`.
## 2.12.0

- [x] sanitized replay snapshot: source ids, real outcomes, cost/token facts and boundary fields only.
- [x] snapshot verifier: re-run `history.replayHistory` from the shipped snapshot and compare the derived report.
- [x] privacy boundary: no machine paths, prompts, stdout/stderr or response text.
- [x] re-derived evidence: same `replay_escape_count=0`, `tightening_rejection_count=10`, `cost_per_outcome=0.46244125`, `token_cost_per_closed_case=66448.75`.
## 2.11.0

- [x] runner usage ingestion: real `cli.json` + `grading.json` pairs become hash-bound usage records with cost, tokens, outcome and Skill invocation.
- [x] history replay cost policy: `skill-required` is replayed over real usage records; costs are observed, not inferred.
- [x] real cost metrics: 10 usage records, `cost_per_outcome=0.46244125`, `token_cost_per_closed_case=66448.75`.
- [x] no prompt/output/path leakage: only hashes and numeric facts are shipped.
- [x] aggregate hard gates remain `replay_escape_count=0`, `synthetic_record_count=0`, `llm_judge_calls=0`, `context_budget_escape_count=0`, `promotion=false`.
## 2.10.0

- [x] multi-stream replay: routing decisions, routing actuals, outcomes, mechanism runs and transitions are read separately; only real-outcome records enter replay.
- [x] source binding: every replay row carries `source_decision_id` plus the actual outcome record it used; transitions without a real outcome are excluded.
- [x] boundary selection: near pass/fail, repeated failure, near expiry, high-impact action and trigger conflict.
- [x] cost-aware metrics: `outcome_gain`, `cost_per_outcome`, `boundary_hit_rate`, `unwanted_agent_wakeups`, `token_cost_per_closed_case`; absent cost/token history is explicit.
- [x] real replay evidence: 13 mechanism runs + 1 routing decision, `replay_escape_count=0`, 4 tightening rejections, boundary hit rate 1, no promotion.
- [x] Context Budget is attached as a read-only audit component; `context_budget_escape_count=0` on the measured skill.
## 2.9.0

- [x] replay primitive: apply a stricter policy to already-recorded facts, never to a generated stream.
- [x] metric definitions: `replay_escape_count` is unsafe incumbent-reject/candidate-accept; `tightening_rejection_count` is the measured cost of stricter acceptance.
- [x] real replay: 13 mechanism runs, `mechanism-streak(min_passes=3)` gives 3 tightening rejections and 0 unsafe escapes; `count-half` returns `insufficient_real_stream` for missing count boundaries.
- [x] evidence boundary: sanitized metrics and source hash only; no private records, machine paths, synthetic records or LLM judge calls.
## 2.8.1

- [x] real trigger evidence: three real requests, baseline `0`, broken description `3`, `trigger_misfire_delta=3`, `trigger_regression_count=3`, restored `0`.
- [x] private-transcript boundary: only derived metrics and transcript SHA-256 hashes ship; local paths and response text do not.
- [x] evidence guard: `tests/trigger-regression-evidence.js` rejects impossible deltas, missing hashes, private paths and transcript leaks.
## 2.8.0

- [x] boundary policy: task classes own `stop_conditions`; case objects do not pretend a task-level stop rule is a case field.
- [x] action tiers: transition records label actions from the policy, reject unclassified actions and reject explicit tier conflicts.
- [x] rule taxonomy: every failure-mode rule carries one of `project-knowledge`, `risk-boundary`, `context-routing` or `done-criteria`; `unlabeled_rule_count=0`.
- [x] boundary audit: approval coverage, classification conflicts, missing stop conditions and the total escape count are derived from records, not self-reported fields.
## 2.7.0

- [x] done contract: `case.verifier` and `case.done_criteria` are optional at admission and mandatory at `close`; old records are not rewritten by a schema change.
- [x] one completion family: `closeCase` uses `src/lib/done-contract.js` to bind the case criteria, the registered verifier, and the same externally re-derived run.
- [x] closure evidence: every new closure records the criteria hash, contract source, `verification_gap_count` and the supporting run pointer.
## 2.6.0

- [x] trigger contract: the description must declare the nearest adjacent case it must not activate for; inventory and lint fail structurally when it is missing.
- [x] behavioral regression ruler: `scripts/trigger-regression.js` compares at least three replayed real requests and reports `trigger_misfire_delta` plus `trigger_regression_count`, without an LLM judge.
- [x] context limits now reuse the SkillCanary lint constants instead of new project thresholds.
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

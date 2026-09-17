# Changelog

## 2.12.0

History replay evidence is now independently re-derivable from a sanitized shipped snapshot.

- Added `src/lib/history-replay-snapshot.js` and `scripts/replay-snapshot.js`: create a snapshot from real streams and verify it by re-running the replay from the snapshot.
- Added `docs/evidence/history-replay-snapshot-20260917.json`: source ids, real outcomes, cost/token numbers and boundary fields only; no paths, prompts or runner text.
- The shipped snapshot re-derives the same real metrics: `replay_escape_count=0`, `tightening_rejection_count=10`, `cost_per_outcome=0.46244125`, `token_cost_per_closed_case=66448.75`.
- Added `tests/history-replay-snapshot.js`; an inconsistent snapshot, machine path or runner-text field fails the test.

## 2.11.0

Real cost and token streams enter history replay.

- Added `src/lib/runner-usage.js` and `scripts/ingest-runner-usage.js`: real `cli.json` + `grading.json` pairs become `usage-records.jsonl` with source hashes, cost, input/output/cache tokens, real outcome and Skill invocation.
- The usage importer stores no prompt, output text or machine path; it only keeps the hashes and numeric facts.
- History replay now reads `usage-records.jsonl` as a real stream and adds the `skill-required` candidate policy.
- Real replay over 13 mechanism runs + 1 routing decision + 10 usage records: `replay_escape_count=0`, 10 tightening rejections, `cost_per_outcome=0.46244125`, `token_cost_per_closed_case=66448.75`.
- `count-half` remains `insufficient_real_stream`; no cost or outcome was inferred where the stream was absent.
- Added sanitized `docs/evidence/cost-aware-history-replay-20260917.json` and a guard for private paths, details and promotion.

## 2.10.0

Boundary-aware history replay across real routing, outcome, mechanism and transition streams.

- Added `src/lib/history-replay.js` and `scripts/history-replay.js`: every replay record carries `source_decision_id` and a real outcome; transitions without an outcome are excluded rather than inferred.
- Added boundary selection for near-pass/fail, repeated failures, near-expiry, high-impact actions and trigger conflicts.
- Added cost-aware metrics: `outcome_gain`, `cost_per_outcome`, `boundary_hit_rate`, `unwanted_agent_wakeups` and `token_cost_per_closed_case`. Missing cost/token streams stay `null` with `insufficient_cost_stream`.
- Context Budget is now an audit component of the replay report; it measures only and never deletes.
- Real local replay: 13 mechanism runs + 1 linked routing decision, 4 tightening rejections, 0 unsafe escapes, boundary hit rate 1; `count-half` remains insufficient because no count boundaries exist.
- Added sanitized `docs/evidence/history-replay-20260917.json` and guards for no synthetic records, no LLM judge calls, no private records and no promotion.

## 2.9.0

Boundary-aware history replay: evaluate a stricter policy on recorded facts without inventing a stream or promoting the result.

- Added `src/lib/replay-policy.js` and `scripts/replay-policy.js`: replay `mechanism-streak` and `count-half` policies over JSON/JSONL records.
- Defined `replay_escape_count` as the unsafe case where the incumbent rejects but the candidate accepts; it must be zero. `tightening_rejection_count` separately records the incumbent-accepted/candidate-rejected cost of tightening.
- Defined `context_budget_escape_count` as the count of normative lint-limit violations for the measured skill; it must be zero.
- Real replay on the 13 local mechanism runs: `mechanism-streak(min_passes=3)` produced 3 tightening rejections and 0 unsafe escapes. `count-half` correctly returned `insufficient_real_stream` because those runs have no `count_before`/`count_after`.
- Added sanitized `docs/evidence/replay-20260917.json`; no private records, machine paths, synthetic records or LLM judge calls are shipped.

## 2.8.1

Real Trigger Contract evidence is now a shipped, mechanically checked artifact.

- Ran the same three real requests in `baseline -> overbroad description -> restored` order with the real Claude runner and the `Skill` tool.
- Result: baseline `unwanted_skill_loads=0`; broken description `unwanted_skill_loads=3`; `trigger_misfire_delta=3`; `trigger_regression_count=3`; restored description `trigger_regression_count=0`.
- Added `docs/evidence/trigger-regression-20260917.json`: only metrics and transcript SHA-256 hashes are shipped; private transcripts, machine paths and response text stay outside the repository.
- Added `tests/trigger-regression-evidence.js` to reject missing hashes, impossible deltas, private paths and transcript-content leaks.

## 2.8.0

Boundary Policy: stop conditions belong to the task class, actions carry a tier, and every rule carries one of four categories.

- Added `examples/boundary-policy.json` and `src/lib/boundary-policy.js`: three task classes declare their stop conditions and allowed action tiers; unknown actions fail closed at transition time.
- Transitions now persist `action`, `action_tier` and `action_classification_rule`; an explicit tier that contradicts the policy is refused.
- Every failure-mode rule carries `project-knowledge`, `risk-boundary`, `context-routing` or `done-criteria`; `unlabeled_rule_count` must stay zero.
- Added `scripts/boundary-audit.js` and `tests/boundary-policy.js`: they report `authorized_action_without_approval_count`, `action_classification_conflict_count`, missing stop conditions and `boundary_policy_escape_count` without using an LLM judge.
- `stop_conditions` are task-level policy, not case fields; the case keeps only `expected_transition`, `verifier` and `done_criteria`.

## 2.7.0

Done Contract: a case may be admitted without completion fields, but it cannot close without a verifier-bound, executable definition of done.

- Added optional `case.verifier` and `case.done_criteria` fields. Existing case records remain admissible; the contract is resolved and checked at `close` time rather than retroactively invalidating history.
- Added `src/lib/done-contract.js` as the single completion family used by `closeCase`, replacing the old standalone result/counterexample checks.
- `close` now requires explicit case criteria, the same registered verifier as the mechanism, evidence from the same run, a re-derived pass, no regression and a counterexample.
- Closures now carry `done_contract.done_criteria_sha256`, `contract_source`, `verification_gap_count` and an evidence pointer to the supporting run.
- Updated the mechanism, operator-loop, rollback, stale-verdict, capability-health, lifecycle and user-surface tests to carry the contract explicitly.

## 2.6.0

Trigger Contract and lint-backed context limits.

- Context Budget now derives `always_loaded_bytes`, `always_loaded_lines` and `description_chars` limits from the SkillCanary lint constants (`12 KiB`, `500` lines, `1024` characters) instead of project-invented thresholds.
- Skill inventory and lint now require an explicit negative trigger boundary (`when_not_to_use` / `【何时不用】` / `do not use for`) and report missing boundaries as a structural gap.
- Added `scripts/trigger-regression.js`: it compares the same at least three real audit requests, reports `trigger_misfire_delta` and `trigger_regression_count`, and fails when a broken description does not increase misfires or a restored description does not return the count to zero.
- Added `tests/trigger-contract.js` and `tests/inventory.js` coverage for the structural contract and the three-request regression rule.

## 2.5.0

Context Budget + Audit Mechanism: the first deterministic ruler for skill context and real trace behavior.

- Added `scripts/context-budget.js` and `examples/context-budget.json`: measures `always_loaded_bytes`, `referenced_bytes`, `orphan_bytes`, `appendix_bytes`, `referenced_file_count`, `orphan_file_count`, `max_link_depth` and `total_bytes`. A budget file can expose `context_budget_escape_count`.
- Added `scripts/audit-trace.js`: reads real Claude/Codex transcript JSONL and counts `unwanted_skill_loads`, `premature_stop_count`, `unauthorized_action_count` and `audit_trace_missing_count`; it does not use an LLM judge.
- Added `tests/context-budget.js` and `tests/audit-trace.js`; both are wired into `npm test`.
- This version is deliberately before Trigger Contract and DoD: hash changes and required fields are not treated as trigger or completion quality.
## 2.4.0

Generic JSON assertion verifier, so an external evaluator's machine-readable report can be judged without a product-specific adapter.

- Added `examples/adapters/json-assert/bridge.js`: reads a JSON report and asserts a dot/array path against `eq`, `ne`, `gt`, `gte`, `lt`, `lte` or `exists`. Missing files and missing paths fail closed.
- Added `tests/json-assert.js`: positive, negative, array-path, missing-file and empty-config cases; wired into `npm test`.
- The real `skill-up` run of `c1-ppr-caliber` produced `result.json`; the new bridge can now evaluate `case_results[0].grading.summary.failed == 0` as an external fact instead of trusting the runner's prose.
## 2.3.0

The first user-level run path is complete: an artifact can be hashed, bound and judged without hand-written mechanism JSON.

- Added `autoarmory run artifact <artifact-id>`: it creates or reuses the mechanism implied by the binding, executes the registered verifier, records the run and closes the case when the external fact passes.
- `run` reuses `scripts/mechanism-record.js`; it does not introduce a second execution path or a runner-specific adapter.
- Bound artifacts that have not run appear as `ready_to_run` with `action=run`; after a passing run they project as `lifetime.state=approved`.
- `tests/user-surface.js` now drives intake -> bind -> run -> closed result end to end.
## 2.2.0

Generic artifact binding: an upstream file can now be attached to a case and a registered verifier without a product-specific adapter.

- Added `autoarmory bind artifact <artifact-id> --case <case-id> --verifier <verifier-id> [--case-file case.json]`.
- Binding is append-only in `artifact-bindings.jsonl`; it does not rewrite the intake record.
- The case must exist or be admitted from `--case-file`; the verifier must be registered and pass its integrity check.
- The user layer now exposes `ready_to_run`: `case / verifier / run / lifetime`, with `action: run` and `lifetime.state: bound`.
- `tests/user-surface.js` now covers intake -> case admission -> verifier binding -> ready_to_run projection.
## 2.1.0

User-layer projection and generic artifact intake.

- Added `autoarmory inbox`, `autoarmory result`, `autoarmory approve` and `autoarmory status`: the operator sees `case / verifier / run / lifetime`, not the internal mechanism/transition/evidence objects.
- Added `autoarmory intake artifact <descriptor.json>`: any upstream file can be hashed, revisioned and recorded without a product-specific adapter. The record stays unbound until an Agent binds a case and a verifier.
- Fixed `transition <candidate.json>` to persist the candidate when `candidates.jsonl` does not exist yet, so a pending approval cannot disappear from the user layer.
- Acceptance `tests/user-surface.js`: artifact hash and revision behavior, tampered declaration refused, four-field result card, inbox/status projections, and approval delegation.
## 2.0.3

Vendored SkillCanary backport: the frozen package now carries the same numeric boundary fix as the root runtime.

- Backported the `sampleBeta(alpha<1/3)` fix into `packages/skillcanary` and bumped the vendored package from `0.9.0` to `0.9.1`.
- `packages/skillcanary/UPSTREAM.md` records that this is a security backport from upstream `0.19.1`, not a pure upstream import.
- Updated `VENDOR.sha256` for every changed vendored file, and wired the boundary check into the vendored test suite.

## 2.0.2

Numeric boundary fix for Thompson sampling.

- Reproduced the reviewer's counterexample: `sampleBeta(0.01/0.1/0.3, ...)` returned `NaN`; the old Marsaglia-Tsang gamma sampler is only valid for `shape >= 1`, and clamping to `0.0001` did not fix it.
- Moved sampling into `src/lib/sampling.js`; shapes below 1 now use the standard `Gamma(shape+1) * U^(1/shape)` boost, `alpha`/`beta` must be positive, and a zero/NaN denominator fails closed to `0.5` instead of poisoning routing scores.
- Added `tests/sampling.js` (200 seeded draws for each of `0.01`, `0.1`, `0.3`, `0.34`, `1`, `2`; boundary pairs; invalid-parameter refusal; seed reproducibility). The test is wired into `npm test`.
## 2.0.1

Public-surface correction: the repository no longer advertises an npm install before the package exists.

- README now starts with the clone-first path (`git clone`, `profile-run`, `demo`) and explains that the run must show one PASS and one FAIL.
- Added canonical GitHub and Gitee links, repository/homepage/bugs/publishConfig metadata, and verifier/trust-root/change-gate keywords to package metadata.
- The vendored SkillCanary package README now links back to the AutoArmory trust-root profile, so the smaller public repo cannot hide the larger verification layer.
- npm publication remains the one credential-gated step: `npm whoami` is not authenticated, and both package names are still unpublished.

## 2.0.0

Lifecycle sweep over the whole inventory: each retain/degrade/replace/retire verdict cites the record that decides it.

- Added `scripts/lifecycle-sweep.js`: it reads mechanisms, promoted candidates and capabilities, decides `retain` / `degrade` / `replace` / `retire` from `mechanism-status`, `candidate-evidence` and `capability-health`, and carries the deciding record and reason on every row. It is a read-only projection and emits no self-reported fields.
- Acceptance `tests/lifecycle-sweep.js`: a stale promoted candidate is retired by its artifact mismatch, a current candidate is retained, a healthy mechanism is retained, and every verdict cites its deciding record.
- Fresh-clone qualification passed all six gates at `9376fb3` when the clone path was ASCII. An earlier clone under a path containing non-ASCII characters crashed inside Node 24.14 `fs.cpSync` with `0xC0000409`; that is recorded as a harness-location error, not a product verdict, and the clean re-run is the release evidence.
- The untracked `examples/adapters/assert-absent/` experiment was not admitted: it is archived outside the release and is not part of this version's trust surface.

## 1.8.0

Selection baselines: the router is measured against alternatives on the same real decisions, and never deployed by this tool.

- Added `scripts/selection-baseline.js`: replays each stored `routing-decision` request through three strategies - the router, `first-eligible` and `keyword` - and compares each pick with the recorded actual usage and outcome. With no recorded actual usage it reports `insufficient_real_stream` and prints **no metrics**; the state files are never modified.
- First real result (n=1, replay only): router agreement 1.0, first-eligible 1.0, keyword 0.0 - the keyword strategy did not pick the capability that was actually used. One data point, not a benchmark.
- Acceptance `tests/selection-baseline.js`: three strategies on two replayed decisions with router agreement 0.5, the divergence named, state hashes unchanged, and an empty stream producing `insufficient_real_stream`.

## 1.7.1

- Fixed a real defect the fresh-clone qualification caught: `tests/anchor-and-exec.js` copied the gitignored local profile, so `npm test` failed in any clone while passing on the machine that had one. The expiry half is now guarded by `fs.existsSync(localProfile)` and prints why it is skipped; the exec-record half always runs. The 1.6.0 and 1.7.0 release logs keep their `npm test=1` line, with an appended correction note - the error stays in the evidence instead of being overwritten.
- Committed the `--reason` fix to `tests/verifier-pin.js` that the new drift rule requires.

## 1.7.0

Execution provenance: what actually ran, recorded as facts that can be re-checked - never as output text.

- Added `scripts/exec-record.js -- <cmd> [args]`: records `input_sha256` (command line + arguments + selected environment keys), `output{stdout_sha256,stderr_sha256,stdout_bytes,stderr_bytes}`, `exit_code`, `duration_ms` and `outcome`, plus `--link-decision <request_id>` so the record can feed shadow evaluation.
- The output text is never stored - only its hash and byte count - and the recorded process keeps its own exit code, so a failing command is recorded as `failure` rather than dropped. `tests/anchor-and-exec.js` asserts both, including that the `output` object may only carry hash/size fields.

## 1.6.0

The trust root gets a lifetime, and its escape hatch gets a record.

- Every re-pin stamps `<anchor>.meta.json` (`pinned_at`, `rotate_by` = +180 days). `verifier-preflight` fails closed once `rotate_by` has passed - **there is no expiry override flag**, and the test greps for the literal flag to prove it. TUF lesson: a trust root that never expires is one nobody rotates.
- `--allow-drift` is kept (legitimate after a deliberate profile replacement) but is no longer a silent escape: it now **requires `--reason "<why>"`** and appends `{previous_anchor, next_anchor, reason, at}` to `<anchor>.drift.jsonl`, so a re-pin can be audited afterwards.
- Fixed a syntax break I introduced in the same file last round (`verifier-pin.js` threw on load, which is what made `npm test` red); verified with `node --check`, the focused suites and the full acceptance.

## 1.5.0

Attestations: the vendored anchors are now in-toto Statements, so third-party tooling can parse them without reading our prose.

- Each `*.provenance.json` gained the in-toto shell: `_type: https://in-toto.io/Statement/v1`, `subject[{name,digest.sha256}]` (the bytes we ship) and a **custom** `predicateType: https://autoarmory.dev/attestation/upstream-artifact/v1` with `predicate` holding the publisher, URL, published field/digest and fetcher. `slsa.dev/provenance/v1` was deliberately not used: its required `buildDefinition`/`runDetails` do not describe what we record.
- Added `scripts/check-attestations.js` (`npm run check:attestations`, wired into `npm test`): every statement must use the statement type, our predicateType, a subject digest equal to the artifact bytes, and a predicate consistent with the flat record. Current result: 4 statements verified.
- Signing is explicitly out of scope until a second party exists; the shell is what lets other tooling read us today.

## 1.4.1

- Inventory corrected per review: the scan reports facts only (path, sha256, existence, registered ids) and lists `judgment_required` (trigger_curation, evidence_refs, task_types) instead of filling what it cannot judge; `registerable` from a scan is now 0 by construction.
- The `≥N` acceptance is replaced by an external falsifier: two scans must agree, the scan must cover exactly the SKILL.md files that exist, every recorded hash must equal the file on disk, and changing one byte must change the hash.
- Brought forward from 2.0: the acceptance now also checks that generated reports carry no self-reported fields (`verified_by` / `self_reported` / "independent") and that the shipped surface contains no machine absolute paths (excluding the vendored `packages/skillcanary`).

## 1.4.0

Gap-first inventory: the scan measures what the operator actually has, and reports what is missing instead of dressing it up.

- Added `src/lib/inventory.js` + `scripts/inventory-scan.js`: a read-only scan of installed skills (`~/.codex/skills`, `~/.claude/skills`), MCP servers (`~/.codex/mcp.json`) and the local verifier profile. Each candidate carries its source path and sha256, the trigger text harvested from its own metadata, and the evidence that could prove it. MCP entries contribute name, command basename and argument count only - never an env value.
- `readiness` reports gaps instead of assuming readiness: on this machine the scan found 50 candidates (39 skills, 2 MCP gateways, 9 verifiers), 9 registerable and 41 with gaps (`no_evidence` 41, `no_task_types` 50, `no_trigger` 3). That number is the honest size of the remaining work.
- Added `tests/inventory.js`: trigger comes from metadata, a missing description is a gap, env values never reach the output, verifiers carry evidence_refs, the scan leaves every input hash unchanged, and `--write` is the only thing that writes.

## 1.3.2

- The `no-unimplemented-claims` criterion no longer stops at vocabulary: every `autoarmory <command>` the README documents must exist in the CLI command table, or have that line marked internal/legacy/optional. Current result: `documented_commands=22 missing=none`.
- Proved the check has teeth: appending a fake `autoarmory teleport` line flips the criterion to FAIL with `missing=teleport` (criteria 5/6, exit 1), and restoring the README returns 6/6.

## 1.3.1

- The acceptance check now validates every metric the commit gate reports: `stale_candidate_escape_count` joins the freshness criteria (must be 0 when local state exists) and `uncovered_candidate_evidence` is surfaced as informational, so the acceptance can no longer be narrower than the gate it summarises.

## 1.3.0

Roadmap slot 0.9: the candidate state machine gets the rule mechanisms got in 0.5 - a promotion does not outlive the evidence it rested on.

- Added `src/lib/candidate-lifecycle.js`: a promoting transition that carries `evidence.artifacts[]` with a `sha256` is recomputed against the repository; a mismatch retires the candidate with `forced_by.artifact_mismatches` (path, expected, actual). Rollback is idempotent and only ever touches a promoted candidate whose hashed evidence no longer reproduces.
- Added `scripts/candidate-lifecycle.js` (`--list`, `--rollback-if-stale`).
- `scripts/mechanism-preflight.js` now reports `stale_candidate_escape_count` and `uncovered_candidate_evidence`, and blocks with the exact command while a promoted candidate outlives its hashed evidence.
- Honest scope: only hashed artifact evidence is recomputable. A promotion resting on before/after observations is reported as `uncovered` - never as fresh, and never retired automatically, because nothing can be re-derived from it. `tests/candidate-rollback.js` drives reproducing=0, mutated=1 escape plus BLOCK, rollback with `forced_by`, a fresh candidate promoting again, and uncovered evidence staying uncovered.

## 1.2.0

Roadmap slot 0.8: capability health stops being a claim of its own and becomes a projection of the evidence behind it.

- `capability.healthRows(capabilities, { evidence })` now reads the mechanism state a capability points at through `evidence_refs`: a retired mechanism takes the capability `offline`, a mechanism whose verdict is no longer `verified`/`closed` degrades it, and a live verdict keeps it `healthy`. Each row carries the `reason` and the `evidence` it checked.
- `autoarmory capability health` builds that evidence map from the local mechanism state, so `healthy` cannot survive its own proof: `tests/capability-evidence-health.js` drives promoted=healthy, stale=degraded, retired=offline, and a capability with no mechanism references keeps the old behaviour (the projection is additive).

## 1.1.0

Roadmap slot 0.7: the anchor path no longer depends on machine-local tooling, so a clone can re-verify its own anchors.

- Added `scripts/lib/http-bytes.js`: an in-repo audited byte fetcher (https only, plus a loopback exception for tests) that writes bytes unchanged, prints only metadata plus a sha256, and appends an audit line per fetch. `scripts/anchor-refresh.js` prefers the machine guard wrapper when it exists and falls back to this path otherwise, so `npm run check:anchors` works on a machine that never installed the guard.
- Added `tests/http-bytes.js`: bytes identical on disk, sha256 and audit line recorded, body suppressed from stdout/stderr, plaintext http to a remote host refused, a fetch without `--output` refused.
- Verified the fallback end to end: with `AGENT_GUARD_EGRESS` pointing at a nonexistent file, `anchor-refresh --fetch` still verified all four channels and wrote its own audit line.

## 1.0.1

- Fixed the acceptance check passing vacuously: criteria 3 and 4 now *demonstrate* the freshness rules by running `tests/stale-verdict.js` and `tests/rollback.js` (requiring `stale_verdict_escape_count=0` and a rollback that closes the loop) instead of reporting PASS when a checkout has no mechanism state, and they still fold in the local state metric when it exists.
- First real shadow record: the router was used for a genuine decision - which verification path gates the 1.0.1 anchors - over two registered, real capabilities (`verifier.offline-sandbox`, `verifier.live-refresh`). It recommended the offline path, the offline path was what ran (`node scripts/anchor-refresh.js`, 4/4 `OFFLINE-OK`), and the usage was recorded with `--source agent`. `shadow-report` now prints `follow_rate=1 (n=1)`: one decision, one attributed actual, no divergence. n=1 is a first data point, not a benchmark.

## 1.0.0

Acceptance: the local capability manager does what it claims, and every claim is checked mechanically by `npm run check:acceptance`.

- Added `scripts/acceptance-check.js`: six criteria from the roadmap (portable profile with PASS and FAIL offline, external anchors from at least three channels, `stale_verdict_escape_count = 0`, `stale_lifecycle_escape_count = 0`, an operator loop needing exactly one human decision, and a shipped surface that claims nothing it does not do). One PASS/FAIL line each, non-zero exit on any FAIL, and the check runs inside `npm test`.
- 1.0 states the boundary as well as the capability: the product is a local capability manager for one operator; it is not a cross-vendor control plane, it does not ship a multi-skill router or a generic memory system, and `serve` remains an internal.

## 0.6.0

Routing decisions become durable, and the router is judged against what actually happened instead of against itself.

- `autoarmory capability route <request.json>` persists every recommendation to `<state>/routing-decisions.jsonl` (a decision that is not durable cannot be evaluated later).
- Added `scripts/shadow-report.js`: `--record` appends an attributed actual usage (`--source operator|agent|service` is required, an unattributed observation is refused), and the default mode compares recommendations with real usage - follow rate, divergence list and outcome splits per group. With no actual stream it prints `shadow_status: insufficient_real_stream` and **no metrics at all**; a follow rate invented from an empty stream would be a fabricated number.
- Added `tests/shadow.js`: durable recommendation, empty stream = no metrics, unattributed = refused, `follow_rate=0.5` with outcome splits, unlinked actuals surfaced.
- Verified the issue-history automation end to end: `autoarmory evolve <issues.json> --format github` runs observe -> propose -> acquire -> gate (1 issue -> 1 incident -> 1 candidate -> gated) with no hand-written step.

## 0.5.0

Lifecycle closure: a verdict is not a promotion, and a promotion does not outlive the evidence that justified it.

- Added `mechanism.promote` / `rollbackIfStale` / `lifecycle` / `staleLifecycleEscapes`: a promotion names the run it rested on, refuses a verdict that is not `verified`/`closed`, and is retired by a rollback record carrying the fact that forced it (`status`, `reason`, `latest_run_id`, `runner_sha256`, `case_sha256`).
- Added `scripts/mechanism-lifecycle.js` (`--promote`, `--rollback-if-stale`, `--list`) so the action is mechanical rather than a hand-written script.
- `scripts/mechanism-preflight.js` now reports `stale_lifecycle_escape_count` and blocks with the exact command while a promoted mechanism outlives its evidence; a retired mechanism is a closed loop, not an unhandled failure.
- Added `tests/rollback.js`: promote, healthy (no rollback), stale promoted (BLOCK, count 1), rollback (recorded + idempotent), after rollback (0 + pass), recovery (re-promoted), stale promotion (refused).

## 0.4.0

Verification closure: a verdict may only claim success while the same runner, through the same fixed contract, re-derives the same fact; the shipped profile proves it to a stranger with facts anchored outside the repository.

- Repositioned AutoArmory as a local capability manager for one operator: the cross-vendor control-plane claim and the public `serve` entry were downgraded to optional internals.
- Expanded the local verifier profile to eight heterogeneous fact sources, added `scripts/verifier-pin.js` for mechanical re-pinning, and added `tests/verifier-bridges.js` to enforce thin bridges.
- Added a fourth anchor channel: a read-only service body (`https://pypi.org/pypi/six/1.16.0/json`) whose published `urls[].digests.sha256` is the value the vendored PyPI artifact must reproduce, plus `scripts/anchor-refresh.js` (`npm run check:anchors`), which re-fetches every anchor through its declared channel and compares the fresh bytes with the vendored ones.
- Added a third anchored channel: `examples/anchors/ms-2.1.3-index.js` is the source blob at the commit the npm publication names as `gitHead` for `ms@2.1.3`, its git object id is the published value, and it is byte-identical to `package/index.js` inside the vendored npm tarball (cross-checked by the test). The portable profile now carries eight facts, three of them anchored outside the repository.
- Added a second externally anchored portable fact from a different publisher: `examples/anchors/pypi-six-1.16.0.tar.gz` is vendored byte for byte from PyPI, its published sha256 is recorded in the artifact provenance record, and the portable profile pins the bytes. Anchors now span two publishers (npm registry, PyPI).
- Added the first externally anchored portable fact: `examples/anchors/ms-2.1.3.tgz` is vendored byte for byte from the npm publication of `ms@2.1.3`, its registry-published sha512 is recorded in `examples/anchors/README.md`, the profile pins its sha256, and `tests/portable-profile.js` re-checks the published integrity against the vendored bytes.
- Added `scripts/approve.js` (records the operator decision; refuses an approval without the operator own words) and `scripts/mechanism-declare.js` (admits a case and registers a mechanism, refusing an unregistered verifier), so the operator loop runs end to end without hand-written JSON. `tests/operator-loop.js` drives it: 7 steps, 6 mechanical, 1 operator decision.
- Pinned artifacts that are not committed are now refused by `scripts/verifier-pin.js` unless they are declared with `--allow-untracked`, and are reported as local-only by the pin tool, `scripts/verifier-preflight.js` and the scorecard. `verifier-pin` also warns when several worktrees share the repository, because re-pinning invalidates the other sessions recorded runs.
- Bound every mechanism run and closure to a runner identity (`runner_id`, `runner_sha256`, `invocation_contract_version`) and to the case it judges (`case_sha256`): close, status and preflight now share one freshness rule, a changed runner or a rewritten case can no longer keep a case closed, and `stale_verdict_escape_count` is reported as 0.
## 0.3.0

- Rebranded the public package and CLI to AutoArmory.
- Kept `selfforge` and `self-forge` as compatibility CLI aliases.
- Kept `.selfforge/` state storage and `selfforge/*` schema namespaces stable for backward compatibility.
- Added the Capability Manager architecture specification.
- Merged SkillCanary into the AutoArmory monorepo as `packages/skillcanary` with a unified `autoarmory canary` command.
- Added capability registry, health, routing, portfolio, outcome learning, drift, conformance and retirement.
- Added guarded policy calibration and off-policy evaluation.
- Added article and OTel GenAI incident adapters, a failure-mode taxonomy and external agent-evaluation standards mapping.
- Added a deterministic self-evaluation command with Pass^k checks and explicit self-assessment bias disclosure.
- Added the AutoArmory demo, Capability Routing Bench and SkillGrade/promptfoo/SARIF/ContextForge/OTel imports.
- Added an admission gate with explicit observed/candidate/admitted/rejected/duplicate statuses.
- Added coding/support/research scenario profile contracts and capability gap planning.
- Added a local HTTP control-plane API, SDK client, Team CLI integration example, playground and adapter contract.
- Added an executable pre-commit change gate (`scripts/change-gate.js`) plus `npm run hooks:install` and reverse tests.
- Hardened the local HTTP API: write endpoints are read-only by default, require `--allow-write`, and require a per-start bearer token; wildcard CORS was removed.

## 0.2.0

- Added JUnit, GitHub issue, log and JSONL observation.
- Added stdin observation for real runner logs, JUnit XML and GitHub issue JSON output.
- Added environment fingerprints.
- Added sequential experiment comparison.
- Added shadow and canary plans.
- Added Thompson policy recommendations with uncertainty.
- Added candidate acquisition scoring.
- Proxied `gate` and `evolve` to the real SkillCanary gate with fail-closed dependency handling.
- Added the `candidate.change` contract and real adapter conformance tests.
- Required gate proof, environment fingerprints and outcome evidence for recorded decisions.
- Added the append-only shadow, canary, promoted and rejected transition state machine.
- Added the `evolve` orchestration command.

## 0.1.0

- Initial observe/propose/gate/learn loop.
- Added SkillCanary dependency adapter.

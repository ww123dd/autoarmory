# Changelog

## 2.41.0

Stop the Stop-path write amplification.

- Canonical `change-records.jsonl` and `change-inventory.jsonl` are append-only again; the post-append `dedupeJsonl` full rewrites were removed.
- `writeText`/`writeJson`/`writeJsonl` accept `{backup:false}`, and large canonical/projection writes no longer create `.bak` copies.
- Added `writeProjection`: projections are content-addressed snapshots plus a latest pointer/hardlink, so unchanged projections reuse the existing snapshot and do not grow a second full copy.
- `stop-shadow` case drafts and decision-scan projections now use `writeProjection`.
- Added per-session state files (`change-inspector/sessions/<hash>.json`); global `state.json` no longer carries global `seen_ids`/`signatures` maps, and Stop appends only the increment.
- Added read-time dedupe (`readJsonlDedup`) for canonical readers, so duplicate rows are tolerated without whole-file rewrites.
- Added `tests/storage-amplification.js`: append-only canonical, no large `.bak`, snapshot reuse, read-time dedupe and per-session state.
## 2.40.5

Convert extracted structured results into derived transitions.

- `result-extractor.deriveTransitionCandidates()` maps structured results back to change drafts via `source_ref -> change record -> change_id`, normalizes the command family, and emits derived TEST->PASS / TEST->FAIL or the matching family transition.
- `transition-propose` merges structured-result transitions with command/exec/history candidates; derived wins over candidate for the same change.
- Real current state after processing all available session transcripts: 30369 structured results extracted, transition_derived_count=1114, ready_for_verifier_count=138, invalid_provenance_count=801 (all missing_expected_provenance), true_no_capability_count=1700.
## 2.40.4

Make decision-scan reports self-identifying.

- `decision-scan` reports `generated_at`, `commit`, `limit`, and `source_records`; `summary.json` inherits the same fields.
- Regression test requires the metadata fields to be present.
- This prevents later reviewers from trusting a stale summary without knowing its source revision or scan bound.
## 2.40.3

Extract structured results deterministically and classify invalid provenance.

- Added `src/lib/result-extractor.js` / `scripts/result-extract.js`: deterministic parsing of exit codes, npm errors, passed/failed summaries, PASS/FAIL and ok; ambiguous text stays unstructured.
- Added `src/lib/provenance-validator.js` / `tests/provenance-validator.js`: invalid provenance is classified as missing/unreadable ref, unsupported kind, hash mismatch, approval missing, commit missing, pinned verifier missing, or missing expected provenance.
- `decision-scan` reports `invalid_provenance_by_category`, `exec_records_written_count`, `derived_from_history_count`, and pinned/baseline provenance resolution rates.
- Real current state: structured results extracted=1; exec-records written=1; derived_from_history=3; pinned verifier resolved 99/99; invalid provenance is classified rather than collapsed into one number.
## 2.40.2

Report physical provenance and future/history supply metrics.

- `decision-scan` now reports `baseline_manifest_resolved_rate`, `pinned_verifier_resolved_rate`, `exec_records_written_count`, `derived_from_history_count` and `invalid_provenance_count`.
- Real current state: pinned_verifier claims 99/99 resolved; exec-records written 1; derived-from-history transitions 3; invalid provenance 1310. No real baseline_manifest claim exists yet, so its rate is null rather than being inferred.
## 2.40.1

Keep transition candidates cumulative across proposal runs.

- `transition-propose` now reads the full current draft projection, strips prior transition projections, and merges new command/exec/history candidates with the existing `transition-candidates.jsonl` instead of overwriting it with only the current missing subset.
- Derived candidates win over command-shaped candidates for the same change; declared claims stay authoritative.
- Real state after the fix: transition_present=2639, derived=158, ready_for_verifier=99, missing_transition=7711.
## 2.40.0

Add the first registry supply from the transition queue: `project-test-result`.

- Added `examples/adapters/project-test/bridge.js` and `scripts/verify/state-query-instance.js`: a pinned instance-capable adapter lets the claim supply `command`/`cwd` while the allowlist, assertion, timeout and bridge digest stay in the trust root.
- Added `project-test-result` capability: `TEST->PASS`, `test-command`, required `command+cwd`, `pinned_verifier` provenance, owner `repo-owner`.
- `decision-scan` now upgrades derived test transitions to `pinned_verifier` when the matched capability allows it, so derived TEST->PASS claims can reach `ready_for_verifier`.
- Real state ready count rose from 1 to 98 after the first TEST family supply; one real TEST->PASS loop was closed through the new verifier with `session_link_status=linked`, `valid-pass`, and `load-gate=allow`.
- `history-runner` is idempotent when a deterministic case/mechanism already exists from a previous failed attempt; it reuses the same claim identity instead of failing at declaration.
## 2.39.2

Make expected provenance physical and normalize commands before transition proposal.

- Added `baseline-manifest.json` validation: `baseline_manifest` claims must name a `baseline_id`, the referenced file must exist, and its SHA-256 must re-derive. Missing manifest, missing file or hash drift blocks the claim.
- Added provenance checks for `pinned_verifier`, `commit` and `owner_approval`; unknown provenance fails closed.
- Added `src/lib/command-normalizer.js` and `tests/command-normalizer.js`: meta/read/search/write/native/indirect commands are separated from verifier-bearing families (`test`, `hash`, `git`, `process`, `http`, `sql`, `file_enumeration`, `build`).
- Added `src/lib/exec-record-flow.js`: future `exec-records.jsonl` records with `exit_code` become derived transitions; records without exit code stay unverifiable.
- Added `src/lib/historical-derived.js`: passed mechanism runs + closures can feed derived transitions with run/closure evidence.
- Added `tests/provenance-gate.js`, `tests/exec-record-flow.js`, `tests/historical-derived.js`, `tests/baseline-manifest.js`.
## 2.39.1

Separate missing transitions from true no_capability and propose transitions from command shape.

- `decision-scan` now emits `missing_transition`, `true_no_capability`, `blocked_by_owner`, `blocked_by_expected_provenance`, `blocked_by_access` and `ready_for_verifier` as separate buckets. `missing_transition` is no longer counted as no_capability.
- Added `scripts/transition-propose.js` / `src/lib/transition-proposer.js`: command normalization skips meta commands (`cd`, encoding setup, file writes, search/read commands) and proposes transitions only for real verifier command families.
- Transition candidates carry `transition_source`, `source_strength`, `evidence_refs` and `observed_facts`; declared/derived may feed ready candidates, candidate stays draft-only.
- Real state after proposal: missing_transition 10349 -> 6285; transition_present 4064; trusted transitions 338; true_no_capability 3763; ready_for_verifier 1. The no_capability_rate is no longer the improvement metric; missing_transition_count is.
## 2.39.0

Turn no_capability into a ranked registry-supply queue.

- Added `scripts/no-capability-clusters.js` / `src/lib/no-capability-clusters.js`.
- Mechanical clustering covers command family, script path, file extension/prefix, signals, claim shape, access requirement, provenance and session provenance.
- Output is `decision-scan/no-capability-clusters.json` with size, coverage, exemplars, common files/commands, suggested verifier kind, required inputs, expected provenance, mechanical feasibility, access and owner requirements.
- Real state result: 10307 no_capability drafts -> 159 clusters; top-10 coverage 0.849; no_capability_rate 0.999903.
- No registry expansion in this version; the cluster report selects the next verifier kind.
## 2.38.1

Re-anchor the old plan and add strict JSONL reading.

- Roadmap is anchored to 2.38.0; sections 2.24–2.27 are explicitly historical and each task is marked completed/partial/not done.
- Added `readJsonlStrict`: missing file throws, empty file returns `[]`, partial/invalid JSONL throws. It does not fall back to `.bak`.
- Added positive/negative coverage in `tests/jsonl-strict.js`.
## 2.38.0

Add automatic mechanism recheck and the Claude Stop hook.

- Added `scripts/mechanism-recheck.js` / `src/lib/mechanism-recheck.js`: recomputes `mechanism.status`, runner freshness, artifact drift, expiry and reopen triggers; only mechanisms with a registered verifier and complete claim identity are enqueued, and the existing history-runner consumes them.
- Stop-shadow now drains mechanism rechecks in the background instead of running history-runner directly, so stale registered verifiers can be re-run without registering new verifiers.
- Connected the Claude Stop hook in `~/.claude/settings.json` to `scripts/stop-shadow.js`, alongside SkillCanary. Claude tool-use/tool-result rows normalize through the existing Claude path, and `tests/claude-stop-hook.js` verifies Stop -> stop-shadow -> normalized change record.
- Added `tests/mechanism-recheck.js`: stale registered mechanism -> pending recheck job, claim identity required, idempotent rerun.
## 2.37.0

Add observation mode, labeled resolver benchmarking, and the first real unattended closed loop.

- Added `scripts/observe-claim.js` / `src/lib/observation.js`: readonly verifier observations write `observation-records.jsonl` with `authority=none`, `activates_case=false`, `gate_effect=none`, and never write pending/runs/closures/reuse-records.
- Added `docs/evidence/resolver-label-set-v1.jsonl` and `scripts/resolver-benchmark.js`: resolver_false_match_rate must be 0 before anything may proceed to automated execution.
- `decision-scan` now reads a trusted `claims.manifest.json`; a declared claim can supply owner, transition, instance, expected value and provenance without selecting a verifier by id.
- `decision-orchestrate` only turns `ready_for_verifier` drafts into pending jobs; `no_capability`, `blocked_by_owner`, `blocked_by_access` and unverifiable drafts never enter pending.
- Real unattended run completed: `change-c63d6e2903645d4c` -> resolver selected `enumeration-completeness` -> pending -> run -> close -> reuse-record -> effective `valid-pass` -> load-gate `allow`; session link is `linked`.
## 2.36.1

Make verdict-view honor mechanism.status even for legacy reuse-records.

- `verdictFor()` now resolves `mechanism_id` from either the top level or `run.mechanism_id`, so old records with the mechanism pointer inside `run` are still recomputed instead of being short-circuited to `superseded`.
- Mechanism status is the primary effective-state source: `unverified`, `expired` and `reopen_required` now project to `unverified`, `expired` and `reopened`. Missing claim identity only forces `superseded` when the mechanism itself is valid.
- Real tableau record now gives the same answer on all three surfaces: `mechanism.status=reopen_required`, `verdict-view=reopened`, `load-gate=block`.
## 2.36.0

Match claims by capability schema and bind expected values to provenance.

- Every registered verifier now declares `transition_types`, `artifact_type`, `required_inputs`, `optional_inputs`, `expected_provenance`, `assertion_schema`, `action_class`, `scope_schema` and `owner`; `verifier-preflight` refuses a verifier without the schema, and `verifiers.manifest.json` tracks it.
- `verifier-resolver` now supports claim-to-capability matching. A claim without a matching capability becomes `no_capability` with `claim_shape`, `observed_facts`, `missing_verifier_kind`, `missing_input_schema`, `source_change_ids` and `session_id`; no_capability is a registry-backlog reason code, not a lifecycle state.
- Claim instances and expected provenance now enter `claim_sha256`. `history-runner` writes `claim_instance`, `expected_value` and `expected_provenance` into reuse-records; expected provenance is restricted to `owner_approval | baseline_manifest | commit | pinned_verifier`, and `agent_inferred` fails closed.
- `verdict-view` treats a closed record without claim instance/provenance as historical `superseded`, not current.
- `decision-scan` emits `no-capability.jsonl` and metrics for ready, no-capability, blocked-by-access and blocked-by-owner claims.

## 2.35.0

Expand the registry with two mechanical verifiers.

- Added `enumeration-completeness`: recursive enumeration against a pinned count/manifest. It reports `files_scanned`, `candidate_count`, `missing_count`, `truncated`, and only passes when `missing_count=0` and `truncated=false`.
- Added `verification-gap`: scans a pinned transcript window after a change boundary and reports `independent_check_count` / `verification_gap_count`; the assertion passes only when the gap is 0.
- Both are thin pinned bridges over the existing `state-query` adapter; the registry now has 12 verifiers and `tests/registry-expansion.js` reproduces both facts.
- The local profile remains machine-local: `verification-gap` pins a real local Codex transcript by SHA-256, so it is intentionally not portable.
## 2.34.0

Add the nomination layer: recover only unique session links, classify claims, and hand ready drafts to the existing runner.

- Added `scripts/link-reuse-records.js` / `src/lib/reuse-linker.js`: a reuse-record is filled only when canonical change-record ids resolve to exactly one session; otherwise it is marked `session_link_status=link_lost`. The derived `case-drafts.jsonl` projection is not used as a provenance source.
- Added `docs/contracts/claim-resolution-v1.md`: the mapping contract for `change_records -> claim_draft -> owner_source -> verifier_candidate -> resolver_result -> disposition`, with `blocked_by_access` / `blocked_by_owner` as reason codes, not lifecycle states.
- Added `scripts/decision-scan.js` / `src/lib/decision-scan.js`: nomination-only drafts with `ready_for_verifier`, `unverifiable`, `blocked_by_access` and `blocked_by_owner` projections. It never writes pending jobs, runs verifiers or closes anything; an empty real stream returns `insufficient_real_stream`.
- Added `scripts/decision-orchestrate.js` / `src/lib/decision-orchestrator.js`: only `ready_for_verifier` drafts become pending jobs, with verifier binding and provenance; the existing history-runner remains the execution layer.
- Real state run: 20 nominations scanned; all 20 are `blocked_by_owner` until an owner registry exists, and zero were activated. Old reuse-records: 6/7 resolved to a unique canonical session; 1/7 is `link_lost`, not guessed.
## 2.33.0

Project mechanism status onto gate states and preserve session provenance in verdicts.

- `verdictFor()` now emits decision-level states: `valid-pass`, `valid-fail`, `unverified`, `reopened`, `expired`, `superseded`, `missing`; a mechanism status of `unverified`, `expired` or `reopen_required` can no longer surface as `closed`.
- `load-gate.consult()` blocks an `unverified` mechanism instead of degrading it, and a correct `valid-pass` returns `allow`.
- `history-runner` writes `session_id`, `turn_id` and `source_message_id` onto every reuse-record, so a verdict is traceable back to the session turn that produced it.
- Regression coverage adds a negative control (adapter disappears -> mechanism `unverified` -> verdict `unverified` -> gate block) and a positive control (fresh runner + reproduced fact + present lock + matching expected -> `valid-pass` -> `allow`).
## 2.32.0

Make effective verdicts single-source: mechanism status, explicit repo, and pin-change reopening.

- `verdictFor()` no longer treats `reuse-record.status` as a current verdict. A closed record supplies immutable claim identity and provenance; the effective state is computed by `mechanism.status()` from the current runner, pinned expected value, case, scope and expiry.
- Legacy reuse-records without `decision_id`, `claim_sha256`, `expected_sha256`, `source_verifier_id` and `verifier_lock_sha256` are reported as `superseded`, so an old `closed` string cannot pass the gate.
- `mechanism.status()` now reports `reopen_required` when the latest or closure evidence is a mismatch (for example the expected pin changed while the runner bytes stayed the same), instead of collapsing that case into generic `unverified`.
- `load-gate.consult()` and `consultAction()` require `{ repo, stateDir }`; `scripts/load-gate.js` requires explicit `--state` and `--repo` for refresh/action/consult paths.
- `chain-check` uses the same `verdictFor()` projection and passes the explicit repo; chain liveness remains separate from verdict freshness.
- Regression tests now include a negative expected-pin-change case and a positive control: a fresh runner, reproduced fact, present lock and matching expected must return `allow`.
## 2.31.0

Bind verdict identity to the claim and recompute effective state from runs and trust.

- reuse-records now carry `decision_id`, `claim_sha256`, `expected_sha256`, `verifier_lock_sha256` and `source_verifier_id`.
- A changed claim produces a new decision/mechanism id and a `claim_changed` verdict event instead of being skipped by `change_id`.
- Effective verdicts are recomputed from the latest mechanism run, pinned expected value, lock digest and expiry: `fresh`, `stale`, `valid-fail`, `reopened`, `expired`, `superseded`.
- Added tracked `verifiers.manifest.json`; verifier preflight verifies the local lock against the manifest and fails closed on drift.
- Real tableau verdict is now correctly reported as `stale` with gate `block`, not a current `closed`/`allow`.

## 2.30.0

All real chains verified running end to end on live history.

- Full history backfill: all 330 session files (7 weeks, 926MB) are ingested - 86953 records across 334 sessions, zero normalization errors. Coverage is measured, not claimed.
- Projection rebuilt over the full history: 55961 candidate drafts, 862 high-signal patterns.
- The first real verdict was refreshed on the current artifact: the approved release zip changed on disk twice after the closure (cb4a48d9 -> 86cba6ad -> ae2585de), the gate refused the stale verdict both times, and the re-pin under operator delegation re-closed with fresh evidence.
- New reading surface: autoarmory digest produces factual per-session summaries straight from records (316 sessions today).
- New one-shot verifier: node scripts/chain-check.js prints PASS/FAIL per chain (capture, history, signals, verdict, gate, reading) with evidence - the answer to whether all real chains are running, without trusting any summary.
- Known boundary: verdict freshness depends on artifact stability; while the plugin is actively rebuilt, the card flips to unverified by design.
- `chain-check` accepts `--root/--repo/--json`, outputs commit/version/source evidence, treats `high_signal_total=0` as healthy, and separates chain liveness from verdict freshness and gate decision.
- `backfill-sessions` now heartbeats its state lock and carries `high_signal_crossed` through full-history backfill.
- `autoarmory digest` now has CLI integration coverage for `--limit` and `--days`.


## 2.29.1

One state root for both legs, so the first real verdict reaches the operator surface.

- inbox/result/status/intake/bind/run now default to the shared state root (AUTOARMORY_STATE || AUTOARMORY_STOP_STATE || ~/.codex/autoarmory/stop-shadow) instead of a CWD-relative .selfforge; explicit --state still wins.
- scripts/merge-state-roots.js unions legacy roots (phase-a, .selfforge) into the shared root by id: target rows win, reuse-records copy by change_id, reruns write nothing; sources are never modified. Applied for real: the tableau release-zip verdict is reachable via autoarmory result.
- The gate itself caught that the approved release zip changed on disk after the closure (cb4a48d9 -> 86cba6ad), so the verdict honestly reads unverified. Next reviewed change: post-closure unverified should surface as an attention/reopen card instead of falling outside the four inbox buckets.


## 2.29.0

Write the decision interface down and enforce it at the gate.

- `docs/contracts/decision-interface-v1.md`: five contracts (decision, verdict, action registry, policy table, consumption log) now exist as a written interface, not tribal knowledge.
- `load-gate.consultAction` routes `action_class x verdict_state` through a versioned policy table (state-root `decision-policy.json` override); unknown classes fail closed.
- Every consult appends a `consumption.jsonl` event; scoped invariants: enforce-mode gate holes must stay 0, observe-mode would-blocks accumulate as the flip signal.
- `load-gate.refresh` recomputes effective verdict states, appends `verdict-event` transitions and materialises `decision-state.json`; it never runs a verifier and never creates a verdict.
- Legacy risk-based `consult` untouched for existing callers.

## 2.28.1

Fix a crash that took down the Stop observation layer after every 2.28.0 deploy.

- `candidateCases` read the repeat crossing state unconditionally; the stop-shadow projection rebuild calls it without caller state, so the first qualifying repeat signature threw `TypeError` and Stops recorded `status: error` instead of scanning.
- Without caller state the threshold is now evaluated as pure projection truth (crossing dedupe stays the stateful scan path's job); with caller state behavior is unchanged.
- Regression test covers the rebuild path: no state + repeat count 3 must not crash and must mark high signal.

## 2.28.0

Harden the approval boundary and capture reliability.

- Approvals now require all six impact fields: case, evidence, verifier, who_reruns, scope_expiry, rollback_reopen. Missing disclosure exits non-zero and writes no approval.
- Repeat signatures rebind commands from the original tool call, not the output line.
- Added a session registry; successful lookup pins session file/cwd for later Stops.
- Gap retries are bounded with retry_count and give_up after 3 attempts.
- Documented transcript_path as an optional host contract, not a parser bug.

## 2.27.0

Bind verdicts back to the projection and put locks and consumption gates at the boundaries.

- `case-drafts.jsonl` joins `reuse-records` by `change_id`; missing verdicts are explicit `verdict_missing`, not fake unresolved/closed.
- Added per-state-root O_EXCL lock with stale takeover for change-inspect and history-runner.
- Mechanical pending jobs carry `mechanical_binding` (command hash, cwd, repo HEAD/remote, timeout, allowlist class); runner verifies it before execution.
- Registered runner execution requires non-empty `expected_transition`.
- Added `load-gate` with allow/degrade/block semantics and evidence-window expiry.
- Phase #4 incremental projection remains deferred until Stop p95/p99 shows real tail latency pressure.

## 2.26.0

Complete Phase A with a real release-package closure.

- Registered `tableau-release-zip` as a read-only file-sha256 verifier pinned to the actual release zip.
- Real decision: `tableau-bitable-plugin-release.zip` is approved only if its SHA-256 remains `cb4a48...`.
- Real run closed with exit_code 0 and wrote a reuse record; owner is the user.
- Added runner shell-metacharacter rejection for project_test commands.

## 2.25.1

Distinguish missing JSONL from empty JSONL.

- Added `readJsonlResult()` with `exists`, `path` and `rows`.
- Kept `readJsonl()` backward-compatible, but callers can now tell “never written” from “written empty”.
- Added persistence coverage for both cases.

## 2.25.0

Fix repeat starvation and let the runner mechanically replay safe verification commands.

- Repeat pressure now uses `max(detail.count)`, not the number of repeat records.
- Repeat threshold notification is deduped per session + signature: first crossing at count >= 3 only; later counts remain candidate-only.
- Added starvation metrics and real evidence: risk=3138, risk_without_check_gap=3138, repeat_max=15, structured_result_ratio=0.0014, high-signal 68 -> 24 after dedupe.
- History runner now accepts `project_test`, `git_status` and `file_hash`; non-whitelisted commands and missing paths stay unverifiable.
- Added a Windows scheduled task wrapper for periodic `history-runner --drain`.

## 2.24.0

Audit the signal layer, make canonical writes append-only, and fail closed on uncertain session attribution.

- Added CHECK/RISK recall audit plus evidence tests.
- `change-records.jsonl` and `change-inventory.jsonl` are appended, not rewrite-merged; duplicate IDs are repaired on read.
- `latest_cwd` is diagnostic-only and no longer becomes a canonical session.
- Policy invariants moved under `policy_invariants`; `.bak` retention prunes old backups.
- Contract references now point to `change-records.jsonl` as canonical everywhere.

## 2.23.1

Backfill the canonical change records so the projection rebuild cannot wipe history.

- The real state dir had no `change-records.jsonl`; the next new draft would have rebuilt `case-drafts.jsonl` from an empty canonical and dropped 26k+ drafts.
- `scripts/backfill-change-records.js` merges legacy `change-inventory.jsonl` into `change-records.jsonl`, deduped by change_id, idempotent on rerun, inventory untouched.
- Verified on the real state dir: 36649 records backfilled, rerun is a no-op; the simulated projection rebuild yields 26401 drafts with all sessions traced to rollout files (legacy projection carried 26363 attribution_lost rows).

## 2.23.0

Move real verifier execution behind a background history runner.

- Stop only writes `pending/<change_id>.json` for high-signal changes; it never runs verifiers.
- `history-runner --drain` consumes pending jobs, resolves an explicit registered verifier or records `unverifiable`, runs the verifier, closes on pass and writes `reuse-records/<change_id>.json`.
- `change-records.jsonl` is canonical; `case-drafts.jsonl` remains a projection.
- Real runner acceptance: one pending job -> `windows-service-state` run -> closed reuse record; rerun is idempotent and missing verifier stays `unverifiable`.

## 2.22.1

Narrow high signal once more: risk plus file change is not enough.

- High signal now requires risk + check gap/repeat/failure, repeat count >= 3, or failure bound to check/repeat.
- Same real two-session replay: 530 candidates -> 0 high signals. Zero interruptions is the correct result for that dataset.
- Legacy `notify` values are no longer trusted; projection recomputes `high_signal` from `signals` + `repeat_count`.

## 2.22.0

Separate candidate recording from user interruption and make change_id primary.

- `candidate` means worth recording; `high_signal` means worth interrupting. Risk or failed-command alone is candidate-only.
- High signal now requires risk + change/check/repeat/failure binding, repeat count >= 3, or failed command bound to check/repeat.
- `change_id` is the primary key; `session_id` / `turn_id` are source attribution.
- Change Inspector writes `new-drafts.jsonl`; Stop Shadow only rebuilds the projection when new drafts exist.
- Real two-session rerun: 530 candidates -> 8 candidate-only notifications under the first narrowed policy; 2.22.1 narrows further to 0 high signals on that dataset.

## 2.21.4

Preserve canonical provenance in the Stop Shadow projection.

- `change-records.jsonl` is the canonical source of truth; `case-drafts.jsonl` is a derived projection.
- The current Stop event only fills missing `session_id` / `turn_id`; existing provenance always wins.
- Projection summary now separates `projection_total`, `current_session_draft_count`, `new_draft_count`, `attribution_preserved_count`, `attribution_lost_count` and `attribution_filled_from_event_count`.
- Dedupe key is now `session_id|id`, so the same draft id in different sessions is not silently merged.
- Already polluted bare-UUID rows are marked `attribution_lost`; they are not guessed back.

## 2.21.3

Make Stop Shadow find real sessions and report why it failed.

- Session lookup now tries exact filename, session-id tail, then newest rollout with matching `cwd`; a real Stop no longer has to fail because the event id is not in the filename.
- Every Stop writes both append-only `last-run.jsonl` and the latest `last-run.json`, including match mode, search root, elapsed time, candidate count and draft/high-signal counts.
- `shadow-gaps.jsonl` now carries `cwd`, `search_root`, `elapsed_ms`, `candidate_count`, `exact_matches` and `tail_matches`.
- Real Stop verification against `01a0b3a1-8b86-7003-bb0a-5938d73ad79e` produced `case-drafts.jsonl`, `high-signal.json`, `session-case-drafts.jsonl` and `stop-shadow-summary.json`.

## 2.21.2

Extract threshold transitions from history before binding a verifier.

- History text such as `count >= 3` now becomes `COUNT->>=3` instead of the generic `FAIL->PASS`.
- With explicit `meta-skill-load-count`, the fixed resolver finds 3 true history candidates; the first one is `case-1990aca9a628`.
- The recorded history-derived run stays closed with observed `count=4` and a pinned assertion `count >= 3`.

## 2.21.1

Run the fixed session-shadow resolver from the Stop hook incrementally.

- Change Inspector now writes `new-events.jsonl` for the bytes scanned on the current Stop.
- Stop Shadow feeds those events to session-shadow with the active verifier profile and writes `session-case-drafts.jsonl` / `session-unverifiable.jsonl`.
- These are candidate drafts only: no verifier binding file, run, close or verdict is created by the Stop hook.

## 2.21.0

Bind session-shadow drafts only when the verifier can express the transition.

- A verifier now has to be named explicitly in the draft and its pinned assertion must express `expected_transition`; `file-sha256 match=true` no longer becomes `verified_candidate` for `FAIL->PASS`.
- `COUNT->0`, `COUNT->N`, `COUNT->>=N`, `COUNT-><=N` and `FAIL->PASS` are checked structurally against the assertion path/operator/value.
- Replaying the 18 old candidates yields 0 `verified_candidate`, 18 `verifier_mismatch`; the full source session yields 28 mismatches and 0 verified candidates.
- One real history-derived run is recorded and closed with `meta-skill-load-count` (`count >= 3`, observed 4). Evidence is in `docs/evidence/history-derived-run-20260918.json`.

## 2.20.1

Make the Stop Shadow hook genuinely non-blocking.

- The host Stop hook now writes the event to a temp file and spawns `scripts/stop-shadow.js` detached; the hook returns immediately.
- The detached scanner keeps the Change Inspector timeout and records `shadow_gap` itself; it deletes its event file after reading it.
- Added an append-only `last-run.jsonl` heartbeat so a stopped/never-running shadow is visible instead of inferred from an empty state directory.
- Active Stop recursion still writes nothing; `STOP_SHADOW_OFF=1` disables the shadow hook.

## 2.20.0

Stop Shadow: the Stop hook now runs the incremental session scan automatically.

- The Stop hook resolves the current session rollout and runs the Change Inspector only over appended bytes.
- It writes `case-drafts.jsonl`, `high-signal.json` and `stop-shadow-summary.json`; it does not create cases, verifier bindings, runs, closures or verdicts.
- Reruns are idempotent; missing sessions, scan failures and timeouts write `shadow_gap` and still exit successfully.
- Added `tests/stop-shadow.js`, `tests/stop-shadow-evidence.js`, `docs/stop-shadow.md` and sanitized `docs/evidence/stop-shadow-20260918.json`.

## 2.19.1

Separate mechanism declarations from projections, and separate stale verification, expiry and reopen.

- Declared inputs are `scope`, `expires_at` and `reopen_trigger`; `scope_sha256`, `scope_status`, `expiry_status` and `reopen_required` are projections computed by `status`.
- `scope_sha256` is derived at registration and is no longer a schema declaration; callers cannot supply any projection field.
- `verification_stale_days` produces `stale_verification` (usable warning); a past `expires_at` produces `expired` (never `verified`/`closed`); a predicate hit produces `reopen_required`.
- `promote` accepts a requested scope and rejects `out_of_scope`; `close` rejects past expiry and reopen hits.
- Added machine negative controls: changed file reopens, past `expires_at` blocks close/promote, different scope promotion is rejected.

## 2.19.0

Mechanism Scope & Validity: scope, expiry and computable reopen predicates on the existing mechanism object.

- Added optional declared `scope`, `expires_at` and `reopen_trigger` fields; `scope_sha256` is derived state. Old mechanisms remain `legacy_unscoped`.
- Scope hash proves integrity/equality only; scope correctness remains a replay/counterexample question.
- Added computable predicates `runner_changed`, `case_changed`, `scope_changed`, `file_changed`, `evidence_expired`, `environment_changed`; free-text triggers are rejected.
- `status` can return `expired` or `reopen_required`; `close`, `promote` and reuse checks reject scope drift, expiry, legacy-unscoped mechanisms and trigger hits.
- Added six preflight counters: `unscoped_promotion_count`, `out_of_scope_reuse_count`, `expired_mechanism_reuse_count`, `legacy_unscoped_promotion_count`, `reopen_trigger_invalid_count`, `reopen_required_escape_count`.
- Added `tests/mechanism-scope.js`, `tests/mechanism-scope-evidence.js` and sanitized `docs/evidence/mechanism-scope-20260918.json`.

## 2.18.0

Claude JSONL normalization plus fail-closed raw/normalized accounting.

- `normalizeRows()` now maps `type: user|assistant` + `message.content[]`, including multiple blocks per row (text, tool_use, tool_result).
- `tool_use.id` is linked to `tool_result.tool_use_id`; `is_error`, `cwd`, `sessionId`, `uuid`, `parentUuid` and `isSidechain` are carried.
- Added raw counts `raw_tool_use_count`, `raw_tool_result_count`, `normalized_tool_call_count`, `normalized_tool_output_count`.
- A real Claude session now normalizes 699/699 tool_use and 699/699 tool_result events; the earlier silent zero is fixed.
- The reader exits 2 with `SESSION_SHADOW_EMPTY` for zero normalization and `SESSION_SHADOW_PARTIAL` for count mismatch.
- Added `tests/session-shadow-claude.js`, `tests/claude-normalization-evidence.js` and sanitized `docs/evidence/claude-normalization-20260918.json`.

## 2.17.0

Hook Gate: only two blocking points, no blanket Edit/Write interception.

- Added `src/lib/hook-gate.js` and `scripts/hook-gate.js`.
- Ordinary `Edit` / `Write` / `apply_patch` events are recorded and allowed.
- Production, irreversible or external-side-effect actions require explicit approval.
- Completion/stop claims without a verifier reference are blocked.
- Added persistent `hook-decisions.jsonl`, sanitized `docs/evidence/hook-gate-20260917.json`, `tests/hook-gate.js` and `tests/hook-gate-evidence.js`.
- Runtime host hook registration remains the integration step; this release defines the executable gate contract and its tests.

## 2.16.0

Change Inventory v2 aligns the inspector with the accepted boundary: record changes, do not infer execution facts.

- Added `scripts/change-inspector.js` plus the compatibility `scripts/change-inspect.js`; first-pass outputs are `changes.jsonl`, `check-gap-report.json` and `high-signal-changes.json`.
- Added `src/lib/verifier-resolver.js`: only registered verifier, project test command, file hash and git state are mechanical; HTTP, SQL, process, DOM and build artifacts remain `verifier_candidate`.
- Added `scripts/validation-exec.js`: validation commands route through `exec-record` for structured exit code, duration and stdout/stderr hashes.
- Real two-session scan: 7237 raw change records, 64 path-computable file changes, 651 check observations, 22 raw `check_gap` signals, 49 aggregate check-gap changes, 651 `exec_record_gap`s, 0 fabricated transcript execution fields and 0 blocked Edit/Write events.
- Added `docs/change-inspector.md`, `docs/exec-record-integration.md`, `docs/evidence/change-inspector-v2-20260917.json` and their guards.

## 2.15.0

Standing Change Inventory: session changes become incremental, deterministic, non-closing records.

- Added `src/lib/change-inspector.js` and `scripts/change-inspect.js` with byte-offset state and idempotent increments.
- Added signals for file changes, commands, observed checks, `check_gap`, structured pass/fail, unstructured result, repeated signatures, risk signals and `exec_record_gap`.
- Added candidate drafting only for high-signal changes; low-signal Edit/Write events are recorded and suppressed, not blocked.
- Run on the selected main and article sessions: 7442 change records, 277 file changes, 646 check observations, 70 `check_gap`, 646 `exec_record_gap`, 5 repeated signatures, 465 risk signals, 549 candidate drafts and 479 high-signal notifications.
- `transcript_field_fabrication_count=0`; the inspector never invents exit code, stdout hash or stderr hash from transcript text.
- `close_without_verifier_count=0`; `false_close_count` is explicitly `null` with status `lagging_indicator_requires_future_counterexample`.
- Added sanitized `docs/evidence/change-inspector-20260917.json` and the standing inspector contract in `docs/change-inspector.md`.

## 2.14.0

Session Shadow v1: selected sessions become deterministic rule, article, case-draft and verifier projections without manual labeling.

- Added `src/lib/session-shadow.js` and `scripts/session-shadow.js`.
- Added `--mode rules` for collaboration, automation and hook requirements.
- Added `--mode articles` for deduplicated URL decisions, case drafts, verifier bindings and unverifiable items.
- The real analysis session `01a079b4-0de0-7372-a83c-d4d33e1accd4` produced 184 user turns, 182 completions, 301 article decisions and 359 case drafts; the older `01a06a68` copy was excluded.
- All manual counters are zero: no manual case creation, verifier configuration or article labeling. No verifier match means the draft stays unclosed.
- Added sanitized `docs/evidence/session-shadow-20260917.json` and a guard for the acceptance metrics.

## 2.13.0

Deterministic triage separates “must fix now” from backlog and theoretical completeness.

- Added `src/lib/triage.js` and `scripts/triage.js`.
- `must_fix_now`: external red, safety boundary, data error or live-fact conflict with evidence.
- `backlog`: missing consumer, stop condition or outsourcing target.
- `only_if_decision_impact`: naming, documentation, version, format or extra evidence unless a real decision impact is recorded.
- `do_not_do`: theoretical completeness with no real consumer or external fact.
- `needs_evidence`: no deterministic rule matched; this remains fail-closed instead of being silently downgraded.
- `--enforce` blocks only `must_fix_now` and `needs_evidence`; backlog and do-not-do remain visible without fake urgency.
- Added `tests/triage.js` and `examples/triage-findings.jsonl`.

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

# Changelog

## Unreleased

- Repositioned AutoArmory as a local capability manager for one operator: the cross-vendor control-plane claim and the public `serve` entry were downgraded to optional internals.
- Expanded the local verifier profile to eight heterogeneous fact sources, added `scripts/verifier-pin.js` for mechanical re-pinning, and added `tests/verifier-bridges.js` to enforce thin bridges.
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

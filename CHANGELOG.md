# Changelog

## 0.3.0

- Rebranded the public package and CLI to AutoArmory.
- Kept `selfforge` and `self-forge` as compatibility CLI aliases.
- Kept `.selfforge/` state storage and `selfforge/*` schema namespaces stable for backward compatibility.
- Added the Capability Manager architecture specification.
- Merged SkillCanary into the AutoArmory monorepo as `packages/skillcanary` with a unified `autoarmory canary` command.
- Added capability registry, health, routing, portfolio, outcome learning, drift, conformance and retirement.
- Added guarded policy calibration and off-policy evaluation.

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

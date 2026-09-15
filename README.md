# AutoArmory

**Auto-battle control plane for agent capabilities.**

**Every module is a weapon. Every promotion is earned by evidence.**

AutoArmory manages the layer above platform-native tools: cross-vendor capability discovery, evidence, routing, composition, degradation, replacement and retirement. SkillCanary remains the stable evidence, provenance and change-gate control plane.

```text
observe -> incident -> candidate -> gate -> decision -> learn
```

## Capability Manager

**Capability Manager** is AutoArmory's decision engine. It treats every runner, evaluator, scanner, MCP gateway, registry, memory layer, provenance adapter and policy module as a capability asset.

Each capability is a weapon. Each routing decision is a loadout. Each verified outcome is a battle report.

```text
capability -> constraints -> route -> compose -> outcome -> update -> degrade/replace/retire
```

Capability Manager is implemented inside AutoArmory as an internal subsystem: registry, health, routing, portfolio, outcome learning, drift detection, conformance, retirement, guarded calibration and off-policy evaluation. Its design is defined in [Capability Manager design](docs/superpowers/specs/2026-09-15-capability-manager-design.md).

## Why separate

- SkillCanary should remain stable, small and compatible.
- AutoArmory can experiment with capability routing, memory, active learning and policy.
- AutoArmory must be able to improve SkillCanary, but SkillCanary must not depend on AutoArmory.

## Commands

```bash
autoarmory init
autoarmory observe logs/ --output .selfforge/incidents.jsonl
pytest 2>&1 | autoarmory observe - --format log --output .selfforge/incidents.jsonl
gh issue list --repo owner/repo --json number,title,body,url | autoarmory observe - --format github --output .selfforge/incidents.jsonl
autoarmory propose .selfforge/incidents.jsonl --output .selfforge/candidates.jsonl
autoarmory gate .selfforge/candidate.json --cases examples/skillcanary-cases.json
autoarmory record --candidate cand-1 --action add_case --reward 1.5 --verified true --gate .selfforge/gate.json --evidence .selfforge/outcome-evidence.json
autoarmory transition .selfforge/candidate.json --to gated --gate .selfforge/gate.json --state .selfforge
autoarmory transition .selfforge/candidate.json --to shadow --gate .selfforge/gate.json --state .selfforge
autoarmory learn .selfforge/decisions.jsonl
autoarmory environment --write
autoarmory experiment compare before.json after.json
autoarmory policy .selfforge/decisions.jsonl
autoarmory acquire .selfforge/candidates.jsonl --top 10
autoarmory evolve logs/ --format auto --cases path/to/cases.json
autoarmory doctor
autoarmory capability register examples/capabilities.jsonl
autoarmory capability list --state .selfforge
autoarmory capability health --state .selfforge
autoarmory capability route --request request.json --state .selfforge
autoarmory capability portfolio --state .selfforge
autoarmory capability outcome outcome.json --state .selfforge
autoarmory capability drift runner.skillgrade --state .selfforge
autoarmory capability conformance runner.skillgrade --state .selfforge
autoarmory capability retire legacy.runner --reason "Repeated drift and failures." --state .selfforge
autoarmory policy calibrate --outcomes .selfforge/capability-outcomes.jsonl --min 30
autoarmory policy off-policy --outcomes .selfforge/capability-outcomes.jsonl --min 30
autoarmory report --output autoarmory-report.md
```

## Real CLI input

`observe -` reads artifacts from stdin, so real runner and CLI output can be observed without AutoArmory executing the external command itself:

```bash
pytest 2>&1 | autoarmory observe - --format log --output .selfforge/incidents.jsonl
gh issue list --repo owner/repo --json number,title,body,url | autoarmory observe - --format github --output .selfforge/incidents.jsonl
cat junit.xml | autoarmory observe - --format junit --output .selfforge/incidents.jsonl
```

## Gate boundary

`autoarmory gate` and `autoarmory evolve` both call the real SkillCanary gate. The operation is fail-closed: a missing SkillCanary CLI, invalid gate output, local structural error, or any SkillCanary gate error marks the candidate `rejected`. AutoArmory does not promote or execute a candidate by itself.

A gate-ready candidate carries a `change` object. AutoArmory fills the shared change fields (`id`, `target`, `expected_transition`, `prediction`) from the candidate, then passes the resulting `skillcanary/change/v1` record to `skillcanary gate`. Case targets must provide a cases file; deterministic targets do not.

Candidate promotion follows a recorded state machine: `candidate -> gated -> shadow -> canary -> promoted`, with `rejected` available before promotion and `retired` after it. Gate proof is mandatory for `gated` and `shadow`; outcome evidence is mandatory for `canary` and `promoted`.

`record` refuses to append a decision unless a successful SkillCanary gate proof is provided or found on the stored candidate. A verified decision also requires outcome evidence with artifacts or before/after observations.

Run the real adapter conformance suite against the vendored SkillCanary package:

```bash
npm run test:conformance
```

## Unified product

This repository is the AutoArmory monorepo. `packages/skillcanary` contains the stable SkillCanary control plane; the root runtime contains the evolution engine and Capability Manager. `autoarmory canary ...` dispatches to the vendored SkillCanary CLI while the top-level commands expose AutoArmory capabilities.

## Legacy compatibility

The public package and CLI are `autoarmory`. The `selfforge` and `self-forge` commands remain as compatibility aliases, and the on-disk `.selfforge/` state directory plus `selfforge/*` schema namespaces remain stable so existing records do not break.

## Boundaries

AutoArmory does not:

- run agents;
- scan for vulnerabilities;
- replace SkillCanary;
- execute changes without approval;
- collect private transcripts into public repositories.

The dependency direction is one-way:

```text
AutoArmory -> SkillCanary contracts and gate
SkillCanary -X-> AutoArmory
```

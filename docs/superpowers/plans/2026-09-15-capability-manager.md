# Capability Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement AutoArmory's Capability Manager first slice: canonical capability contracts, registry, health, routing, portfolio, outcome learning, drift detection, conformance, retirement, calibration and off-policy evaluation.

**Architecture:** Capability Manager is an internal AutoArmory subsystem. It stores capability assets in `.selfforge/capabilities.jsonl`, outcomes in `.selfforge/capability-outcomes.jsonl`, routing decisions in `.selfforge/routing-decisions.jsonl`, and replacement suggestions in `.selfforge/replacement-suggestions.jsonl`. It depends on SkillCanary only through canonical gate/evidence records and never imports evolution-engine internals.

**Tech Stack:** Node.js 18+, CommonJS, no runtime dependencies, JSON Schema draft-07, deterministic seeded sampling.

**Spec:** `docs/superpowers/specs/2026-09-15-capability-manager-design.md`

## Global Constraints

- Public CLI is `autoarmory`; keep `selfforge` and `self-forge` aliases.
- Existing `.selfforge/` state directory and `selfforge/*` schema namespaces remain backward compatible.
- New Capability Manager contracts use `autoarmory/*` schema namespaces.
- No automatic execution of scanners, runners, MCP gateways or write-capable modules.
- High-risk or write-required modules must never be selected without explicit approval constraints.
- Synthetic data is fixture-only and cannot silently update production policy.
- Every decision must be reproducible from inputs plus seed.

---

### Task 1: Capability contracts and registry

**Files:**
- Create: `schemas/capability.schema.json`
- Create: `schemas/routing-request.schema.json`
- Create: `schemas/routing-decision.schema.json`
- Create: `schemas/capability-outcome.schema.json`
- Create: `schemas/replacement-suggestion.schema.json`
- Create: `src/lib/capability.js`
- Create: `src/commands/capability.js`
- Modify: `src/cli.js`
- Test: `tests/capability.js`

**Interfaces:**
- Produces: `normalizeCapability(value) -> object`
- Produces: `readCapabilities(file) -> object[]`
- Produces: `registerCapability(file, value, options) -> object`
- Produces CLI: `autoarmory capability register|list|health`

- [ ] Write failing CLI tests for register/list/health and invalid capability rejection.
- [ ] Run `node tests/capability.js`; expect missing command failure.
- [ ] Implement schema validation, JSONL registry, commands and usage text.
- [ ] Run `npm test`; expect all tests pass.
- [ ] Commit `feat: add capability registry`.

### Task 2: Constrained routing and Pareto portfolio

**Files:**
- Modify: `src/lib/capability.js`
- Modify: `src/commands/capability.js`
- Modify: `schemas/routing-request.schema.json`
- Modify: `schemas/routing-decision.schema.json`
- Test: `tests/capability.js`

**Interfaces:**
- Produces: `filterCapabilities(capabilities, request) -> {eligible,rejected,reasons}`
- Produces: `route(capabilities, request, options) -> routingDecision`
- Produces: `portfolio(capabilities) -> paretoFrontier`
- Produces CLI: `autoarmory capability route|portfolio`

- [ ] Write failing tests for permission filtering, risk filtering, latency/cost constraints, deterministic seed, fallback chain and Pareto frontier.
- [ ] Run `node tests/capability.js`; expect failures.
- [ ] Implement constrained Thompson Sampling with Beta posterior and Pareto dominance.
- [ ] Run `npm test`; expect all tests pass.
- [ ] Commit `feat: add capability routing and portfolio`.

### Task 3: Outcomes, drift, conformance and retirement

**Files:**
- Modify: `src/lib/capability.js`
- Modify: `src/commands/capability.js`
- Modify: `schemas/capability-outcome.schema.json`
- Modify: `schemas/replacement-suggestion.schema.json`
- Test: `tests/capability.js`

**Interfaces:**
- Produces: `recordOutcome(registryFile, outcomesFile, outcome) -> {capability,outcome}`
- Produces: `detectDrift(outcomes, options) -> driftResult`
- Produces: `conformanceCheck(capability) -> conformanceResult`
- Produces: `retireCapability(registryFile, suggestionsFile, id, reason) -> suggestion`
- Produces CLI: `autoarmory capability outcome|drift|conformance|retire`

- [ ] Write failing tests for Beta posterior update, CUSUM drift alert, conformance pass/fail and retirement suggestion.
- [ ] Run `node tests/capability.js`; expect failures.
- [ ] Implement outcome append/update, drift windows, conformance metadata checks and retirement.
- [ ] Run `npm test`; expect all tests pass.
- [ ] Commit `feat: add capability outcomes and health controls`.

### Task 4: Calibration and off-policy evaluation

**Files:**
- Create: `src/lib/calibration.js`
- Modify: `src/commands/policy.js`
- Test: `tests/capability.js`

**Interfaces:**
- Produces: `calibrate(outcomes, options) -> {status,brier,log_loss,ece,samples}`
- Produces: `offPolicyEvaluate(outcomes, options) -> {status,ips,effective_samples}`
- Produces CLI: `autoarmory policy calibrate|off-policy`

- [ ] Write failing tests for insufficient real data, synthetic-data refusal, Brier/log-loss/ECE and IPS.
- [ ] Run `node tests/capability.js`; expect failures.
- [ ] Implement guarded calibration and IPS; never update registry from synthetic or unverified outcomes.
- [ ] Run `npm test`; expect all tests pass.
- [ ] Commit `feat: add guarded policy calibration`.

### Task 5: Report, conformance, examples and release checks

**Files:**
- Modify: `src/commands/report.js`
- Modify: `src/commands/doctor.js`
- Create: `examples/capabilities.jsonl`
- Modify: `tests/run.js`
- Modify: `tests/capability.js`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`
- Modify: `CHANGELOG.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: report includes capability, routing, outcome and drift counts.
- Produces: doctor checks capability registry and routing decision log.
- Produces: deterministic positive/negative fixtures for runner, evaluator, scanner and MCP gateway capability records.

- [ ] Write failing tests for report/doctor capability sections and deterministic adapter fixtures.
- [ ] Run `npm test`; expect failures.
- [ ] Implement report/doctor additions, examples, docs and CI gates.
- [ ] Run `npm test`, `npm run test:conformance`, `npm pack --dry-run`.
- [ ] Commit `feat: complete capability manager first slice`.

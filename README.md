# AutoArmory

**The cross-vendor capability control plane for AI agents.**

Every module is a weapon. Every promotion is earned by evidence.

AutoArmory decides which capabilities should be used, combined, gated, degraded, replaced or retired across runners, evaluators, scanners, MCP gateways, registries, memory layers and policy engines.

```bash
npx autoarmory demo
npx autoarmory bench
```

Why this must exist: AutoArmory maximizes **policy-compliant execution**, not unsafe completion at any cost. It executes when the module is allowed, refuses when it is unsafe or unsupported, records the outcome, and retires what keeps failing. See [Why AutoArmory](docs/why.md).

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
autoarmory close --case case-id --run run-id --state .selfforge
autoarmory transition .selfforge/candidate.json --to pending_approval --state .selfforge
autoarmory transition .selfforge/candidate.json --to gated --gate .selfforge/gate.json --approval .selfforge/approval.json --state .selfforge
autoarmory transition .selfforge/candidate.json --to shadow --gate .selfforge/gate.json --state .selfforge
autoarmory learn .selfforge/decisions.jsonl
autoarmory environment --write
autoarmory experiment compare before.json after.json
autoarmory policy .selfforge/decisions.jsonl
autoarmory acquire .selfforge/candidates.jsonl --top 10
autoarmory evolve logs/ --format auto --cases path/to/cases.json
autoarmory admit .selfforge/candidates.jsonl --output .selfforge/admission.jsonl
autoarmory scenario list
autoarmory scenario show coding
autoarmory scenario plan coding --state .selfforge
autoarmory doctor
autoarmory capability register examples/capabilities.jsonl
autoarmory capability list --state .selfforge
autoarmory capability health --state .selfforge
autoarmory capability outcome outcome.json --state .selfforge
autoarmory capability drift runner.skillgrade --state .selfforge
autoarmory capability conformance runner.skillgrade --state .selfforge
autoarmory report --output autoarmory-report.md
```

## Article, issue and trace learning

Real failure evidence can enter AutoArmory from articles, issue history, runner logs, JUnit, GitHub JSON and OTel GenAI spans. Article mode extracts evidence lines into the failure taxonomy instead of treating the whole article as an incident.

```bash
autoarmory observe article.md --format article --output .selfforge/incidents.jsonl
autoarmory observe telemetry.json --format otel --output .selfforge/otel-incidents.jsonl
autoarmory propose .selfforge/incidents.jsonl --output .selfforge/candidates.jsonl
```

The taxonomy and action mapping are documented in [Failure Modes](docs/failure-modes.md). External evaluation standards are mapped in [Agent Evaluation Standards](docs/standards/agent-evaluation-standards.md).

## API, SDK and Team CLI

```bash
autoarmory serve --port 8787
AUTOARMORY_URL=http://127.0.0.1:8787 node integrations/team-cli/route.js request.json
```

The HTTP API exposes `GET /health`, `GET /capabilities`, `POST /route`, `POST /admit`, `POST /outcome`, `GET /scenario/:id` and `GET /playground`. The SDK is at `src/sdk/client.js`; external adapters follow `docs/adapters.md`.

## Self-evaluation

```bash
autoarmory self-eval --runs 3 --output self-eval.json
```

This runs the core suites as Pass^k checks, plus conformance, capability contracts, docs and repository integrity. It is explicitly a self-evaluation, not an independent audit: the report always discloses self-assessment bias.

## Real CLI input

`observe -` reads artifacts from stdin, so real runner and CLI output can be observed without AutoArmory executing the external command itself:

```bash
pytest 2>&1 | autoarmory observe - --format log --output .selfforge/incidents.jsonl
gh issue list --repo owner/repo --json number,title,body,url | autoarmory observe - --format github --output .selfforge/incidents.jsonl
cat junit.xml | autoarmory observe - --format junit --output .selfforge/incidents.jsonl
```

## Change gate

Enable the repository-local pre-commit enforcement point:

```bash
npm run hooks:install
```

The hook runs `node scripts/change-gate.js --staged`. It blocks new abstraction surfaces unless the change includes a passing claim record, a verification improvement, or removal/downgrade of an existing layer. See [Change Gate](docs/change-gate.md).

## Mechanism core

The v0.5 slice answers one question: for a reproducible failure case, does a registered mechanism have sufficient replay evidence to close it? It records cases, mechanisms, runs, closures, and status verdicts. It does not run external tools. See [Mechanism Core](docs/mechanism-core.md).

## Gate boundary

`autoarmory gate` and `autoarmory evolve` both call the real SkillCanary gate. The operation is fail-closed: a missing SkillCanary CLI, invalid gate output, local structural error, or any SkillCanary gate error marks the candidate `rejected`. AutoArmory does not promote or execute a candidate by itself.

A gate-ready candidate carries a `change` object. AutoArmory fills the shared change fields (`id`, `target`, `expected_transition`, `prediction`) from the candidate, then passes the resulting `skillcanary/change/v1` record to `skillcanary gate`. Case targets must provide a cases file; deterministic targets do not.

Candidate promotion follows a recorded state machine: `candidate -> pending_approval -> gated -> shadow -> canary -> promoted`, with `rejected` available before promotion and `retired` after it. Gate proof is mandatory for `gated` and `shadow`; user approval is also mandatory for `pending_approval -> gated`. Outcome evidence is mandatory for `canary` and `promoted`.

Approval is an authorization decision, not verification evidence. The Agent prepares the candidate, gate proof, rollback and verification commands; the user only approves. After approval, the Agent performs the transition and the remaining mechanical work.

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

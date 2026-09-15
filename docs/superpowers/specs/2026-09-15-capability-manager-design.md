# AutoArmory Capability Manager Design

Status: draft for implementation  
Date: 2026-09-15  
Depends on: SkillCanary 0.9 gate/evidence contracts

## 1. Problem

Agent capability is fragmented across runners, evaluators, scanners, MCP gateways, registries, observability systems, provenance stores, memory layers, CI systems and policy engines. Platform vendors will manage their own ecosystems, but they are not neutral across competitors.

AutoArmory manages the layer above platform-native tooling: capability discovery, evidence, routing, composition, degradation, replacement and retirement.

## 2. First principles

1. The atomic unit is a capability module, not an agent.
2. Reliability is learned from verified outcomes in a context, not assumed from configuration.
3. A module is an asset with cost, latency, permissions, risk, freshness, conformance and provenance.
4. Selection is constrained optimization, not a single score.
5. Evolution requires selection pressure: propose, gate, trial, record, promote or reject.
6. No routing or evolution claim is valid without replayable evidence.

## 3. Product boundary

AutoArmory does not replace Codex, Claude, Cursor or OpenCode managers. It does not become a generic Agent manager. It manages what those platforms do not naturally manage:

- cross-vendor capability catalogs;
- capability contracts and conformance;
- evidence and outcome history across repositories and teams;
- context-aware routing and fallback;
- module composition and degradation;
- replacement suggestions and retirement;
- portable policy and evidence export.

## 4. Planes and dependency rules

### SkillCanary

Owns evidence, provenance, compatibility and the change gate. It never depends on AutoArmory.

### AutoArmory evolution engine

Owns observation, candidate proposals, decisions, outcomes, learning and artifact evolution.

### Capability Manager

Owns discovery, normalization, certification, health, routing, composition, degradation, replacement and retirement.

### Code and data direction

```text
AutoArmory evolution engine -> SkillCanary
Capability Manager -> SkillCanary
Capability Manager -> canonical outcome / replacement-suggestion records
AutoArmory evolution engine -X-> Capability Manager internals
```

The feedback loop is a data loop, not a code cycle. The evolution engine emits records. Capability Manager consumes contracts. Neither imports the other's implementation.

## 5. Canonical contracts

The first implementation must define and version the core records before adding routing algorithms. The replacement suggestion is part of the feedback contract.

### capability

```json
{
  "schema_version": "autoarmory/capability/v1",
  "id": "vendor.module",
  "vendor": "vendor",
  "kind": "runner|evaluator|scanner|mcp-gateway|registry|observability|provenance|memory|ci|policy",
  "version": "1.0.0",
  "capabilities": ["..."],
  "permissions": { "read": true, "write": false, "network": false },
  "cost": { "unit": "usd", "estimate": 0 },
  "latency_ms": { "p50": 0, "p95": 0 },
  "reliability": { "alpha": 1, "beta": 1 },
  "risk": "low|medium|high|critical",
  "trust_level": "untrusted|candidate|verified|trusted",
  "conformance_level": "imported|normalized|verified|live|ci-gated",
  "health": "unknown|healthy|degraded|offline",
  "freshness": "2026-09-15T00:00:00.000Z",
  "evidence_refs": []
}
```

### routing_request

```json
{
  "schema_version": "autoarmory/routing-request/v1",
  "task_type": "evaluate|scan|execute|observe|retrieve|publish",
  "risk": "low|medium|high|critical",
  "data_sensitivity": "public|internal|confidential|restricted",
  "cost_budget": 0,
  "latency_slo_ms": 0,
  "write_required": false,
  "security_level": "standard|elevated|restricted",
  "context": {}
}
```

### routing_decision

```json
{
  "schema_version": "autoarmory/routing-decision/v1",
  "request_id": "req-...",
  "selected": ["capability-id"],
  "rejected": ["capability-id"],
  "fallback_chain": ["capability-id"],
  "reason": "constraint-filter + constrained-thompson + pareto",
  "policy_version": "autoarmory/policy/v1",
  "seed": 1,
  "evidence_refs": []
}
```

### outcome

```json
{
  "schema_version": "autoarmory/outcome/v1",
  "decision_id": "route-...",
  "capability_id": "vendor.module",
  "task_type": "evaluate",
  "result": "success|failure|partial",
  "reward": 0,
  "cost": 0,
  "latency_ms": 0,
  "failure_mode": null,
  "environment_fingerprint": "...",
  "evidence": {},
  "verified": true,
  "observed_at": "2026-09-15T00:00:00.000Z"
}
```

### replacement_suggestion

```json
{
  "schema_version": "autoarmory/replacement-suggestion/v1",
  "candidate_id": "...",
  "capability_id": "vendor.module",
  "action": "replace|degrade|retire|probe|retest",
  "reason": "...",
  "evidence_refs": []
}
```

## 6. Algorithm ladder

Implement in this order:

1. deterministic constraint filter: permissions, risk, sensitivity, write mode, budget, latency;
2. Bayesian reliability: Beta-Binomial posterior and uncertainty;
3. constrained Thompson Sampling: select within the feasible set;
4. Pareto portfolio: reliability, cost, p95, risk, coverage, freshness;
5. change-point detection: regressions in timeout, error, false-positive and conformance signals;
6. active conformance: scheduled schema, tool-name, permission, return-shape and fallback probes;
7. off-policy evaluation: only after enough verified outcome history exists.

No deep reinforcement learning in the first implementation.

## 7. Safety and privacy

- High-risk and write-capable modules require explicit human approval.
- No module may exceed its declared permissions.
- No private transcript enters a public export.
- Local-first storage and exportable canonical records are mandatory.
- Missing gate, malformed evidence or stale conformance results fail closed.
- Synthetic examples are fixtures, never evidence of learned policy.

## 8. Conformance

Every adapter must prove reproducible input and output:

- stable adapter identity and version;
- canonical output schema;
- deterministic fixture with expected output;
- permission and forbidden-domain declarations;
- input hash, output hash and environment fingerprint;
- negative cases for malformed, unauthorized and stale inputs.

## 9. First implementation slice

Start inside AutoArmory, not a new repository:

```text
autoarmory capability register
autoarmory capability list
autoarmory capability health
autoarmory capability route
autoarmory capability portfolio
autoarmory capability retire
```

The first slice should support one runner, one evaluator, one scanner and one MCP gateway adapter. Routing may begin with deterministic constraints plus Bayesian reliability. Thompson, Pareto and change-point layers follow only after the contracts are stable.

## 10. Acceptance criteria

- identical inputs and seed produce identical routing decisions;
- every decision explains selected, rejected and fallback modules;
- every outcome is linked to a routing decision and an environment fingerprint;
- permission, risk and sensitivity violations are impossible to route around;
- every supported adapter has a positive and negative conformance fixture;
- policy and evidence can be exported without a vendor SDK;
- no synthetic outcome can silently update production policy.

## 11. Non-goals

- generic Agent lifecycle management;
- platform-native skill/MCP/permission replacement;
- automatic high-risk execution;
- a single opaque score for every module;
- claiming learned behavior before verified outcome volume exists.

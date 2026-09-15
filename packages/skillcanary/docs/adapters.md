# Adapter protocol

SkillCanary manages modules by normalizing their outputs into stable contracts. It does not re-implement the module.

## Flow

```text
runner / scanner / gateway / registry / trace
                    |
                    v
             adapter detect
                    |
                    v
             canonical envelope
                    |
                    v
           gate / store / policy
```

## Adapter kinds

| Kind | Examples | Canonical output |
|---|---|---|
| `runner` | skillgrade, agent-skills-eval, promptfoo | Evidence envelope |
| `security` | SkillSpector, Cisco skill-scanner, SARIF producers | Risk envelope |
| `trace` | OpenTelemetry, MLflow, SkillTrace | Trace envelope |
| `registry` | skills.sh, GitHub, npm | Package descriptor |
| `provenance` | Sigstore, SLSA, in-toto, signing services | Attestation envelope |
| `mcp` | MCP gateways and tool manifests | Tool contract |
| `ci` | GitHub Actions, GitLab CI, Jenkins | Gate result |
| `memory` | session and history stores | Session event |

## Commands

```bash
skillcanary adapter list
skillcanary adapter doctor
skillcanary adapter detect result.json
skillcanary adapter import security result.json --output risk.json
skillcanary adapter export result.json --format sarif --output result.sarif
```

## Adapter descriptor

Every adapter declares:

```json
{
  "id": "generic-security",
  "kind": "security",
  "version": "1",
  "capabilities": ["findings", "severity", "sarif-compatible"],
  "input_schema": "json",
  "output_schema": "RiskEnvelope",
  "permissions": { "read": true, "write": false },
  "network": false,
  "determinism": "deterministic",
  "trust": "imported"
}
```

## Rules

- Vendor-specific logic belongs in the adapter, not the core.
- Adapters are read-only by default.
- A missing module produces an explicit unavailable result, never fabricated evidence.
- Canonical output schemas are versioned.
- A module can be replaced without changing the policy engine.

# Compatibility

Compatibility is not a list of file formats. It is a contract between SkillCanary and the rest of the agent toolchain.

## Matrix

| Layer | Representative modules | Input contract | SkillCanary responsibility |
|---|---|---|---|
| Evaluation | skillgrade, agent-skills-eval, promptfoo, skill-up, SkillEvaluator | Evidence envelope | Decide whether the transition may land |
| Security | SkillSpector, Cisco skill-scanner, Mondoo, SARIF | Risk envelope | Decide how findings affect the change and approval path |
| Registry | skills.sh, GitHub, npm | Package descriptor | Verify the exact artifact being published |
| Provenance | Sigstore, SLSA, in-toto, signing services | Attestation | Verify identity, digest and approval |
| MCP | MCP gateways and tool manifests | Tool contract | Check scope, fallback, offload and veto mapping |
| Observability | OpenTelemetry, MLflow, SkillTrace | Trace envelope | Correlate failures with decisions |
| Memory | session history | Session event | Derive outcomes and error-budget metrics |
| CI | GitHub Actions, GitLab CI, Jenkins | Gate result | Publish reports, annotations and comments |

## Conformance levels

| Level | Meaning |
|---|---|
| `Import` | The artifact can be read. |
| `Normalized` | It produces a canonical envelope. |
| `Verified` | Fixtures and contract tests pass. |
| `Live` | A real integration or current artifact has been tested. |
| `CI-gated` | The integration can block a real CI merge. |

Do not call an adapter “supported” until it reaches at least `Verified`.

## Replacement test

A module is replaceable when all of these remain true:

1. the canonical envelope does not change;
2. the gate behavior does not change;
3. the stored evidence remains queryable;
4. the policy history remains valid.

SkillCanary manages modules when their replacement does not force a rewrite of the control plane.

# Agent Evaluation Standards Mapping

AutoArmory learns structures and contracts from external standards, not their domain-specific question banks. The source list below was verified on 2026-09-15.

## HAL

Source: https://arxiv.org/abs/2510.11977 and https://hal.cs.princeton.edu/

Adopt: standardized, cost-aware, third-party evaluation. Map to capability cost, outcome cost, routing budgets, `policy calibrate`, and `policy off-policy`.

Do not import: another leaderboard's dataset into AutoArmory incidents.

## pass^k

Source: https://arxiv.org/abs/2506.07982 and https://github.com/sierra-research/tau2-bench

Adopt: `pass^k` means all k repeated runs succeed, measuring a reliability floor. Use SkillCanary reliability rather than redefining the metric:

```bash
autoarmory canary reliability estimate trials.jsonl --k 3
```

Do not confuse `Pass@k` (capability ceiling) with `Pass^k` (reliability floor).

## Agent-as-a-Judge

Source: https://arxiv.org/abs/2601.05111

Adopt: calibrated judging, reference anchors, bidirectional scoring and human sampling. Map to `autoarmory canary grader calibrate` and `autoarmory policy calibrate`.

Do not let an uncalibrated judge become a release gate.

## ClawsBench

Source: https://arxiv.org/abs/2604.05172 and https://github.com/benchflow-ai/ClawsBench

Adopt: capability and safety are evaluated together. Map to capability `risk`, `trust_level`, `permissions`, human approval for write/high-risk actions, and the `safety_violation` failure mode.

## MCPMark

Source: https://arxiv.org/abs/2509.24002 and https://github.com/eval-sys/mcpmark

Adopt: MCP capabilities need isolated sandboxes, repeatable tasks, conformance checks and failure auto-resume. AutoArmory maps this to `mcp-gateway` capabilities, `capability conformance`, and the `mcp_conformance` failure mode. Auto-resume execution remains a future adapter feature.

## OpenTelemetry GenAI agent spans

Source: https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md

Adopt: use `gen_ai.*` and `error.type` attributes instead of inventing a private trace vocabulary.

```bash
autoarmory observe telemetry.json --format otel --output incidents.jsonl
```

Unsupported or missing OTel attributes are recorded as evidence gaps rather than silently inferred.
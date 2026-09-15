# Failure Modes

AutoArmory's article adapter converts real article lines into canonical incidents. Each mode has a stable action mapping so proposal generation does not depend on an LLM rewriting the failure taxonomy.

| Failure mode | Category | Typical action |
|---|---|---|
| masked_failure | reliability | add_guard |
| evidence_fabrication | evidence | add_guard |
| self_verification | evidence | add_evidence |
| safety_violation | safety | add_guard |
| tool_selection_error | tool_use | add_conformance_check |
| tool_parameter_error | tool_use | add_case |
| missing_validation | evidence | add_evidence |
| rollback_missing | governance | add_rollback |
| tool_degradation | capability | add_drift_check |
| state_drift | reliability | add_drift_check |
| error_accumulation | long_horizon | add_canary |
| collapse_behavior | long_horizon | add_guard |
| failure_vs_no_run | observability | add_failure_mode |
| ambiguous_error | observability | add_evidence |
| cost_overrun | economics | add_cost_guard |
| fabricated_answer | hallucination | add_guard |
| expectation_mismatch | communication | add_case |
| communication_error | communication | add_case |
| tool_efficiency_error | tool_use | add_budget_guard |
| incomplete_output | output | add_case |
| gate_bypass | governance | add_gate |
| synthetic_overclaim | governance | add_evidence |
| scope_creep | strategy | reject_scope |
| mcp_conformance | capability | add_mcp_conformance |
| agent_judge_bias | evaluation | add_calibration |
| passk_misuse | evaluation | add_reliability_metric |
| otel_schema_drift | observability | add_otel_adapter |
| benchmark_contamination | evaluation | add_evidence |

Use:

```bash
autoarmory observe article.md --format article --output incidents.jsonl
autoarmory observe telemetry.json --format otel --output otel-incidents.jsonl
```
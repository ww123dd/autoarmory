# Trajectory metrics

A final answer is not enough. SkillCanary analyzes six dimensions separately:

1. tool selection;
2. parameter extraction;
3. result utilization;
4. error recovery;
5. plan coherence;
6. task completion.

## Command

```bash
skillcanary trajectory analyze trace.json --output metrics.json
```

## Output

```json
{
  "schema_version": "skillcanary/metrics/v1",
  "task_id": "refund-task",
  "trial_id": "trial-1",
  "tool_selection": { "f1": 1 },
  "parameter_extraction": { "pass_rate": 1 },
  "result_utilization": { "utilization": 1 },
  "error_recovery": { "class": "retry" },
  "plan_coherence": { "pass": true },
  "task_completion": { "score": 1 },
  "pass": true
}
```

The dimensions are kept independent. Do not collapse them into one score.

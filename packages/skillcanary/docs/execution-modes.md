# Execution modes

Not every step should be an agent.

| Mode | Use when |
|---|---|
| `deterministic` | The next step is known and branch-free |
| `workflow` | Control flow is bounded and explicit |
| `agent` | The task is open-ended or exploratory |
| `human_approval` | High-risk, irreversible or above a limit |

## Command

```bash
skillcanary execution audit workflow.json
```

The audit reports:

- declared versus recommended mode;
- agent overuse;
- high-risk steps without human approval;
- cascade reliability.

This is the deterministic-first control policy.

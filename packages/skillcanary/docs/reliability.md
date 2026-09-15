# Reliability

Reliability is a distribution, not one run.

## Command

```bash
skillcanary reliability estimate trials.jsonl --k 4
skillcanary reliability compare before.jsonl after.jsonl
skillcanary reliability compose steps.json
```

## Metrics

- pass@1;
- pass^k;
- Wilson confidence interval;
- cost per success;
- p95 latency;
- security violations;
- composite end-to-end success.

## Composite error

If each step has probability `p_i`, the independent end-to-end estimate is:

```text
P(success) = product(p_i)
```

Conditional dependencies must be represented explicitly. A high per-step pass rate can still produce a weak end-to-end system.

## Release rule

A release should be judged on:

- pass^k rather than pass@1;
- confidence interval;
- cost per successful task;
- p95 latency;
- zero severe security violations.

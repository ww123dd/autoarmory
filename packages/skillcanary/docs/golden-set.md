# Golden set

Golden sets are maintained assets, not one-off test files.

## Command

```bash
skillcanary golden curate candidates.jsonl --top 20 --output golden.json
```

## Suites

- **Capability suite**: tasks the agent cannot yet complete reliably;
- **Regression suite**: tasks the agent has completed reliably and must not break.

## Acquisition signals

- severity;
- determinism;
- frequency;
- coverage gap;
- uncertainty;
- assertion readiness.

Real production failures are the preferred source. Every case should be privacy-reviewed before it enters a public repository.

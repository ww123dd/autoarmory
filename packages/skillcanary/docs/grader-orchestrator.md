# Grader orchestrator

Use deterministic checks first.

```text
exact match / schema / rule
        -> deterministic
bounded semantics
        -> rules
open-ended quality
        -> calibrated LLM ensemble
high-risk or irreversible
        -> human
```

## Commands

```bash
skillcanary grader plan step.json
skillcanary grader calibrate pairs.json
```

Calibration reports Cohen's kappa:

- `>= 0.8`: trusted;
- `0.6 - 0.8`: cautious;
- `< 0.6`: unusable for release gating.

LLM judges must declare their model family, shuffle/order policy and whether they can return `unknown`.

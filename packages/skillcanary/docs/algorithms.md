# Algorithms

SkillCanary is a policy and evidence system, not an autonomous optimizer.

## Current loop

```text
decision history
  -> reward vector
  -> posterior / confidence
  -> action mask
  -> recommendation
  -> gate
  -> outcome
  -> next update
```

## Reward vector

The old policy compressed everything into one scalar. The new implementation keeps the objectives:

- fixed;
- regressed;
- user corrections;
- rework turns;
- tool errors;
- cost;
- independent verification.

A scalar reward still exists for ranking, but it is not the only representation:

```text
reward = fixed
       - 2.0 * regressed
       - 0.5 * corrections
       - 0.25 * rework
       - 0.1 * tool_errors
       - 0.01 * cost
       + 0.5 * verified
```

## Policies

`policy recommend` supports:

| Algorithm | Description | When to use |
|---|---|---|
| `greedy` | Highest historical mean | Debugging and baselines |
| `ucb` | Mean plus exploration bonus | Stable environments |
| `thompson` | Sample from a Beta posterior | Uncertain or small-sample environments |
| `hybrid` | UCB plus Thompson sample | Default exploratory mode |

The UCB baseline remains:

```text
score(action) = mean + sqrt(c * ln(total + 1) / count)
```

Thompson sampling uses a Beta posterior over reward quality in `[0,1]`.

## Pareto frontier

`policy pareto` keeps non-dominated actions across:

- fixed rate;
- regressions;
- corrections;
- rework;
- tool errors;
- cost;
- reward.

The result is intentionally not a single “best action”. A policy recommendation is contextual, and a high-reward action with high regression risk is not automatically safe.

## Drift detection

`policy drift` and `drift check` use CUSUM change-point detection. This matters because:

- model versions change;
- MCP servers change;
- cases become flaky;
- users change their task distribution.

A stationary UCB assumes these changes do not happen. SkillCanary explicitly checks that assumption.

## Active case selection

`active rank` prioritizes advice candidates by:

- severity;
- determinism;
- frequency;
- assertion readiness;
- canary availability.

This is a lightweight acquisition function. The goal is to select the cases that reduce uncertainty fastest, not to collect the largest dataset.

## Simulation lab

`policy simulate` compares greedy, UCB, Thompson and hybrid policies on synthetic reward distributions with a fixed seed. It is an algorithm laboratory, not production evidence.

## Safe policy rules

- Recommendations never execute changes.
- High-risk actions can be masked.
- Blocking promotion still requires deterministic evidence and a canary.
- The policy is allowed to be exploratory; execution remains constrained.
- History is training data, not a rule store.

# Policy engine

Experience is not the product. The policy is the product.

SkillCanary treats skill development as a sequential decision problem.

```text
state s_t
  skill version, task context, failure mode, risk, budget, history

action a_t
  add_rule / remove_rule / split_file / change_route /
  add_case / add_hook / change_tool_contract / rollback

outcome y_{t+1}
  fixed / regressed / cost_delta / user_correction_delta / verification

reward r_t
  fixed*1 - regressed*2 - cost*0.01 - corrections*0.5 + verification pass
```

## Domain-agnostic adapters

| Adapter | Responsibility |
|---|---|
| TaskAdapter | Run a task and produce an outcome |
| SkillAdapter | Expose editable skill surfaces |
| MetricAdapter | Convert outcome into reward signals |
| VerifierAdapter | Independently verify the result |
| RuntimeAdapter | Connect hooks, CI and automation |

## MVP

```bash
skillcanary policy record examples/decision.example.json
skillcanary policy stats
skillcanary policy recommend --failure-mode missing-schema-check
```

The first implementation is a contextual-bandit baseline using UCB:

```text
score(action) = mean_reward + sqrt(2 * ln(total + 1) / count)
```

This is not full RL. It is the smallest useful policy that can learn which action works for a failure mode.

## Algorithm lab

The project now also ships a deterministic simulation lab, reward vectors, Pareto analysis and CUSUM drift detection. See [Algorithms](algorithms.md).

```bash
skillcanary policy simulate --horizon 100 --seed 7
skillcanary policy pareto --log .skillcanary/decisions.jsonl
skillcanary policy drift --log .skillcanary/decisions.jsonl
```

## Safety

- High-risk actions are masked or require human approval.
- Blocking promotion requires deterministic verification and a canary.
- History is training data, not a rule store.
- The policy learns how to improve skills, not what business content to memorize.
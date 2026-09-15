# Evidence discipline

SkillCanary borrows four mature testing/release practices.

## 1. Automated canary analysis

Borrowed idea: Spinnaker/Kayenta-style canary analysis.

Rule: do not promote a change from a noisy score. Use a minimum sample, compare before/after, and only promote when the improvement is outside the noise band.

Applied to SkillCanary:

- `budget.repeat >= 3` is the minimum, not a proof.
- Prefer `FAIL->PASS` state transition over average score.
- If the score is noisy, switch to a deterministic metric: token use, tool calls, artifact presence, or a script assertion.

## 2. Flaky quarantine

Borrowed idea: flaky-test quarantine.

Rule: a flaky signal must not become a blocking gate.

Applied to SkillCanary:

- `flaky` / `quarantined` advice stays out of `blocking`.
- It can stay in `advice`, `candidate` or `shadow`.
- It must be rerun before promotion.

## 3. Progressive delivery

Borrowed idea: feature toggles and progressive delivery.

Rule: promote in stages, not all at once.

Applied to SkillCanary:

```text
advice -> candidate -> case -> shadow -> warning -> blocking -> retired
```

Blocking requires stable evidence, a deterministic check, high risk, and a must-fail canary.

## 4. Hidden / held-out tests

Borrowed idea: held-out benchmark sets.

Rule: the change target must not be a hidden case.

Applied to SkillCanary:

- A case can be marked `held_out: true`.
- Held-out cases are for regression, not for tuning.
- `gate` must reject a `held_out` case as the target of a change.

## 5. Error budget

Borrowed idea: SRE error budget.

Rule: stop changing when the system has no measurable improvement budget left.

Applied to SkillCanary:

- Track `user_correction_count`, `rework_turns`, `tool_error_count`.
- If repeated changes are flat, stop and collect new incidents instead of editing the skill again.

## 6. Test oracle / mutation testing

Borrowed idea: test oracle and mutation testing.

Rule: every blocking gate needs a must-fail sample.

Applied to SkillCanary:

- `armor.canary` is required for `blocking`.
- `promote --blocking` refuses a piece without a deterministic check and a canary.
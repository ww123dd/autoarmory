# Mechanism Core Design

Status: first slice implemented in isolated branch  
Date: 2026-09-15  
Foundation: SkillCanary evidence and gate contracts

## Core Shift

AutoArmory does not manage rules. It manages mechanisms and whether those mechanisms remain effective.

A rule says what to do in one situation. A mechanism prevents, detects, recovers from, or closes a class of failures and carries its own evidence, verification and lifetime.

## Core Objects

- `usage_contract`: where a capability is used, who calls it, what success means and who owns it.
- `case`: a reproducible, evidence-backed problem admitted from a signal or incident.
- `mechanism`: a control asset that covers one or more failure modes.
- `mechanism_run`: an execution or replay of a mechanism against a case.
- `closure`: proof that a verified mechanism closed a case without regression.
- `effectiveness`: coverage, pass rate, closure rate, recurrence and drift signals.

## Admission Rules

A case cannot enter the error set unless:

1. a usage contract exists;
2. expected and actual outcomes are present;
3. evidence is present;
4. the case is reproducible;
5. a failure mode is assigned.

A mechanism cannot become active unless:

1. it declares covered failure modes;
2. it declares trigger, action, verification and closure criteria;
3. verification is independent from the actor;
4. the mechanism passes admitted cases without regression.

A case cannot close unless:

1. a registered mechanism ran against it;
2. the run is independently verified;
3. the run passed;
4. the run did not introduce a regression;
5. closure evidence is recorded.

## Lifecycle

```text
signal -> case admission -> mechanism candidate -> verified run
       -> active mechanism -> closure -> effectiveness -> degrade / retire
```

## Effectiveness

The first effectiveness ledger reports:

- runs;
- verified passes;
- closures;
- closure rate;
- pass rate;
- recurrence rate.

Precision and recall require labelled negative controls and remain `insufficient_data` until that evidence exists.

## Non-Goals

- adding one rule per incident;
- trusting the fixer to verify the fix;
- updating policy from synthetic outcomes;
- automatically executing high-risk actions;
- treating a successful tool call as a successful task.
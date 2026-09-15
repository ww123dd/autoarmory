# Positioning

## Category

SkillCanary is an **agent change control plane**.

It is not a runner, linter, scanner or registry. It connects those layers and owns the question they do not answer:

> **May this agent change land, and what should we try next?**

## The real pain

People rarely say "my Skill management is broken." They say:

- "It drifted again."
- "The MCP was not available."
- "It went around the permission boundary."
- "It passed once, but I cannot reproduce it."
- "We changed the rule and something else broke."
- "The same failure keeps returning."
- "We keep adding rules and the Skill keeps getting bigger."

The common root is the missing improvement loop:

```text
real failure -> case -> evidence -> gate -> outcome -> policy
```

## Five shipped mechanisms

1. **Evidence-backed change gate**
   A change must target a case (`FAIL->PASS`) or a deterministic check (`COUNT->0`).

2. **Provenance**
   Author/reviewer separation, independent verification, skill hashes and evidence-file SHA-256 turn a self-report into an index over checkable artifacts.

3. **Runner adapters and evidence storage**
   `import auto` consumes common runner shapes; `store index` materializes `eval_run` / `eval_case_score` and exports generic SQL.

4. **Error budget**
   Correction, rework and tool-error signals decide when to stop adding rules and collect new incidents.

5. **Policy engine**
   Decisions, outcomes and rewards produce the next improvement recommendation instead of another permanent rule.

## Reliability layer

The control plane now adds:

- six-dimensional trajectory metrics;
- pass^k reliability and confidence intervals;
- deterministic, workflow, agent and human execution modes;
- calibrated LLM graders with Cohen's kappa;
- capability and regression golden sets.

## Algorithm and adapter moat

The control plane is reinforced by two capabilities that are hard to copy without re-architecting:

1. a canonical adapter protocol that turns external runners, scanners, registries and gateways into inputs;
2. a safe policy lab that learns from reward vectors, detects drift and recommends the next action without executing it.

## Audience

- teams maintaining more than one Agent Skill;
- platform teams managing MCP boundaries and permissions;
- people using Codex, Claude Code, Cursor or similar agents;
- maintainers who are tired of "I changed the prompt, it feels better".

## Non-goals

- Not an agent runner.
- Not a model provider.
- Not a security scanner.
- Not a hosted registry or dashboard.
- Not a multi-agent framework by default.
- Not a generic YAML runtime.

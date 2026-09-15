# Why AutoArmory Must Be Used

Most teams already have tools for individual jobs:

- Langfuse observes traces.
- LiteLLM routes models.
- ContextForge connects MCP servers.
- GEPA optimizes prompts or code.
- promptfoo evaluates prompts and agents.
- SkillCanary gates a change with evidence.

Those tools do not answer the cross-vendor decision problem:

> Given this task, risk, data sensitivity, permission boundary, budget and latency SLO, which capability combination should run now—and what should be retired if it stops working?

AutoArmory is the decision and lifecycle layer for that question.

Use AutoArmory when:

- you use more than one runner, evaluator, scanner, MCP gateway or memory provider;
- you need to explain why a module was selected or rejected;
- you need cost, latency, risk and permission constraints enforced together;
- you need outcome-driven promotion, degradation, replacement and retirement;
- you need evidence and provenance without locking into one platform vendor.

Do not use AutoArmory when:

- you use exactly one provider and have no intention of comparing capabilities;
- you do not collect verified outcomes;
- you need an agent framework or a hosted eval dashboard instead of a control plane.
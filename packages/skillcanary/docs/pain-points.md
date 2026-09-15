# Pain points

Most users do not wake up wanting to manage Skills. They experience a different set of failures.

## The real complaints

| Complaint | Underlying failure | SkillCanary layer |
|---|---|---|
| "It drifted again." | No stable behavioral regression | case / deterministic evidence |
| "It keeps forgetting the process." | Knowledge is not routed or anchored | skill checks / references / anchor |
| "The MCP is unavailable again." | Tool contract and fallback are undocumented | MCP onboarding and veto mapping |
| "It tried to use a database directly." | Permission boundary is not mechanical | hook / gate / policy |
| "The change feels better, but I cannot prove it." | No before/after evidence or provenance | change gate / provenance |
| "The same incident came back." | Incident was not converted into a regression | scan / advice / promote |
| "We add a rule every week." | Error budget is not measured | budget / stop signal |
| "I do not know what to fix next." | Outcomes are not recorded as decisions | policy engine |
| "The long task fell apart." | Context and handoff are unmanaged | not solved; multi-agent is not the default |
| "It is too expensive and slow." | Model and retry behavior are unmanaged | future routing / not a current claim |

## What to sell

Do not sell "Skill management". Sell the outcome:

1. fewer repeated failures;
2. fewer unverifiable changes;
3. fewer permission surprises;
4. less rework;
5. a clear next action.

## What not to claim

- SkillCanary is not a universal agent reliability platform.
- It does not make an agent smarter.
- It does not replace evaluation, security or sandboxing.
- It does not solve context-window limits by adding more agents.
- It does not turn an unstable workflow into a reliable one by adding rules alone.

The product wedge is:

> **When the agent changes, how do you know it is safe to ship?**

# Launch plan

## Goal

Make SkillCanary the default change gate for Agent Skills.

## Phase 1: MVP

- Ship dependency-free CLI: `lint`, `gate`, `anchor`, `mcp-onboard`, `verify`.
- Publish examples and schemas.
- Add a GitHub Action.
- Add CI and tests.
- Write an English README and a Chinese README.

## Phase 2: Proof

- Build a public benchmark with 50-100 real skill regressions.
- Record false positives and false negatives for static checks.
- Show 3 case studies:
  - orphan rule;
  - judge false pass;
  - MCP boundary/offload failure.
- Recruit 5 design partners.

## Phase 3: Ecosystem

- Integrate with `skillgrade`, `agent-skills-eval`, and `promptfoo` as runners.
- Add PR comments and HTML reports.
- Add adapters for Codex and Claude Code.
- Publish a docs site.

## Phase 4: Launch

- English launch: Hacker News, Reddit, X, LinkedIn.
- Chinese launch: Juejin, Zhihu, V2EX, WeChat.
- Publish a "why skill rot happens" article.
- Publish a 30-second demo.

## Star math

This is a distribution model, not a promise.

| Scenario | Expected stars |
|---|---:|
| Current local skill, published as-is | 10-100 |
| Polished standalone CLI and docs | 100-500 |
| Benchmark, Action, integrations and launch | 500-2,000 |
| Category default with ecosystem adoption | 2,000-10,000+ |

10k stars require repeated distribution, not one launch. The project needs to become the thing people link to when they say: "my skill changed, how do I know it got better?"
## Messaging

Do not launch as "Skill management". Launch against observable pain:

1. Agent drift.
2. MCP and permission surprises.
3. Unverifiable changes.
4. Repeated incidents.
5. Rule growth without an error budget.

The demo must show one red gate becoming green only after evidence is linked. Feature lists are supporting material, not the hook.

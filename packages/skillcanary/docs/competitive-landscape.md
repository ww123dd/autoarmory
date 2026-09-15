# Competitive landscape

Researched on 2026-09-14. Star counts are snapshots and change over time.

## The category mistake

SkillCanary should not try to beat every competitor on its own surface:

- beat an eval runner on execution;
- beat a security scanner on vulnerability coverage;
- beat a best-practices guide on prose;
- beat a registry on distribution;
- beat a drift tool on version diffing.

That creates a larger feature list and a weaker category.

The gap is the control plane between them:

> **May this agent change land, and what should we try next?**

## Layers

| Project / category | Layer | What it is good at | SkillCanary relationship |
|---|---|---:|---|
| `skillgrade` | Agent skill eval runner | Runs agents, custom graders, multi-agent support | Consume results through `import auto` |
| `agent-skills-eval` | Agent skill eval runner | agentskills.io spec, with/without baseline, HTML reports | Consume baseline/candidate evidence |
| `promptfoo` | General LLM eval/CI | Providers, assertions, red teaming and CI | Consume summary/trial artifacts |
| `skills-best-practices` | Guide | Naming, progressive disclosure, references | Turn recommendations into executable checks |
| `skillwarden` / `skillguard` / `skillgate` | Security | Scanning, install gates, CVE/advisory workflows | Keep security separate; consume results |
| `SkillSeal` | Provenance | Fingerprints, signatures, publisher keys | Integrate anchor/signature provenance later |
| `SkillDrift` / `skillrot` | Drift | Detect source and dependency drift | Treat drift as one signal |
| Registry | Distribution | Store, publish and install skills | Gate before publish; do not host a registry |

## Moat

The moat is not linting. The moat is the combination of:

1. a domain-agnostic evidence model;
2. runner adapters that turn other tools into inputs;
3. provenance over independently checkable artifacts;
4. a persistent evidence store and queryable transitions;
5. error-budget metrics;
6. a policy engine that recommends the next action;
7. runtime hooks and CI integration;
8. a public, executable regression dataset.

## Positioning sentence

> Eval runners test whether the skill works. Security scanners test whether it is safe. SkillCanary is the control plane that decides what may land, stores the evidence and learns what to try next.

## What not to do

- Do not rebuild the agent runner.
- Do not build a vulnerability database.
- Do not become a registry.
- Do not replace promptfoo.
- Do not add multi-agent orchestration before the single-agent reliability loop is proven.
- Do not build a dashboard before the evidence tables are queried by real users.

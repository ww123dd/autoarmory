# Comparison

SkillCanary is not trying to replace the tools that came before it. It sits between them.

| Project | Layer | What it is good at | SkillCanary relationship |
|---|---|---|---|
| `skillgrade` | Eval runner | Runs agents against skills, custom graders, multi-agent support | Consume its results through `import auto` |
| `agent-skills-eval` | Eval runner | agentskills.io spec, YAML/JSONL, HTML reports, with/without baseline | Consume baseline/candidate evidence |
| `promptfoo` | General eval/CI | Broad provider support, CI, PR before/after, red teaming | Consume summary/trial artifacts; keep skill governance separate |
| `skills-best-practices` | Guide | Naming, progressive disclosure, one-level references | Turn the rules into executable lint checks |
| `skillwarden` | Security gate | Deterministic scanning, lockfile drift, advisory DB, install-time gate | Keep security separate; consume its result if needed |
| `skillguard` | Security scanner | Multi-language static analysis and CVE detection | Do not duplicate the threat database |
| `skillgate` | Security auditor | Audit before install across many agent clients | Do not compete on security install policy |
| `SkillSeal` | Provenance | Fingerprints, signatures, publisher keys | Future anchor/signature integration |
| `SkillDrift` / `skillrot` | Drift monitor | External CLI/version drift and source drift | Treat drift as one input to the gate |
| `skillci` (npm) | Security audit + CI reporting | Existing npm name | SkillCanary uses a separate package name |

## One sentence

> Eval runners test whether the skill works. Security scanners test whether it is safe. SkillCanary is the control plane that decides what may land, stores the evidence and learns what to try next.

## Non-goals

See `docs/non-goals.md`.

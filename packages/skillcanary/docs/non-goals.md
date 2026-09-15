# Non-goals

SkillCanary deliberately does not do these things.

## Not an agent runner

SkillCanary does not launch Claude, Codex, Cursor, Gemini or any other agent. Use `skillgrade`, `agent-skills-eval`, `promptfoo` or your own harness.

## Not a security scanner

SkillCanary does not maintain a malware database, scan for prompt injection or replace Snyk/Mondoo/SkillWarden/SkillGuard. It can consume their result as an input.

## Not a multi-agent framework by default

Do not split work across multiple agents until the single-agent armor loop is proven. Multi-agent adds coordination cost and new failure modes.

## Not a registry

SkillCanary does not store, host or distribute skills. It is the gate before publish or merge.

## Not a prompt marketplace

SkillCanary does not rank prompts or skills. It checks change quality and release readiness.

## Not a generic YAML framework

SkillCanary uses a small, explicit schema. It is not trying to become an arbitrary workflow engine.

## Not a judge replacement

SkillCanary does not decide whether an LLM answer is good. It checks whether the change has a case, a decision, an expected transition, evidence and a reproducible anchor.
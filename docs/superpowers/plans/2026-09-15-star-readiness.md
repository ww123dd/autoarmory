# AutoArmory Star-Readiness Plan

**Goal:** Make the value of AutoArmory understandable and reproducible in under 60 seconds.

**Primary reason to use:** It is the neutral decision layer that chooses, gates, and retires capability modules by context and verified outcomes.

## Task 1: Killer demo

- Add `autoarmory demo`.
- Show constrained routing, rejection, approval, outcome updates, degradation, and retirement.
- Produce deterministic output plus a Markdown report.
- Test the complete demo output.

## Task 2: Capability Routing Bench

- Add `autoarmory bench`.
- Compare cheap-only, trusted-only, and AutoArmory constrained routing.
- Measure success, cost, p95, safety violations and fallback use.
- Mark results as synthetic benchmark evidence, never production learning.

## Task 3: Integration imports

- Add `autoarmory integrate list|import`.
- Support runner SkillGrade/promptfoo, scanner SARIF, MCP ContextForge/Docker-style registry, and OTel span input.
- Normalize imports into capability and incident records with conformance fixtures.

## Task 4: Must-use narrative and release readiness

- Add `docs/why.md` with the non-replaceable reason.
- Update README hero and comparison table.
- Add tests to CI.
- Run full tests, conformance, self-eval and pack dry-run.
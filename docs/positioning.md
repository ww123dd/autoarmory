# Positioning: the gate after the optimizer

**We do not build an optimizer. We build the gate that runs after one.**

Four questions, each answerable only from records:

> After your skill was optimised: was it actually used? Was it used correctly? Whose fact proves the result? And when that proof dies, who retires it?

## Why this is a different layer

| layer | who does it | us |
|---|---|---|
| produce / discover skills | skill-creator, EvoSkill | no |
| **optimise** skills (edit the text until scores improve) | **SkillOpt (Microsoft Research, 2026-06)**: text-space optimizer, trajectory-driven edits, validation-gated updates, best-or-tied in 52 evaluation cells | **no, deliberately** |
| **verify and manage the lifecycle** of a capability in one operator environment | nobody systematically | **yes** |

The most advanced optimizer still needs a validation gate - SkillOpt calls its own updates "validation-gated". But that gate is *its* benchmark in *its* environment. That is the self-证明 problem this project exists to remove: when the thing that improves a skill also decides whether the improvement worked, the score is part of the product.

Stronger optimizers do not crowd this layer out; they enlarge its entrance. More optimised skills means more claims of "it got better", and every such claim needs an external fact before anyone can act on it. The analogy is SLSA to build tools and TUF to package managers: nobody expects SLSA to write a compiler.

## What that means concretely

- any optimizer may produce the skill package; we take it, and we re-derive its evidence instead of trusting its self-report (`admit` / `gate` on the operator own facts);
- provenance is carried in an in-toto Statement (`subject` digest = the bytes on disk, `predicateType` ours), so other tooling can read our claims (`docs/verifier-expansion.md`, `npm run check:attestations`);
- a verdict only holds while the same runner, through the same fixed contract, re-derives the same fact; when it stops holding, the promotion is retired with the fact that forced it (`stale_verdict_escape_count`, `stale_lifecycle_escape_count`, `stale_candidate_escape_count` all 0 in the acceptance);
- we never become the thing that decides an improvement "worked" from its own benchmark.

## What we refuse to do

- optimise skill text (that is SkillOpt / EvoSkill territory, and a high-resource arena);
- route across many skills as a product (frozen experiment, tag `freeze/selection-execution-outcome-contracts-20260916`);
- a generic memory system, a cross-vendor control plane, a background verification service, a 900-task benchmark farm.

## The honest risk

If an optimizer adds its own external verification and lifecycle management, this stops being an adjacent layer and becomes a competitor. Then the only defensible asset left is the **domain fact source** - this operator own database, processes, repositories and published artefacts - which is why the machine-local verifiers remain the thing worth growing.
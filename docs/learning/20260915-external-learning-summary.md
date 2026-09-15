# External Learning Summary

Date: 2026-09-15

## Input

- 22 source articles across Tier 1-4.
- 84 observed incidents extracted with source path, line number, severity and failure mode.
- 23 curated candidates retained after failure-mode deduplication.
- 61 duplicate/low-priority incidents deferred.
- 3 Tier 4 articles explicitly rejected from the candidate pool.

## What was integrated

- Article observation adapter: `autoarmory observe <file> --format article`.
- OTel GenAI span observation adapter: `autoarmory observe <file> --format otel`.
- Failure-mode taxonomy and deterministic proposal action mapping.
- Candidate records retain `failure_mode` for later calibration and drift analysis.
- External standards mapping for HAL, pass^k, Agent-as-a-Judge, ClawsBench, MCPMark and OTel.

## Evidence boundary

The article pipeline completed `observe -> propose -> gate` only. It did not create or claim real outcomes. Reliability, Thompson policy and off-policy evaluation remain unchanged until verified execution outcomes exist.

Raw article-derived incidents and curation artifacts are stored outside the public repository in the local learning session directory.
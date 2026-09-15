# Changelog

## 0.9.0

- Added six-dimensional trajectory metrics with independent tool, parameter, utilization, recovery, plan and completion checks.
- Added pass^k reliability estimation, Wilson intervals, cost-per-success, p95 latency and composite step reliability.
- Added deterministic-first grader orchestration with Cohen's kappa calibration.
- Added deterministic/workflow/agent/human execution-mode auditing.
- Added capability/regression golden-set curation.
- Extended adapters with EvalPort, OpenTelemetry, Langfuse and MLflow descriptors plus EvalPort/OTel export.
- Extended doctor with trajectory, reliability and execution-mode status.

## 0.8.0

- Added canonical adapter protocol for runner, security, trace, registry, provenance, MCP and CI artifacts.
- Added `adapter list|detect|import|export|doctor` with SARIF and JUnit export.
- Added Thompson sampling, hybrid policy, reward vectors, Pareto analysis, CUSUM drift detection and deterministic policy simulation.
- Added `active rank` for information-value-based failure candidate selection.
- Added `drift check` for outcome change-point detection.
- Extended `doctor` with adapter registry, drift and policy status.
- Added algorithm, adapter and compatibility documentation.

## 0.7.0

- Repositioned SkillCanary as an agent change control plane.
- Added `doctor` as the unified reliability status and next-action command.
- Added pain-point documentation and refreshed positioning, README and FAQ.
- Added `doctor` to the GitHub Action and example scripts.
- Kept runner adapters, provenance, evidence store, error budget and release preflight in the shipped surface.

## 0.6.0

- Added robust skillgrade, agent-skills-eval and promptfoo artifact adapters, including `import auto`.
- Imported changes now use the modern `target.kind` schema instead of the legacy `target_case` shape.
- Added JSONL-backed `store index`, `store query` and generic SQL export for `eval_run` / `eval_case_score`.
- Added `budget ingest`, `budget stats` and `budget check` with correction, rework and tool-error signals.
- Added `hook doctor` with hard failures for malformed rules and invalid regexes.
- Added executable real-regression benchmark cases and runner.
- Rewrote English and Chinese READMEs around evidence, policy, storage, runtime boundaries and shipped vs planned status.

## 0.5.0

- Added provenance schema and gate --require-provenance with local evidence hash verification.
- Added Evidence Envelope, eval run and eval case score storage contracts.
- Added evidence normalize/record/stats commands.
- Rewrote English and Chinese READMEs around evidence, trust, policy and runtime layers.

## 0.4.0

- Added domain-agnostic decision log and policy engine MVP.
- Added policy record/stats/recommend with a UCB contextual-bandit baseline.
- Added decision schema, policy library and policy-engine documentation.
- Generalized change targets to case | deterministic; deterministic evidence uses COUNT->0.
- Reframed experience capsules as decision records.

## 0.3.0

- Added host-agnostic hook command for session-start, pre-tool, stop and session-end.
- Added runtime-layer documentation and hook examples.
- Added configurable .skillcanary/hook-rules.json example.

## 0.2.0

- Gate now requires cases.json by default; --allow-no-cases is drafting-only.
- Lint severity rebalanced; .skillcanaryignore supports scoped suppression.
- Secret detection skips placeholders, env vars and function signatures.
- Anchor --output supports absolute paths.
- Added scan, advice, promote, armor and track minimum Armor Runtime commands.
- Added advice, armor and outcome schemas.

## 0.1.0

- Initial MVP.
- Added `lint`, `gate`, `anchor`, `mcp-onboard`, `verify` and `init`.
- Added dependency-free CLI, schemas, examples and tests.

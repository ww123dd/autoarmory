# Roadmap

## v0.1 - MVP

- [x] dependency-free CLI
- [x] lint, gate, anchor, mcp-onboard, verify, init
- [x] schemas
- [x] examples
- [x] tests
- [x] GitHub Action skeleton
- [x] English and Chinese README

## v0.2 - Proof

- [x] benchmark harness
- [x] executable self-regression dataset
- [x] Markdown report
- [ ] HTML report
- [x] PR comment mode and mocked API test
- [x] JSONL output and query layer
- [ ] `skillcanary explain` for every failure
- [ ] 50-100 externally sourced partner regressions

## v0.3 - Ecosystem

- [x] doctor as the unified reliability entrypoint
- [x] skillgrade adapter
- [x] agent-skills-eval adapter
- [x] promptfoo adapter
- [x] Codex / Claude Code wiring guidance
- [x] evidence table materialization and SQL export
- [x] error-budget metrics
- [ ] docs site

## v0.4 - Reliability

- [x] runner auto adapters
- [x] JSONL evidence store and SQL export
- [x] error-budget metrics
- [x] release preflight and privacy scan
- [ ] live GitHub PR comment verification
- [ ] three external design partners
- [ ] 50-100 externally sourced regressions
- [ ] hosted dashboard decision after real query usage

## v0.8 - Algorithms and adapters

- [x] reward vectors and Pareto analysis
- [x] Thompson sampling, hybrid policy and deterministic simulation
- [x] CUSUM drift detection
- [x] active case ranking
- [x] canonical adapter protocol
- [x] SARIF and JUnit export
- [x] adapter registry doctor
- [ ] live runner conformance against current upstream artifacts
- [ ] trace and provenance adapters against real providers
- [ ] off-policy evaluation on real decision logs

## v0.9 - Reliability

- [x] six-dimensional trajectory metrics
- [x] pass^k and Wilson confidence intervals
- [x] composite step reliability
- [x] calibrated grader routing
- [x] execution-mode audit
- [x] capability/regression golden-set curation
- [x] EvalPort and OTel adapter/export
- [ ] live trajectory imports from OpenTelemetry, Langfuse and MLflow
- [ ] production threshold calibration
- [ ] shadow/A-B version comparison on real traffic

## v1.0 - Standard

- [ ] stable JSON schemas
- [ ] plug-in check API
- [ ] signed skill lock
- [ ] registry compatibility
- [ ] third-party design partners
- [ ] live host hook verification

## Explicitly not next

- A hosted dashboard before the tables are queried by real users.
- Multi-agent orchestration before the single-agent improvement loop is proven.
- More rules when the error budget says to stop and collect new incidents.

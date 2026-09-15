# Self-Evaluation

AutoArmory can evaluate its own deterministic evidence surface:

```bash
autoarmory self-eval --runs 3 --output self-eval.json
```

The command runs the core test suites as a Pass^k check and includes conformance, capability contracts, docs and repository integrity.

Self-evaluation is not an independent audit. The output always marks `independence.independent=false` and records the self-assessment bias. Use it to detect reproducible local regressions, not to certify production readiness.
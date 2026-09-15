# Change Gate

`npm run hooks:install` sets `core.hooksPath=.githooks` for this repository. The pre-commit hook runs:

```bash
node scripts/change-gate.js --staged
```

The gate does not judge code quality. It blocks one specific failure mode: adding a new command, schema, learning summary, plan/spec, package script or strong README vocabulary without either:

- a passing `claims/*.json` that satisfies `scripts/claim-check.js`; or
- a verification improvement such as `input_sha256` + `output_sha256`, `environment_fingerprint` + `outcome_callback`, or `closeCase` + `exit_code`; or
- removal/downgrade of an existing layer.

Run the reverse tests:

```bash
npm run test:change-gate
```

The selftest uses temporary git repositories and checks both PASS and BLOCK cases. The hook is an enforcement point only for this repository after `hooks:install` has been run.

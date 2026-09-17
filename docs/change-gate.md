# Change Gate

`npm run hooks:install` sets `core.hooksPath=.githooks` for this repository. The pre-commit hook runs:

```bash
node scripts/verifier-preflight.js
node scripts/mechanism-preflight.js
node scripts/change-gate.js --staged
npm test --silent
```

The gate does not judge code quality. It enforces one convergence rule: adding a new command, schema, learning summary, plan/spec, package script or strong README vocabulary requires the same staged diff to remove or replace an existing user-visible layer.

A passing claim or a verification improvement is still recorded, but it does not substitute for deletion or replacement.

Run the reverse tests:

```bash
npm run test:change-gate
```

The selftest uses temporary git repositories and checks both PASS and BLOCK cases. The hook is an enforcement point only for this repository after `hooks:install` has been run.

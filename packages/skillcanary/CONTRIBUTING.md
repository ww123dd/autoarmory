# Contributing

Thanks for helping.

## Development

```bash
npm test
npm run lint:example
```

No runtime dependencies. Use Node.js 18+.

## Pull requests

Every behavior change should include:

1. a failing case or a clear reproduction;
2. the expected state transition;
3. a regression risk note;
4. a test under `tests/`.

Prefer small, reviewable changes over broad rewrites.

## Scope

SkillCanary is a change gate, not an agent runner. New checks should be deterministic, explainable and cheap to run in CI.
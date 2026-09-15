# Benchmark

There are two layers.

## Deterministic fixtures

The synthetic suite proves that the CLI blocks bad records and does not block good ones.

```bash
npm run benchmark
npm run benchmark:json
```

Current total: 59 deterministic cases.

## Real regressions

The real suite contains only incidents with an executable reproduction. Each case runs the CLI and compares the exit code.

```bash
npm run benchmark:real
npm run benchmark:real:validate
```

Current total: 21 self-regression cases. This is deliberately not padded with invented partner incidents. Add new cases only when there is a stable source, observable failure and repeatable transition.

Add real incidents under [real/](real/README.md).

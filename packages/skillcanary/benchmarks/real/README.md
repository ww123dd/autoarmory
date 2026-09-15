# Real regression cases

These are executable regressions, not a static example. The default dataset is intentionally small: it contains only incidents that this repository has evidence for.

Run:

```bash
npm run benchmark:real
npm run benchmark:real:validate
```

Each case must include:

- `id`, `source`, `skill`, `change`, `expected`, `notes`;
- `before` and `after` observations;
- `run`: a CLI command and expected exit code.

The runner substitutes `{root}` and `{tmp}` placeholders, runs the command and compares the exit code. A case without an executable `run` is not proof and should not be counted.

## Rule

Do not anonymise away the evidence. Remove credentials and private business data, but keep the observable failure and state transition. Do not invent partner incidents or issue URLs.

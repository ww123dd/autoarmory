# Mechanism Activation

A mechanism candidate is not active merely because it names a verifier.

`mechanism-activation` audits the executable boundary:

- the verifier must be registered and intact in the active profile;
- the candidate must carry evidence refs and a non-empty scope;
- enforcement must use `mode=block`;
- coverage must be `complete`;
- the entry must exist and export `enforceMechanism`.

If any condition is missing, the candidate remains `candidate`. This prevents an
advisory mechanism from being presented as an enforced one.

## Enforcement contract

`src/lib/hook-gate.js` exports:

```js
enforceMechanism(event, mechanism, { repo, trials })
```

For complete blocking enforcement it re-derives `event.evidence_refs`; missing
or failing evidence returns `block`. Advisory or partial enforcement returns
`allow` with an explicit advisory reason. It does not close cases or create
verdicts.

## Lifecycle metrics

`scripts/mechanism-metrics.js --state <state-root> --mechanism <id> --json`
projects:

- `reuse_count` from mechanism runs;
- `success_count` from closures;
- `overturn_count` and `reopen_count` from outcome records;
- `lifecycle_state` from the latest lifecycle record.

## CLI integration

The executable entry point remains `scripts/hook-gate.js`. With
`--mechanism <id>` it loads the mechanism from `<state>/mechanisms.jsonl` and
applies the same `enforceMechanism` contract. Without that flag, existing hook
behavior is unchanged.

# Contributing

## Run it first

```bash
npm test                 # full suite (includes the operator loop, rollback and portable profile)
node scripts/profile-run.js   # the portable profile: PASS and FAIL, in a sandbox
npm run check:anchors         # re-fetch every vendored anchor through its declared channel
```

No dependencies are required for `npm test`; `check:anchors` needs network access. If `npm test` is not green on a clean checkout, that is a bug worth an issue.

## Adding a fact source

A new fact source is a thin bridge plus a descriptor — not a new subsystem.

1. `examples/adapters/<source>/bridge.js`: read a JSON payload on stdin, write `{ ok, observed }` on stdout, fail closed with `ok:false` and a reason. Budget: 60 non-empty lines; `tests/verifier-bridges.js` enforces it, and any exception carries its reason in the allowlist.
2. Land the descriptor mechanically:
   ```bash
   node scripts/verifier-pin.js --merge new-verifiers.json
   node scripts/verifier-pin.js --dry-run
   ```
3. If the fact should travel with the repository, add it to `examples/profiles/portable.profile.json`. Keep at least one entry that fails on purpose.
4. If the fact comes from a publisher outside this repository, vendor the bytes and write a `<file>.provenance.json` record; `npm run check:anchors` will re-fetch through that channel.

## Lifecycle rules

- A **promotion names the run it rested on** (`scripts/mechanism-lifecycle.js --promote`). A verdict that is not `verified`/`closed` cannot promote anything.
- A promotion does **not** outlive its evidence: when the run behind it goes stale, `--rollback-if-stale` writes a rollback record carrying the fact that forced it (`status`, `reason`, `latest_run_id`, `runner_sha256`, `case_sha256`).
- The commit hook blocks while a promoted mechanism outlives its evidence, and reports `stale_lifecycle_escape_count`.

## Rules that are load-bearing

- **Never hand-write `verifiers.lock.json`.** It is written by `scripts/verifier-pin.js`, which recomputes every digest and rewrites both halves (the lock and the external anchor).
- **A pinned artifact must be committed**; pinning an uncommitted file is allowed only as a declared local instrument and is reported everywhere afterwards.
- **A verdict names its runner**: `runner_id`, `runner_sha256` and the invocation contract version are part of the evidence; changing any of them invalidates old runs.
- **A case is bound by content, not by id.**
- **Self-reported success is not evidence.** `close`, `status` and the commit hook re-derive.
- **The one thing an agent must never author is an approval.** `scripts/approve.js` records the operator's decision and refuses without their own words.

## Pull requests

Small, evidenced, honest about limits. Add the positive and the negative control for any claim. Removing a layer is welcome — the change gate blocks new surface without a removal.

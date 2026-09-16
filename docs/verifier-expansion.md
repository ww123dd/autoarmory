# Verifier Expansion

The verifier core is intentionally thin. Each new source should add a small bridge, not another control plane.

Every profile entry declares a human-readable `version` and an `invocation_contract_version` next to its pinned digests. The digests and the contract version form `runner_sha256`; the human-readable `version` is compatibility metadata and is deliberately excluded from it, so bumping it never invalidates a verdict on its own.

Current local profile contains eight heterogeneous fact sources:

| verifier | fact source | bridge lines |
|---|---|---:|
| `doris-readonly-count` | database row count through a pinned readonly MCP bridge | 139 |
| `esc3-pid-file-live` | PID file parsing and process liveness | 16 |
| `file-sha256-license` | file existence and SHA-256 | 14 |
| `git-commit-exists` | git object existence | 10 |
| `local-http-health` | local HTTP service fingerprint | 28 |
| `windows-registry-value` | Windows registry value (OS configuration store) | 26 |
| `windows-service-state` | Windows Service Control Manager state | 23 |
| `tls-peer-certificate` | X.509 certificate fingerprint presented by a TLS peer | 50 |

Seven of the eight are thin bridges over the same `state-query` adapter. Only the MCP transport bridge is heavy, because it speaks the MCP stdio protocol on behalf of a registered server. That ratio is the engine test:

- if each source needs a small bridge, the core is reusable;
- if each source needs a new 100+ line adapter, the implementation is still a one-off instrument.

`tests/verifier-bridges.js` enforces it: every committed bridge must stay within 60 lines, must read its payload from stdin, must emit `{ ok, observed }`, and must fail closed (`ok:false` plus a reason) instead of crashing when the payload is empty or malformed.

## Adding a source

1. write `examples/adapters/<source>/bridge.js`: read the pinned server descriptor from stdin and emit `{ ok, observed }`;
2. write a descriptor file holding the verifier entry — `id`, `kind`, `version`, `invocation_contract_version`, `readonly`, `statement`, `assertion`, `bridge`, `server`. Draft digests may be blank or stale: the pin tool recomputes them and reports what it used;
3. land it mechanically and verify:

```bash
node scripts/verifier-pin.js --merge new-verifiers.json   # recompute digests, rewrite lock + external anchor
node scripts/verifier-pin.js --dry-run                    # assert the profile is fully pinned
node scripts/mechanism-record.js --mechanism <id> --close # re-record runs on the new runner
```

Never hand-write `verifiers.lock.json`. It is the trust root, and the Codex guard blocks Write/Edit and shell redirection into it — that block is not a request for a human to type the file. The mechanical path above is the sanctioned way to change it, and `tests/verifier-pin.js` covers it: bootstrap, declare-from-descriptor, drift fails closed, `--allow-drift` recovers a deliberately replaced profile, and a declaration missing `version` is refused rather than defaulted.

`verifier-pin` recomputes every digest the profile pins (`adapter`, `bridge`, MCP `config`, MCP `entry`) and rewrites both halves of the trust root in one step: the gitignored `verifiers.lock.json` inside the repository and the external anchor `~/.codex/hooks/verifier-lock.sha256` outside it. It fails closed when the two halves already disagree, so a re-pin can never paper over drift. `--dry-run` prints the digest the profile would produce; when it differs from the lock on disk, the profile is not fully pinned.

## Apparatus freeze

The apparatus was frozen across the first live replay (`docs/negative-controls.md`, control 13): no new field, schema or verifier was added while it ran, so the replay measures the existing chain rather than an explanation invented alongside it. Any change after this point cites that replay output as its input.

## Pinned files are byte-identical to their commits

Every pinned artifact (`scripts/verify/state-query.js` and each `examples/adapters/*/bridge.js`) must have the same bytes in the working tree as in its committed blob, so `.gitattributes` pins both surfaces to `eol=lf`. `tests/verifier-bridges.js` fails closed when they differ: a CRLF working copy produces a digest that a fresh clone cannot reproduce, and the failure would otherwise surface only after the checkout silently rewrote the file.

## Changing a pin invalidates recorded evidence

A recorded `mechanism_run` embeds the pinned bridge digest inside its `input_sha256`. Re-pinning a bridge therefore invalidates every run that used it, and `scripts/mechanism-preflight.js` blocks the commit until a run is recorded against the new pin:

```bash
node scripts/verifier-pin.js
node scripts/mechanism-record.js --mechanism <mechanism-id> --close
node scripts/mechanism-preflight.js
```

`tests/mechanism.js` covers that recovery path. `mech-esc-3-pid-file` is the worked example: normalising `examples/adapters/pid-file-live/bridge.js` to LF moved its digest, the recorded run stopped reproducing, and a fresh capture plus `--close` closed the case again on the new pin.

## Reporting

Run:

```bash
npm run test:verifier-scorecard
npm run test:negative-controls
```

The scorecard reports bridge line counts and fresh-capture status. The negative-control matrix reports tamper, unverifiable, false-success and wrong-admission behavior on one real chain.
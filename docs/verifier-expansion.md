# Verifier Expansion

The verifier core is intentionally thin. Each new source should add a small bridge, not another control plane.

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
2. declare the verifier descriptor (`id`, `statement`, `assertion`, `bridge`, `server`) and merge it into the local profile;
3. re-pin mechanically instead of editing the trust root by hand:

```bash
node scripts/verifier-pin.js --merge new-verifiers.json
node scripts/verifier-pin.js --dry-run
```

`verifier-pin` recomputes every digest the profile pins (`adapter`, `bridge`, MCP `config`, MCP `entry`) and rewrites both halves of the trust root in one step: the gitignored `verifiers.lock.json` inside the repository and the external anchor `~/.codex/hooks/verifier-lock.sha256` outside it. It fails closed when the two halves already disagree, so a re-pin can never paper over drift. `--dry-run` prints the digest the profile would produce; when it differs from the lock on disk, the profile is not fully pinned.

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
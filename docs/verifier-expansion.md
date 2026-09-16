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

## Portable profile

`examples/profiles/portable.profile.json` is a complete committed profile (no placeholders), and `scripts/profile-run.js` judges with it inside a sandbox, so the repository alone is enough:

```bash
node scripts/profile-run.js --profile examples/profiles/portable.profile.json
npm run test:portable-profile
```

Acceptance shape: the run must re-derive every fact and must show **at least one PASS and at least one FAIL**. The failing entries are deliberate negative controls — the file-sha256 bridge against an all-zero digest, and an all-zero commit that cannot exist; a profile that only passes is refused, because it would not show that the checker can reject. `tests/portable-profile.js` additionally flips a positive expectation and asserts the verdict flips with the bytes, and asserts that a portable run leaves both the machine-local trust root and the checkout untouched.

Portability gate: `profile-run` refuses a profile that names an absolute path or climbs out with `..`, then copies the profile and its artifacts into a temp repository. A portable profile cannot depend on this machine.

Five entries ship today: two content hashes (the file-sha256 bridge bytes, the verifier core adapter bytes), one repository-history fact, and the two negative controls.

The repository-history entry is the first shippable fact that is not about this machine: `git-commit-exists` with `repo: "."` resolves against the clone that runs the profile. `profile-run` links the clone object database into the sandbox with a `gitdir:` pointer and only ever runs `git cat-file`, so judging a commit never writes to the checkout. If the history around that commit is rewritten, the commit disappears and the entry fails — a third party can watch the same thing happen after a force-push.

Observed both ways: a full clone reports `PASS portable-repo-commit-exists`, while a clone that does not carry that commit (`git clone --depth 1 file:///...`) reports `FAIL portable-repo-commit-exists` with `exists:false` while the two content hashes still pass — `pass=2 fail=3`, shape valid. The run never writes to the checkout it judges.

Independence, stated honestly: five of the six portable entries are content-addressed **inside this repository** (bridge bytes, adapter bytes, a commit sha). They are deterministic, machine-independent, offline and checkout-stable, and they are a real drift and tamper detector — but the author still chooses those values, so those five are not independent of the author.

The sixth entry is anchored outside the repository: `examples/anchors/ms-2.1.3.tgz` is vendored byte for byte from the npm publication of `ms@2.1.3`, the published `sha512` integrity is recorded in `examples/anchors/README.md`, and `tests/portable-profile.js` re-checks that published value against the vendored bytes on every run. We choose to vendor the artifact; we do not choose its bytes or its published digest. The honest limit: the mirror is a copy of the canonical registry, so the agreement observed between `registry.npmmirror.com` and `registry.npmjs.org` is a consistency check rather than a second independent publisher — an independent anchor would need a different publisher or a third-party read-only service. An entry graduates to that class only when its expectation is anchored outside the repository: an upstream published artifact hash, a vendored file upstream provenance hash, or the content hash of a third-party read-only service body. Those anchors need a network or a vendored artifact with a published hash; the remaining machine-local verifiers do not qualify, because they pin this machine absolute paths or a live process.

File targets are restricted to the surfaces pinned to `eol=lf` in `.gitattributes`, because a working-tree hash is not checkout-stable otherwise. The repository-history entry does not depend on the working tree at all: it reads git objects.

## Shipped facts vs local instruments

A pinned artifact that is not committed is a **local instrument**: the pin works on this machine, but it is not reproducible from a clone. `scripts/verifier-pin.js` refuses to pin one unless it is declared with `--allow-untracked`, and every consumer reports it instead of hiding it:

- `verifier-pin` prints `local-only: <path> (not committed)` on the row plus a `local instruments (pins not reproducible from a clone): <ids>` summary, in `--dry-run` and when writing;
- `scripts/verifier-preflight.js` appends `local-only pins (not reproducible from a clone): <id> -> <path>` to its pass line;
- `verifier-scorecard` carries `tracked: false` on the row.

Today exactly one entry is in that class: `meta-skill-load-count` pins `examples/adapters/local-transcript/bridge.js`, which is a working-tree file. Committing that bridge, or dropping the entry, is what removes the note. The portable profile never contains a local instrument, so nothing in `examples/profiles/portable.profile.json` depends on an uncommitted file.

## One writer per trust root

`verifiers.lock.json` and the external anchor are a single-writer resource. A re-pin changes the runner identity, so every recorded mechanism run that used that runner goes stale - that is the freshness rule working, not a bug, but two sessions sharing one checkout will invalidate each other silently. `verifier-pin` prints `N worktrees share this repository; re-pinning invalidates recorded runs in the others` when it sees more than one worktree.

The rule: one writer at a time per profile, and prefer one checkout per session. Each checkout keeps its own repo-relative `verifiers.lock.json`, but the external anchor is one file per machine, so a second session needs its own pair (`verifier-pin --lock <path> --anchor <path>`, and `AUTOARMOR_LOCK_PATH` / `AUTOARMOR_LOCK_ANCHOR` for the readers) or an explicit agreement about who re-pins when.

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
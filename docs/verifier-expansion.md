# Verifier Expansion

The verifier core is intentionally thin. Each new source should add a small bridge, not another control plane.

Current local profile contains five heterogeneous fact sources:

| verifier | fact source | bridge lines |
|---|---|---:|
| `doris-readonly-count` | database row count through a pinned readonly MCP bridge | 139 |
| `esc3-pid-file-live` | PID file parsing and process liveness | 16 |
| `file-sha256-license` | file existence and SHA-256 | 14 |
| `git-commit-exists` | git object existence | 10 |
| `local-http-health` | local HTTP service fingerprint | 24 |

The last four are thin bridges over the same `state-query` adapter. This is the engine test:

- if each source needs a small bridge, the core is reusable;
- if each source needs a new 100+ line adapter, the implementation is still a one-off instrument.

Run:

```bash
npm run test:verifier-scorecard
npm run test:negative-controls
```

The scorecard reports bridge line counts and fresh-capture status. The negative-control matrix reports tamper, unverifiable, false-success and wrong-admission behavior on one real chain.
# Hook layer

`skillcanary hook <event>` is host-agnostic. It reads JSON from stdin and writes JSON to stdout.

Events:

- `doctor`: validate local hook rules before host integration.
- `session-start`: load active `warning` / `blocking` armor pieces.
- `pre-tool`: apply `.skillcanary/hook-rules.json`.
- `stop`: remind when `change.json` exists without `skillcanary-report.md`.
- `session-end`: append an outcome record to `.skillcanary/outcomes.jsonl`.

Example:

```bash
skillcanary hook doctor
echo '{"tool_name":"shell","command":"..."}' | skillcanary hook pre-tool
```

Rules are configured in `.skillcanary/hook-rules.json`:

```json
{
  "preTool": [
    {
      "id": "example-rule",
      "pattern": "replace-with-regex",
      "reason": "why this is blocked"
    }
  ]
}
```

The doctor fails on missing ids/reasons, duplicate ids and invalid regular expressions. A malformed guard must not silently become an allow.

SkillCanary intentionally does not write host configuration files. Wire the command into Codex, Claude Code or another host according to that host's hook configuration. Keep environment-specific rules in your local `.skillcanary/hook-rules.json`; do not put credentials or internal tool names in the public repository.

# Codex hook wiring

SkillCanary exposes a host-neutral command. Codex configuration is owned by the user or organization.

```bash
skillcanary hook doctor
skillcanary hook session-start
skillcanary hook pre-tool
skillcanary hook stop
skillcanary hook session-end
```

Wire those commands according to the hook schema of your Codex runtime. Keep `.skillcanary/hook-rules.json` local. Do not commit host credentials or internal tool names.

## Trust boundary

The hook command is a deterministic guard and reminder layer, not a sandbox. A host can still be compromised or misconfigured. Use host permissions, credential isolation and sandboxing as the primary boundary.

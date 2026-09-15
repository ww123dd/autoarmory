# Claude Code hook wiring

SkillCanary exposes a host-neutral command. Claude Code configuration is owned by the user or organization.

```bash
skillcanary hook doctor
skillcanary hook session-start
skillcanary hook pre-tool
skillcanary hook stop
skillcanary hook session-end
```

Wire those commands according to your Claude Code hook configuration. Keep `.skillcanary/hook-rules.json` local.

## Trust boundary

The hook command is a deterministic guard and reminder layer, not a sandbox. It does not replace permissions, credential isolation or human approval for high-risk actions.

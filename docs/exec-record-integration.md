# Exec Record Integration

`scripts/validation-exec.js` is the unified entry for test, build, HTTP, SQL and `verify_all` commands:

```bash
node scripts/validation-exec.js --state .selfforge --link-decision <id> -- <command> [args...]
```

When the command matches a validation pattern, it is routed through `scripts/exec-record.js`, which records structured `exit_code`, duration, stdout hash and stderr hash. Non-validation commands run directly.

The Change Inspector still reports `exec_record_gap` when a transcript contains a check command that did not go through this entry. It does not infer a structured result from text. Runtime hook wiring is what makes this automatic for all tool calls; the wrapper is the single execution-layer target for that hook.
# Error budget

A rule such as "stop after three flat changes" is not a metric until the runtime can count the inputs. SkillCanary derives three session signals from local outcome records:

- `user_correction_count`: the user had to correct the result;
- `rework_turns`: the user had to ask for a redo or another pass;
- `tool_error_count`: tool/error events occurred.

The default budget is deliberately small and should be tuned per repository:

```json
{
  "window": 20,
  "max": {
    "user_correction_count": 2,
    "rework_turns": 3,
    "tool_error_count": 5
  }
}
```

## Record from a host

`hook session-end` and `track` append normalized outcome records:

```bash
skillcanary hook session-end <<'JSON'
{"session_id":"s1","skill":"my-skill","skill_hash":"abc","signals":{"user_correction_count":1,"rework_turns":0,"tool_error_count":0,"completed":true}}
JSON

skillcanary track --session s1 --skill my-skill --hash abc --corrections 1 --rework 0 --tool-errors 0 --completed true
```

## Ingest raw local history

The adapter is intentionally generic. It does not assume one chat product's schema:

```json
{
  "sessions": [
    {
      "id": "s2",
      "skill": "my-skill",
      "skill_hash": "abc",
      "messages": [
        { "role": "user", "content": "这个不对，重新做" },
        { "role": "tool_error", "content": "failed" }
      ]
    }
  ]
}
```

```bash
skillcanary budget ingest sessions.json --output .skillcanary/outcomes.jsonl
skillcanary budget stats --input .skillcanary/outcomes.jsonl
skillcanary budget check --input .skillcanary/outcomes.jsonl --config .skillcanary/budget.json
```

`budget check` exits 1 with `STOP_AND_COLLECT_INCIDENTS` when any group exceeds its window budget. This is a signal to collect new incidents, not a reason to add more rules.

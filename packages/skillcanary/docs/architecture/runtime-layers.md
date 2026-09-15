# Runtime layers

The control plane has four runtime layers. They must not be mixed.

| Layer | Trigger | Responsibility | Artifact |
|---|---|---|---|
| Skill | Model-selected by input shape | Judge, explain, propose | candidate |
| Hook | Every tool/session event | Deterministic guard, audit, reminder | hook JSON |
| CI | PR / merge / release | Deterministic gate | report / comment |
| Automation | Schedule / heartbeat | Scan history, measure outcomes, recommend | advice / outcomes / policy |

```text
Automation
  scan -> advice.jsonl
  budget check -> stop or collect new incidents
        |
        v
Skill
  read article / advice / conclusion -> candidate
        |
        v
Hook
  doctor / pre-tool / stop / session-start / session-end
        |
        v
CI
  lint / gate / anchor / mcp-onboard / report / comment
        |
        v
Evidence store
  normalize -> index -> query / export-sql
        |
        v
Policy
  decision -> outcome -> reward -> recommendation
```

## Non-negotiable rule

If something must happen every time, it does not belong in a skill. Put it in a hook or CI.

## Skill layer

The skill is probabilistic. It is selected by name and description. Keep the description short and shape-based.

## Hook layer

The hook is deterministic. `skillcanary hook` reads JSON from stdin and writes JSON to stdout. Run `hook doctor` before wiring it into a host.

## CI layer

CI is the merge/release gate. It should run `skillcanary lint`, `gate`, `anchor --check`, `mcp-onboard`, `report` and `comment`.

## Automation layer

Automation is periodic. It runs `scan`, `advice`, `promote`, `armor`, `track`, evidence indexing and error-budget checks. It produces candidates and stop signals, not new rules by default.

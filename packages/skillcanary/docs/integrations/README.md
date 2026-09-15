# Integrations

SkillCanary is the change gate. It does not run agents or LLMs.

Use an existing eval runner to produce evidence, then feed that evidence into the gate:

```text
skillgrade / agent-skills-eval / promptfoo
                |
                v
        skillcanary import auto
                |
                v
        change.json evidence
                |
                v
          skillcanary gate
                |
                v
          PR comment / report
```

The importer has executable adapters for summary objects, trial arrays and common aliases such as `passed/total`, `successes/failures`, `without_skill/with_skill` and `baseline/candidate`.

```bash
skillcanary import auto result.json --case c01 --skill my-skill --output .skillcanary/change.json
```

If auto-detection is ambiguous, pass the runner name explicitly. Never hand-edit evidence counts before running the gate.

Set `GITHUB_API_URL` to override the GitHub API base for GitHub Enterprise or a local mock server.

Guides:

- [skillgrade](skillgrade.md)
- [agent-skills-eval](agent-skills-eval.md)
- [promptfoo](promptfoo.md)

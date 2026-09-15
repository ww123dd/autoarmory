# promptfoo integration

`promptfoo` is the general CI/eval layer. SkillCanary is the skill-specific gate around it.

## CLI

```bash
skillcanary import promptfoo output.json --skill my-skill --output .skillcanary/change.json
```

## Supported shapes

```json
{
  "results": {
    "stats": { "successes": 3, "failures": 0 }
  }
}
```

A `results.results[]` or `tests[]` array with `success: true/false` is also accepted. SkillCanary does not duplicate provider, prompt or red-team configuration from promptfoo.

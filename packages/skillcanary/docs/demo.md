# 30-second demo

## Terminal

```bash
npx skillcanary init . --with-action
npx skillcanary import auto result.json --case c01 --output .skillcanary/change.json
npx skillcanary gate .skillcanary/change.json .skillcanary/cases.json --require-provenance
npx skillcanary store index --input .skillcanary/evidence.jsonl --dir .skillcanary/store
npx skillcanary budget check --input .skillcanary/outcomes.jsonl
npx skillcanary hook doctor
npx skillcanary anchor ./skills/my-skill --check
npx skillcanary report ./skills/my-skill
```

## What to show

1. A failing gate with a missing case.
2. A runner artifact imported with `auto`, then blocked by a flat deterministic transition.
3. An anchor drift after one reference file changes.
4. Evidence indexed into `eval_run` / `eval_case_score`.
5. Error budget crossing the stop threshold.
6. The same report appearing in a PR comment.

## Demo asset

`assets/demo.svg` is a static terminal mock that can be embedded in the README.

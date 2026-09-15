# Launch checklist

## Automated

```bash
npm test
npm run adapter:doctor
npm run policy:simulate
npm run trajectory:example
npm run reliability:example
npm run grader:example
npm run golden:example
npm run doctor:example
npm run benchmark
npm run benchmark:real
npm run benchmark:real:validate
npm pack --dry-run
npm run release:preflight
```

## Manual blockers

- Replace the repository placeholder in `package.json` with the real GitHub URL.
- Configure `git user.name` and `git user.email`.
- Run `npm login` and confirm `npm whoami`.
- Install/authenticate `gh` if live PR comment verification is required.
- Verify the live PR comment path on a disposable GitHub repository.
- Confirm the npm package name again before publishing.
- Tag the release only after the commit exists and CI is green.

## Privacy

- No user transcripts, private paths, internal accounts or internal MCP names in the public repository.
- `_local_archive/` and raw session folders stay out of the release.
- Evidence files in examples contain fixtures only.

# Threat model

SkillCanary without provenance is a policy gate, not a trust boundary.

An agent can write a shape-valid `change.json` that says:

```json
{ "before": { "pass": 0, "total": 3 }, "after": { "pass": 3, "total": 3 } }
```

That is why CI mode requires provenance:

```bash
skillcanary gate change.json cases.json --require-provenance
```

Required:

- `author` and `reviewer` are both present;
- `author !== reviewer`;
- `verifier_independent === true`;
- `skill_hash_before` and `skill_hash_after` are present;
- every `evidence_refs[].uri` exists locally;
- every `evidence_refs[].sha256` matches the file bytes.

This turns `change.json` from a self-report into an index over independently verifiable artifacts.

It does not replace:

- sandbox / permissions;
- signed artifacts (Sigstore/SLSA);
- human review for high-risk changes.
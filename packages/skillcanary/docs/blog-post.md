# Why Agent Skills Rot

Every team using coding agents eventually hits the same failure:

> The skill changed, the agent behaved differently, and nobody can prove whether the change was an improvement.

That is skill rot.

It appears in five forms:

1. A rule is written into a file that never gets loaded.
2. A change has no failing case.
3. A judge passes because the transcript leaked the answer.
4. An MCP is connected without permissions, fallback or offload.
5. Nobody can identify the skill version behind an eval result.

Eval runners answer whether a skill works. Security scanners answer whether it is safe.

Neither answers the merge question:

> Is this change allowed to land?

SkillCanary is the change gate:

- case first;
- reason and decision required;
- bidirectional prediction;
- repeat budget;
- before/after evidence;
- MCP `veto_map`;
- per-file anchor;
- PR report.

It is not another eval runner. It is the CI layer that makes eval results reviewable and enforceable.
# Why SkillCanary

Agent Skills are software, but they are usually changed like prompts.

That creates seven failures:

1. A change has no linked case.
2. A judge passes because the answer leaked into the transcript.
3. A rule lives in a file that never gets loaded.
4. An MCP is "connected" but has no boundary, fallback or offload.
5. Nobody can tell which skill version produced an eval result.
6. Runner output is hand-copied instead of stored.
7. The team keeps adding rules after the error budget says to stop.

Eval runners answer: "did the skill work?"

Security scanners answer: "is the skill safe?"

SkillCanary answers: "may this change land, and what should we try next?"

The category is the control plane for reliable agent changes.

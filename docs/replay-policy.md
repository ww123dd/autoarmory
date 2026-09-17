# Replay Policy

Replay answers one question: **if the policy had been stricter, which already-recorded facts would it have rejected?** It uses recorded history only. It does not re-run the world, does not promote a policy, and never replaces a missing stream with synthetic records.

## Metrics

- `replay_escape_count`: a record the incumbent policy rejected, but the candidate policy would accept. This is the unsafe escape count. It must be zero before a candidate can be promoted.
- `tightening_rejection_count`: a record the incumbent accepted, but the candidate would reject. This is the measured cost of tightening. It is a review number, not an error by itself.
- `replay_mismatch_count`: every incumbent/candidate disagreement; it equals tightening rejections plus unsafe escapes.
- `context_budget_escape_count`: the number of normative SkillCanary lint limits the measured skill exceeds (`SKILL.md` bytes, lines, and description characters). It must be zero.
- `insufficient_real_stream`: there are no eligible recorded facts for the requested policy. Metrics are `null`; no synthetic substitute is allowed.

## Policies

- `mechanism-streak`: a recorded mechanism run passes only after at least `N` consecutive real passes for the same mechanism and case.
- `count-half`: a deterministic evidence record passes only when `count_after < count_before / ratio`. It requires records that actually carry `count_before` and `count_after`.

## 2026-09-17 Real Replay

The local `.selfforge/mechanism-runs.jsonl` had 13 real runs. The `mechanism-streak` candidate with `min_passes=3` found 3 tightening rejections and 0 unsafe escapes. The `count-half` candidate correctly reported `insufficient_real_stream` because those runs do not contain count boundaries. The sanitized evidence is in `docs/evidence/replay-20260917.json`.
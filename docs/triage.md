# Triage

Triage separates four work classes without hiding unresolved cases:

- `must_fix_now`: an external red light, safety boundary, data error or a live-fact conflict backed by evidence. It blocks the current action.
- `backlog`: a missing consumer, stop condition or outsourcing target. It is real work, but it does not block the current verified fact.
- `only_if_decision_impact`: naming, documentation, version, format or extra evidence with no recorded decision impact. Do it only when it changes a real decision.
- `do_not_do`: theoretical completeness with no real consumer or external fact.
- `needs_evidence`: no deterministic rule can classify the finding safely. This is fail-closed and blocks until evidence or a rule is supplied.

The classifier does not use an LLM judge. `scripts/triage.js --enforce` blocks only on `must_fix_now` and `needs_evidence`; backlog and do-not-do remain visible without becoming fake urgency.
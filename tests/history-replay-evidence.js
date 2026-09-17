'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'history-replay-20260917.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/history-replay-evidence/v1', 'history replay evidence schema');
must(/^[a-f0-9]{64}$/.test(report.source_sha256), 'history replay evidence must carry the source hash');
must(report.stream_counts.mechanism_runs === 13 && report.stream_counts.routing_decisions === 1 && report.excluded.transitions_without_real_outcome === 1, 'history replay stream counts must match the real input');
must(report.policy_reports.mechanism_streak.replay_escape_count === 0 && report.policy_reports.mechanism_streak.tightening_rejection_count === 3, 'mechanism-streak evidence must expose the real tightening cost without escapes');
must(report.policy_reports.routing_evidence_required.replay_escape_count === 0 && report.policy_reports.routing_evidence_required.tightening_rejection_count === 1, 'routing evidence policy must expose one tightening cost');
must(report.policy_reports.count_half.insufficient_real_stream === true, 'count-half must remain insufficient without count records');
must(report.metrics.replay_escape_count === 0 && report.metrics.boundary_hit_rate === 1 && report.metrics.unwanted_agent_wakeups === 4, 'aggregate metrics must be derived from the real replay');
must(report.metrics.cost_per_outcome === null && report.metrics.token_cost_per_closed_case === null && report.cost_status === 'insufficient_cost_stream', 'missing cost history must stay explicit instead of being invented');
must(report.context_budget.context_budget_escape_count === 0, 'context budget must be a zero-escape audit component');
must(report.synthetic_record_count === 0 && report.llm_judge_calls === 0 && report.private_records_shipped === false && report.promotion === false, 'history replay must not synthesize, judge, ship private records, or promote');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw), 'history replay evidence must not contain machine paths');
must(!/"details"\s*:|"source_record"\s*:|"final_text_excerpt"\s*:/.test(raw), 'history replay evidence must not ship per-record content');
console.log('history replay evidence passed: 13 mechanism runs + 1 routing decision, escapes=0, tightening=4, boundary hit=1, cost stream insufficient');
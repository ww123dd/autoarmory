'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'cost-aware-history-replay-20260917.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/cost-aware-history-replay-evidence/v1', 'cost-aware evidence schema');
must(/^[a-f0-9]{64}$/.test(report.source_sha256), 'cost-aware evidence source hash');
must(report.stream_counts.usage_records === 10 && report.stream_counts.mechanism_runs === 13 && report.stream_counts.routing_decisions === 1, 'cost-aware evidence stream counts');
must(report.policy_reports.skill_required.candidate_pass_count === 4 && report.policy_reports.skill_required.tightening_rejection_count === 6 && report.policy_reports.skill_required.replay_escape_count === 0, 'skill-required policy evidence');
must(report.metrics.replay_escape_count === 0 && report.metrics.tightening_rejection_count === 10 && report.metrics.boundary_hit_rate === 1, 'aggregate cost-aware replay metrics');
must(report.metrics.cost_per_outcome === 0.46244125 && report.metrics.token_cost_per_closed_case === 66448.75 && report.cost_status === 'observed', 'real cost/token metrics must be present');
must(report.context_budget.context_budget_escape_count === 0, 'context budget audit must remain zero-escape');
must(report.synthetic_record_count === 0 && report.llm_judge_calls === 0 && report.private_records_shipped === false && report.promotion === false, 'cost-aware evidence must not synthesize, judge, ship private records, or promote');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw), 'cost-aware evidence must not contain machine paths');
must(!/"details"\s*:|"source_record"\s*:|"final_text_excerpt"\s*:/.test(raw), 'cost-aware evidence must not ship per-record content');
console.log('cost-aware history replay evidence passed: 10 usage records, cost_per_outcome=0.4624, token_cost_per_closed_case=66448.75, escapes=0');
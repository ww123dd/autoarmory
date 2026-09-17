'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const history = require('../src/lib/history-replay');
function must(condition, message) { if (!condition) throw new Error(message); }

const runs = [
  { id: 'r1', mechanism_id: 'm1', case_id: 'c1', result: 'fail', counterexample: { kind: 'same-signature' }, finished_at: '2026-01-01T00:00:00.000Z' },
  { id: 'r2', mechanism_id: 'm1', case_id: 'c1', result: 'pass', counterexample: { kind: 'same-signature' }, finished_at: '2026-01-01T00:01:00.000Z' },
  { id: 'r3', mechanism_id: 'm1', case_id: 'c1', result: 'pass', counterexample: { kind: 'same-signature' }, finished_at: '2026-01-01T00:02:00.000Z' },
  { id: 'r4', mechanism_id: 'm1', case_id: 'c1', result: 'pass', counterexample: { kind: 'same-signature' }, finished_at: '2026-01-01T00:03:00.000Z' },
  { id: 'r5', mechanism_id: 'm1', case_id: 'c1', result: 'pass', counterexample: { kind: 'same-signature' }, finished_at: '2026-01-01T00:04:00.000Z' }
];
const decisions = [{ request_id: 'route-1', selected: [{ id: 'cap-1' }], rejected: [{ id: 'cap-2', reason: 'conflict' }], evidence_refs: [] }];
const outcomes = [{ decision_id: 'route-1', result: 'success', cost: 2, tokens: 20, observed_at: '2026-01-01T00:05:00.000Z' }];
const built = history.buildReplayRecords({ mechanism_runs: runs, routing_decisions: decisions, outcomes: outcomes, routing_actuals: [], transitions: [] }, { failure_signatures: { 'same-signature': 1 }, previous_results: [] });
must(built.records.length === 6, 'every eligible real record must produce a replay record');
must(built.records.every(function (item) { return item.source_decision_id && item.real_outcome && item.real_outcome.status; }), 'every replay record must point to a source id and a real outcome');
const report = history.replayHistory({ mechanism_runs: runs, routing_decisions: decisions, outcomes: outcomes, routing_actuals: [], transitions: [] }, { min_passes: 3, top_k: 10, context_budget: { context_budget_escape_count: 0 } });
must(report.metrics && report.metrics.replay_escape_count === 0 && report.metrics.tightening_rejection_count === 3, 'real replay must report tightening rejections without escapes');
must(report.metrics.boundary_hit_rate === 1 && report.metrics.unwanted_agent_wakeups === 3, 'boundary-aware metrics must follow the selected boundary mismatches');
must(report.metrics.outcome_gain === -3 && report.metrics.cost_per_outcome !== null && report.metrics.token_cost_per_closed_case !== null, 'cost metrics must use recorded costs when present');
must(report.synthetic_record_count === 0 && report.llm_judge_calls === 0 && report.promotion === false, 'replay must not synthesize, judge, or promote');
const empty = history.replayHistory({ mechanism_runs: [], routing_decisions: [], outcomes: [], routing_actuals: [], transitions: [] }, {});
must(empty.insufficient_real_stream === true && empty.metrics === null && empty.strategy_verdict === 'insufficient_real_stream', 'an empty history must produce no strategy metrics');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-history-'));
const skill = path.join(temp, 'skill');
fs.mkdirSync(skill, { recursive: true });
fs.writeFileSync(path.join(skill, 'SKILL.md'), ['---', 'name: fixture', 'description: Use for fixture work; do not use for unrelated work.', '---', '', '# Fixture', ''].join('\n'), 'utf8');
const state = path.join(temp, 'state');
fs.mkdirSync(state, { recursive: true });
fs.writeFileSync(path.join(state, 'mechanism-runs.jsonl'), runs.map(function (item) { return JSON.stringify(item); }).join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(state, 'routing-decisions.jsonl'), decisions.map(function (item) { return JSON.stringify(item); }).join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(state, 'outcomes.jsonl'), outcomes.map(function (item) { return JSON.stringify(item); }).join('\n') + '\n', 'utf8');
const script = path.resolve(__dirname, '..', 'scripts', 'history-replay.js');
const result = spawnSync(process.execPath, [script, '--state', state, '--skill', skill, '--json', '--enforce'], { encoding: 'utf8' });
const cliReport = JSON.parse(result.stdout);
must(result.status === 0 && cliReport.synthetic_record_count === 0 && cliReport.context_budget.context_budget_escape_count === 0, 'history replay CLI must enforce the hard gates: ' + result.stdout + result.stderr);
console.log('history replay tests passed: real outcome binding, boundary selection, cost status, insufficient stream, context budget, no promotion');
'use strict';

// Acceptance test for shadow evaluation (0.6): the comparator only speaks when both
// streams carry real records, and the numbers it prints follow those records.
//
//   1. a route call leaves a durable recommendation
//   2. with no recorded actual usage the report is insufficient_real_stream and prints no metrics
//   3. an actual usage without an attributed source is refused
//   4. recorded actuals produce follow_rate, divergence and outcome splits
//   5. an actual that links to no decision is surfaced, not dropped

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'autoarmory.js');
const SHADOW = path.join(ROOT, 'scripts', 'shadow-report.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-shadow-'));
const state = path.join(work, '.selfforge');
fs.mkdirSync(state, { recursive: true });

function must(condition, message) { if (!condition) throw new Error(message); }
function run(script, args) {
  const result = spawnSync(process.execPath, [script].concat(args), { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function capability(id, alpha, beta) {
  return { schema_version: 'autoarmory/capability/v1', id: id, vendor: 'fixture', kind: 'runner', version: '1.0.0', capabilities: ['run-agent-eval'], permissions: { read: true, write: false, network: false }, cost: { unit: 'usd', estimate: 0.01 }, latency_ms: { p50: 100, p95: 200 }, reliability: { alpha: alpha, beta: beta }, risk: 'low', trust_level: 'trusted', conformance_level: 'ci-gated', health: 'healthy', freshness: new Date().toISOString(), evidence_refs: [] };
}
const capsFile = path.join(work, 'capabilities.jsonl');
fs.writeFileSync(capsFile, [capability('runner.strong', 20, 1), capability('runner.weak', 2, 8)].map(function (item) { return JSON.stringify(item); }).join('\n') + '\n', 'utf8');
const requestFile = path.join(work, 'request.json');
fs.writeFileSync(requestFile, JSON.stringify({ schema_version: 'autoarmory/routing-request/v1', task_type: 'run-agent-eval', risk: 'low', data_sensitivity: 'internal', cost_budget: 1, latency_slo_ms: 1000, write_required: false, security_level: 'standard', human_approval: false, context: {}, task_id: 'task-shadow-1' }, null, 2) + '\n', 'utf8');

let result = run(CLI, ['capability', 'register', capsFile, '--state', state, '--json']);
must(result.code === 0, 'capabilities must register: ' + result.out + result.err);
result = run(CLI, ['capability', 'route', requestFile, '--state', state, '--json']);
must(result.code === 0, 'route must succeed: ' + result.out + result.err);
const decision = JSON.parse(result.out);
must(decision.request_id && decision.selected && decision.selected[0], 'a route call must name a request and a selection');
must(fs.existsSync(path.join(state, 'routing-decisions.jsonl')), 'a decision must be durable before it can be evaluated');

// 2. no actual stream -> no metrics
result = run(SHADOW, ['--state', state, '--json']);
must(result.code === 1, 'a report without an actual stream must not claim success');
const empty = JSON.parse(result.out);
must(empty.shadow_status === 'insufficient_real_stream' && empty.metrics === null, 'an empty stream must produce no metrics: ' + result.out);

// 3. an unattributed observation is refused
result = run(SHADOW, ['--record', '--decision', decision.request_id, '--used', decision.selected[0].id, '--outcome', 'success', '--state', state, '--json']);
must(result.code === 1 && /unattributed/.test(result.out + result.err), 'recording without a source must be refused');

// 4. real records produce real numbers
const used = decision.selected[0].id;
const other = used === 'runner.strong' ? 'runner.weak' : 'runner.strong';
result = run(SHADOW, ['--record', '--decision', decision.request_id, '--used', used, '--outcome', 'success', '--source', 'operator', '--state', state, '--json']);
must(result.code === 0, 'recording an attributed actual must succeed: ' + result.out + result.err);
result = run(SHADOW, ['--record', '--decision', 'route-does-not-exist', '--used', other, '--outcome', 'failure', '--source', 'agent', '--state', state, '--json']);
must(result.code === 0, 'recording a second actual must succeed: ' + result.out + result.err);
result = run(SHADOW, ['--record', '--decision', decision.request_id, '--used', other, '--outcome', 'failure', '--source', 'agent', '--state', state, '--json']);
must(result.code === 0, 'recording a diverging actual must succeed: ' + result.out + result.err);

result = run(SHADOW, ['--state', state, '--json']);
must(result.code === 0, 'a report with a real stream must succeed: ' + result.out + result.err);
const report = JSON.parse(result.out);
must(report.shadow_status === 'ok', 'shadow status must be ok: ' + result.out);
must(report.metrics.follow_rate === 0.5 && report.metrics.followed === 1 && report.metrics.diverged === 1, 'follow_rate must follow the records: ' + JSON.stringify(report.metrics));
must(report.metrics.followed_outcomes.success === 1 && report.metrics.diverged_outcomes.failure === 1, 'outcome splits must follow the records: ' + JSON.stringify(report.metrics));
must(report.divergences.length === 1 && report.divergences[0].used === other, 'the divergence must name what was used instead');
must(report.unlinked_actuals === 1 && report.unlinked[0].decision_id === 'route-does-not-exist', 'an actual linking to no decision must be surfaced');

console.log('shadow tests passed: durable recommendation, empty-stream=no-metrics, unattributed=refused, follow_rate=0.5 with outcome splits, unlinked=surfaced');
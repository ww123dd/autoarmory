'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-capability-'));
const state = path.join(temp, '.selfforge');
fs.mkdirSync(state, { recursive: true });

function run(args, input) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8', input: input });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function must(condition, message) {
  if (!condition) { console.error('FAIL: ' + message); process.exit(1); }
}
function writeJson(name, value) {
  const file = path.join(temp, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

const capabilityLib = require('../src/lib/capability');
const calibrationLib = require('../src/lib/calibration');
const executionTraceLib = require('../src/lib/execution-trace');
const routingDecisionSchema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'routing-decision.schema.json'), 'utf8'));
for (const field of ['task_id', 'candidate_set', 'top_k', 'selection_margin', 'selection_confidence', 'confidence_method']) {
  must(!!routingDecisionSchema.properties[field], 'routing decision schema properties must declare ' + field);
}

function route(file, seed) { const caps = capabilityLib.readCapabilities(path.join(state, 'capabilities.jsonl')); const request = JSON.parse(fs.readFileSync(file, 'utf8')); const result = capabilityLib.route(caps, request, seed === undefined ? {} : { seed: seed }); return { code: result.ok ? 0 : 1, out: JSON.stringify(result), err: result.ok ? '' : result.errors.join('\n') }; }
function portfolio() { return { code: 0, out: JSON.stringify(capabilityLib.portfolio(capabilityLib.readCapabilities(path.join(state, 'capabilities.jsonl')))), err: '' }; }
function retire(id, reason) { const result = capabilityLib.retireCapability(path.join(state, 'capabilities.jsonl'), path.join(state, 'replacement-suggestions.jsonl'), id, reason); return { code: result.ok ? 0 : 1, out: JSON.stringify(result.ok ? result.suggestion : result), err: result.ok ? '' : result.errors.join('\n') }; }
function calibrate(file, min) { const outcomes = JSON.parse(fs.readFileSync(file, 'utf8')); const result = calibrationLib.calibrate(outcomes, { min: min }); return { code: result.status === 'calibrated' ? 0 : 1, out: JSON.stringify(result), err: '' }; }
function offPolicyEval(file, min) { const outcomes = JSON.parse(fs.readFileSync(file, 'utf8')); const result = calibrationLib.offPolicyEvaluate(outcomes, { min: min }); return { code: result.status === 'evaluated' ? 0 : 1, out: JSON.stringify(result), err: '' }; }
function capability(overrides) {
  return Object.assign({
    schema_version: 'autoarmory/capability/v1',
    id: 'runner.skillgrade',
    vendor: 'skillgrade',
    kind: 'runner',
    version: '1.0.0',
    capabilities: ['run-agent-eval'],
    permissions: { read: true, write: false, network: false },
    cost: { unit: 'usd', estimate: 0.02 },
    latency_ms: { p50: 1000, p95: 3000 },
    reliability: { alpha: 7, beta: 3 },
    risk: 'medium',
    trust_level: 'verified',
    conformance_level: 'verified',
    health: 'healthy',
    freshness: '2026-09-15T00:00:00.000Z',
    evidence_refs: []
  }, overrides || {});
}

const validFile = writeJson('capability.json', capability());
let result = run(['capability', 'register', validFile, '--state', state, '--json']);
must(result.code === 0 && result.out.includes('runner.skillgrade'), 'capability register');

result = run(['capability', 'list', '--state', state, '--json']);
must(result.code === 0 && result.out.includes('runner.skillgrade'), 'capability list');

result = run(['capability', 'health', '--state', state, '--json']);
must(result.code === 0 && result.out.includes('"healthy"'), 'capability health');

const invalidFile = writeJson('invalid-capability.json', capability({ id: '' }));
result = run(['capability', 'register', invalidFile, '--state', state, '--json']);
must(result.code === 1 && /missing id|id/i.test(result.out + result.err), 'invalid capability rejection');

const duplicate = run(['capability', 'register', validFile, '--state', state, '--json']);
must(duplicate.code === 1 && /already exists|--force/i.test(duplicate.out + duplicate.err), 'duplicate capability rejection');

function register(name, overrides) {
  const file = writeJson(name + '.json', capability(overrides));
  const result = run(['capability', 'register', file, '--state', state, '--force', '--json']);
  must(result.code === 0, 'register ' + name);
  return file;
}
register('runner-fast', { id: 'runner.fast', vendor: 'fast', kind: 'runner', cost: { unit: 'usd', estimate: 0.01 }, latency_ms: { p50: 500, p95: 1000 }, reliability: { alpha: 9, beta: 1 }, risk: 'low' });
register('runner-cheap', { id: 'runner.cheap', vendor: 'cheap', kind: 'runner', cost: { unit: 'usd', estimate: 0.001 }, latency_ms: { p50: 1500, p95: 3000 }, reliability: { alpha: 6, beta: 4 }, risk: 'medium' });
register('scanner-net', { id: 'scanner.net', vendor: 'scanner', kind: 'scanner', capabilities: ['scan'], cost: { unit: 'usd', estimate: 0.005 }, latency_ms: { p50: 100, p95: 200 }, reliability: { alpha: 8, beta: 2 }, risk: 'low', permissions: { read: true, write: false, network: true } });
register('runner-writer', { id: 'runner.writer', vendor: 'writer', kind: 'runner', cost: { unit: 'usd', estimate: 0.01 }, latency_ms: { p50: 700, p95: 1200 }, reliability: { alpha: 7, beta: 3 }, risk: 'medium', permissions: { read: true, write: true, network: false } });register('runner-restricted', { id: 'runner.restricted', vendor: 'restricted', kind: 'runner', cost: { unit: 'usd', estimate: 0.02 }, latency_ms: { p50: 800, p95: 1500 }, reliability: { alpha: 8, beta: 2 }, risk: 'low', trust_level: 'trusted', conformance_level: 'ci-gated' });

const requestFile = writeJson('routing-request.json', {
  schema_version: 'autoarmory/routing-request/v1', task_type: 'run-agent-eval', risk: 'medium', data_sensitivity: 'internal', cost_budget: 0.02, latency_slo_ms: 2000, write_required: false, security_level: 'standard', task_id: 'route-task-test', context: {}
});
result = route(requestFile, 7);
const routeOne = JSON.parse(result.out);
must(result.code === 0 && routeOne.selected.length === 1, 'capability route selects a module');
must(routeOne.task_id === 'route-task-test', 'routing decision records task_id');
must(Array.isArray(routeOne.candidate_set) && routeOne.candidate_set.length >= 3, 'routing decision records the eligible candidate set');
must(Array.isArray(routeOne.top_k) && routeOne.top_k.length === 3 && routeOne.top_k[0].id === routeOne.selected[0].id, 'routing decision records ranked top_k');
must(typeof routeOne.selection_margin === 'number', 'routing decision records uncalibrated selection margin');
must(routeOne.selection_confidence === null && routeOne.confidence_method === 'uncalibrated', 'selection confidence must not be fabricated');
const linkDecision = {
  schema_version: 'autoarmory/routing-decision/v1',
  request_id: 'route-link',
  task_id: 'task-link',
  selected: [{ id: 'runner.restricted' }],
  rejected: [],
  fallback_chain: [],
  reason: 'link fixture',
  policy_version: 'autoarmory/policy/v1',
  seed: 1,
  evidence_refs: [],
  candidate_set: ['runner.restricted'],
  top_k: [{ id: 'runner.restricted' }],
  selection_margin: null,
  selection_confidence: null,
  confidence_method: 'uncalibrated'
};
fs.writeFileSync(path.join(state, 'routing-decisions.jsonl'), JSON.stringify(linkDecision) + '\n', 'utf8');
const linkedTrace = executionTraceLib.recordExecutionTrace(state, {
  schema_version: 'autoarmory/execution-trace/v1',
  id: 'exec-link',
  decision_id: 'route-link',
  task_id: 'task-link',
  skill_id: 'runner.restricted',
  plan: { steps: ['run'] },
  steps_expected: [{ id: 'run', description: 'Run linked capability', required: true }],
  steps_observed: [{ id: 'obs-run', expected_step_id: 'run', status: 'completed' }],
  order_ok: true,
  stop_conditions_ok: true,
  environment_fingerprint: 'test-env',
  isolation: { independent_process: true, temp_workspace: true, namespace: 'exec-link', dependency_versions: {}, evidence_refs: [] },
  artifact_refs: [],
  started_at: '2026-09-16T00:00:00.000Z',
  finished_at: '2026-09-16T00:00:01.000Z'
});
must(linkedTrace.ok === true, 'linked execution trace fixture must record');

const linkedOutcome = writeJson('outcome-linked.json', outcome({ decision_id: 'route-link', capability_id: 'runner.restricted', execution_id: 'exec-link' }));
result = run(['capability', 'outcome', linkedOutcome, '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).applied === true, 'linked outcome must update reliability');

const unknownExecutionOutcome = writeJson('outcome-unknown-execution.json', outcome({ decision_id: 'route-link', capability_id: 'runner.restricted', execution_id: 'exec-missing' }));
result = run(['capability', 'outcome', unknownExecutionOutcome, '--state', state, '--json']);
must(result.code === 1 && /execution trace not found/i.test(result.out + result.err), 'unknown execution trace must be rejected');
result = route(requestFile, 7);
const routeTwo = JSON.parse(result.out);
must(result.code === 0 && JSON.stringify(routeOne.selected) === JSON.stringify(routeTwo.selected) && JSON.stringify(routeOne.fallback_chain) === JSON.stringify(routeTwo.fallback_chain), 'capability route is deterministic for a seed');
result = route(requestFile);
const unseededOne = JSON.parse(result.out);
result = route(requestFile);
const unseededTwo = JSON.parse(result.out);
must(result.code === 0 && unseededOne.request_id !== unseededTwo.request_id && unseededOne.seed !== unseededTwo.seed, 'unseeded route must produce unique request ids and real exploration seeds');

const writeRequest = writeJson('routing-write.json', { schema_version: 'autoarmory/routing-request/v1', task_type: 'run-agent-eval', risk: 'medium', data_sensitivity: 'internal', cost_budget: 1, latency_slo_ms: 5000, write_required: true, human_approval: true, security_level: 'standard', context: {} });
result = route(writeRequest, 7);
const writeDecision = JSON.parse(result.out);
must(result.code === 0 && writeDecision.selected[0].id === 'runner.writer' && writeDecision.rejected.some(function (item) { return item.id === 'runner.fast' && /write permission/i.test(item.reason); }), 'routing must enforce write permission');

const restrictedRequest = writeJson('routing-restricted.json', { schema_version: 'autoarmory/routing-request/v1', task_type: 'run-agent-eval', risk: 'low', data_sensitivity: 'restricted', cost_budget: 1, latency_slo_ms: 5000, write_required: false, security_level: 'restricted', context: {} });
result = route(restrictedRequest, 7);
const restrictedDecision = JSON.parse(result.out);
must(result.code === 0 && restrictedDecision.selected[0].id === 'runner.restricted', 'restricted security must require trusted capability: ' + result.out + result.err);

result = portfolio();
const frontier = JSON.parse(result.out);
must(result.code === 0 && frontier.frontier.some(function (item) { return item.id === 'runner.fast'; }) && frontier.frontier.some(function (item) { return item.id === 'runner.cheap'; }), 'portfolio returns Pareto modules');
function outcome(overrides) {
  return Object.assign({
    schema_version: 'autoarmory/outcome/v1', decision_id: 'route-test', capability_id: 'runner.fast', task_type: 'run-agent-eval', result: 'success', reward: 1, cost: 0.01, latency_ms: 900, failure_mode: null, environment_fingerprint: 'test-env', evidence: { case: 'c1' }, verified: true, source: 'integration', propensity: 0.5, observed_at: '2026-09-15T00:00:00.000Z'
  }, overrides || {});
}
const successOutcome = writeJson('outcome-success.json', outcome());
result = run(['capability', 'outcome', successOutcome, '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).applied === true, 'verified outcome updates reliability');

result = run(['capability', 'list', '--state', state, '--json']);
let listed = JSON.parse(result.out).find(function (item) { return item.id === 'runner.fast'; });
must(listed.reliability.alpha === 10 && listed.reliability.beta === 1, 'outcome increments Beta alpha');

const fixtureOutcome = writeJson('outcome-fixture.json', outcome({ result: 'success', source: 'fixture' }));
result = run(['capability', 'outcome', fixtureOutcome, '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).applied === false, 'fixture outcome cannot update reliability');

const noApprovalRequest = writeJson('routing-write-no-approval.json', { schema_version: 'autoarmory/routing-request/v1', task_type: 'run-agent-eval', risk: 'medium', data_sensitivity: 'internal', cost_budget: 1, latency_slo_ms: 5000, write_required: true, security_level: 'standard', context: {} });
result = route(noApprovalRequest, 7);
const noApproval = JSON.parse(result.out);
must(result.code === 1 && noApproval.rejected.some(function (item) { return item.id === 'runner.writer' && /human approval/i.test(item.reason); }), 'write routing requires human approval');
const unverified = writeJson('outcome-unverified.json', outcome({ result: 'failure', verified: false }));
result = run(['capability', 'outcome', unverified, '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).applied === false, 'unverified outcome does not update reliability');

for (let i = 0; i < 3; i++) run(['capability', 'outcome', writeJson('drift-success-' + i + '.json', outcome({ capability_id: 'runner.cheap', result: 'success' })), '--state', state, '--json']);
for (let i = 0; i < 3; i++) run(['capability', 'outcome', writeJson('drift-failure-' + i + '.json', outcome({ capability_id: 'runner.cheap', result: 'failure' })), '--state', state, '--json']);
result = run(['capability', 'drift', 'runner.cheap', '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).status === 'alert', 'drift alert: ' + result.out + result.err);

result = run(['capability', 'conformance', 'runner.fast', '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).ok === true, 'conformance pass');

result = retire('runner.cheap', 'Repeated drift and failures.');
const retirement = JSON.parse(result.out);
must(result.code === 0 && retirement.action === 'retire' && fs.readFileSync(path.join(state, 'replacement-suggestions.jsonl'), 'utf8').includes('runner.cheap'), 'retirement suggestion');
const calibrationFile = writeJson('calibration-outcomes.json', [
  outcome({ capability_id: 'runner.fast', result: 'success', reward: 1, predicted_probability: 0.8, propensity: 0.5 }),
  outcome({ capability_id: 'runner.fast', result: 'failure', reward: 0, predicted_probability: 0.2, propensity: 0.5 }),
  outcome({ capability_id: 'runner.fast', result: 'success', reward: 1, predicted_probability: 0.7, propensity: 0.5 }),
  outcome({ capability_id: 'runner.fast', result: 'success', reward: 1, predicted_probability: 0.9, propensity: 0.5 })
]);
result = calibrate(calibrationFile, 2);
const calibration = JSON.parse(result.out);
must(result.code === 0 && calibration.status === 'calibrated' && typeof calibration.brier === 'number' && typeof calibration.log_loss === 'number' && typeof calibration.ece === 'number', 'policy calibration metrics');

const syntheticFile = writeJson('synthetic-outcomes.json', [outcome({ source: 'fixture', predicted_probability: 0.9 })]);
result = calibrate(syntheticFile, 1);
must(result.code === 1 && /synthetic/i.test(result.out + result.err), 'calibration refuses synthetic data');

result = offPolicyEval(calibrationFile, 2);
const offPolicy = JSON.parse(result.out);
must(result.code === 0 && offPolicy.status === 'evaluated' && typeof offPolicy.ips === 'number' && typeof offPolicy.effective_samples === 'number', 'off-policy evaluation');
result = run(['report', temp]);
must(result.code === 0 && /Capabilities:/i.test(result.out) && /Capability Outcomes:/i.test(result.out), 'report includes capability summary');

result = run(['doctor', temp, '--json']);
must(result.code === 0 && /"id": "capabilities"/.test(result.out), 'doctor checks capability registry');

const exampleLines = fs.readFileSync(path.join(root, 'examples', 'capabilities.jsonl'), 'utf8').trim().split(String.fromCharCode(10)).filter(Boolean).map(function (line) { return JSON.parse(line); });
const exampleState = path.join(temp, 'examples-state');
fs.mkdirSync(exampleState, { recursive: true });
result = run(['capability', 'register', path.join(root, 'examples', 'capabilities.jsonl'), '--state', exampleState, '--json']);
must(result.code === 0 && JSON.parse(result.out).count === 4, 'capability register supports JSONL batch import');const kinds = exampleLines.map(function (item) { return item.kind; }).sort();
must(exampleLines.length === 4 && kinds.join(',') === 'evaluator,mcp-gateway,runner,scanner', 'capability examples cover four adapter kinds');
console.log('Capability registry tests passed');

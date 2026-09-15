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
  schema_version: 'autoarmory/routing-request/v1', task_type: 'run-agent-eval', risk: 'medium', data_sensitivity: 'internal', cost_budget: 0.02, latency_slo_ms: 2000, write_required: false, security_level: 'standard', context: {}
});
result = run(['capability', 'route', '--request', requestFile, '--state', state, '--seed', '7', '--json']);
must(result.code === 0 && JSON.parse(result.out).selected.length === 1, 'capability route selects a module');
const routeOne = result.out;
result = run(['capability', 'route', '--request', requestFile, '--state', state, '--seed', '7', '--json']);
must(result.code === 0 && result.out === routeOne, 'capability route is deterministic for a seed');

const writeRequest = writeJson('routing-write.json', { schema_version: 'autoarmory/routing-request/v1', task_type: 'run-agent-eval', risk: 'medium', data_sensitivity: 'internal', cost_budget: 1, latency_slo_ms: 5000, write_required: true, security_level: 'standard', context: {} });
result = run(['capability', 'route', '--request', writeRequest, '--state', state, '--seed', '7', '--json']);
const writeDecision = JSON.parse(result.out);
must(result.code === 0 && writeDecision.selected[0].id === 'runner.writer' && writeDecision.rejected.some(function (item) { return item.id === 'runner.fast' && /write permission/i.test(item.reason); }), 'routing must enforce write permission');

const restrictedRequest = writeJson('routing-restricted.json', { schema_version: 'autoarmory/routing-request/v1', task_type: 'run-agent-eval', risk: 'low', data_sensitivity: 'restricted', cost_budget: 1, latency_slo_ms: 5000, write_required: false, security_level: 'restricted', context: {} });
result = run(['capability', 'route', '--request', restrictedRequest, '--state', state, '--seed', '7', '--json']);
const restrictedDecision = JSON.parse(result.out);
must(result.code === 0 && restrictedDecision.selected[0].id === 'runner.restricted', 'restricted security must require trusted capability: ' + result.out + result.err);

result = run(['capability', 'portfolio', '--state', state, '--json']);
const frontier = JSON.parse(result.out);
must(result.code === 0 && frontier.frontier.some(function (item) { return item.id === 'runner.fast'; }) && frontier.frontier.some(function (item) { return item.id === 'runner.cheap'; }), 'portfolio returns Pareto modules');
console.log('Capability registry tests passed');
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

console.log('Capability registry tests passed');
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-mechanism-'));
const state = path.join(temp, '.selfforge');
fs.mkdirSync(state, { recursive: true });

function run(args) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function must(condition, message) {
  if (!condition) { console.error('FAIL: ' + message); process.exit(1); }
}
function write(name, value) {
  const file = path.join(temp, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

const usage = {
  schema_version: 'autoarmory/usage-contract/v1', id: 'uc-dw-gmv', capability_id: 'skill.dw.gmv', workflow_id: 'dw_gmv_daily', task_type: 'metric_computation', caller: 'data-agent', success_criteria: ['GMV matches semantic layer'], failure_modes: ['expectation_mismatch'], permissions: { read: true, write: false, network: false }, environment: 'prod', owner: 'dw-team'
};
let result = run(['mechanism', 'usage', 'register', write('usage.json', usage), '--state', state, '--json']);
must(result.code === 0 && result.out.includes('uc-dw-gmv'), 'usage contract register');
result = run(['mechanism', 'usage', 'list', '--state', state, '--json']);
must(result.code === 0 && result.out.includes('uc-dw-gmv'), 'usage contract list');

const invalidCase = { schema_version: 'autoarmory/case/v1', id: 'case-invalid', usage_contract_id: 'missing', title: 'invalid', expected: 'x', actual: 'y', evidence: ['e'], reproducible: true, failure_mode: 'expectation_mismatch', severity: 'high' };
result = run(['mechanism', 'case', 'admit', write('invalid-case.json', invalidCase), '--state', state, '--json']);
must(result.code === 1 && /usage contract/i.test(result.out + result.err), 'case requires usage contract');

const validCase = { schema_version: 'autoarmory/case/v1', id: 'case-gmv-refund', usage_contract_id: 'uc-dw-gmv', title: 'GMV includes refund', expected: 'GMV excludes refund', actual: 'GMV includes refund', evidence: ['sql result mismatch'], reproducible: true, failure_mode: 'expectation_mismatch', severity: 'high' };
result = run(['mechanism', 'case', 'admit', write('case.json', validCase), '--state', state, '--json']);
must(result.code === 0 && result.out.includes('case-gmv-refund'), 'case admission');
result = run(['mechanism', 'case', 'list', '--state', state, '--json']);
must(result.code === 0 && result.out.includes('case-gmv-refund'), 'case list');

const mechanism = { schema_version: 'autoarmory/mechanism/v1', id: 'mech-semantic-gmv', name: 'Metric semantic contract', covered_failure_modes: ['expectation_mismatch'], trigger: 'metric computation starts', action: 'validate metric against semantic layer', verification: 'independent SQL oracle', closure_criteria: 'case passes oracle and no regression', permissions: { read: true, write: false }, owner: 'dw-team', status: 'proposed', version: '1.0.0' };
result = run(['mechanism', 'register', write('mechanism.json', mechanism), '--state', state, '--json']);
must(result.code === 0 && result.out.includes('mech-semantic-gmv'), 'mechanism register');

const badRun = { schema_version: 'autoarmory/mechanism-run/v1', id: 'run-bad', mechanism_id: 'mech-semantic-gmv', case_id: 'case-gmv-refund', actor: 'same-agent', verified_by: 'same-agent', verified: true, result: 'pass', evidence: ['fake'], regression: false, started_at: '2026-09-15T00:00:00.000Z', finished_at: '2026-09-15T00:01:00.000Z' };
result = run(['mechanism', 'run', write('bad-run.json', badRun), '--state', state, '--json']);
must(result.code === 1 && /independent/i.test(result.out + result.err), 'verification must be independent');

const goodRun = Object.assign({}, badRun, { id: 'run-good', actor: 'autoarmory', verified_by: 'independent-oracle', evidence: ['before 1.2 -> after 0.9'] });
result = run(['mechanism', 'run', write('good-run.json', goodRun), '--state', state, '--json']);
must(result.code === 0 && result.out.includes('run-good'), 'verified mechanism run');
result = run(['mechanism', 'close', '--case', 'case-gmv-refund', '--run', 'run-good', '--state', state, '--json']);
must(result.code === 0 && /closed/.test(result.out), 'verified run closes case');
result = run(['mechanism', 'effectiveness', 'mech-semantic-gmv', '--state', state, '--json']);
const effectiveness = JSON.parse(result.out);
must(result.code === 0 && effectiveness.runs === 1 && effectiveness.closure_rate === 1, 'mechanism effectiveness');

console.log('Mechanism core tests passed');
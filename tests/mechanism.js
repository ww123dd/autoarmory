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
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

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

function admit(id, incidentId) {
  return { schema_version: 'autoarmory/case/v1', id: id, incident_id: incidentId, title: 'Replayable failure case', expected_transition: 'FAIL->PASS', failure_mode: 'evidence_fabrication', severity: 'critical', evidence: ['before/after observation'], reproducible: true, owner: 'codex' };
}
function mechanism(id, staleDays) {
  return { schema_version: 'autoarmory/mechanism/v1', id: id, name: 'Evidence closure mechanism', covered_failure_modes: ['evidence_fabrication'], trigger: 'candidate is proposed', action: 'require independently verified replay evidence', verification: 'independent verifier replays the case', closure_criteria: 'pass, independent verification, no regression, hashes recorded', owner: 'codex', version: '1.0.0', verification_stale_days: staleDays || 30 };
}
function runRecord(id, caseId, mechanismId, finishedAt, overrides) {
  return Object.assign({ schema_version: 'autoarmory/mechanism-run/v1', id: id, mechanism_id: mechanismId, case_id: caseId, actor: 'fixer', verified_by: 'independent-verifier', verified: true, result: 'pass', evidence: ['replay output'], input_sha256: hashA, output_sha256: hashB, environment_fingerprint: 'test-env', exit_code: 0, regression: false, started_at: finishedAt, finished_at: finishedAt }, overrides || {});
}

let result = run(['mechanism', 'case-admit', write('case.json', admit('case-evidence', 'inc-1')), '--state', state, '--json']);
must(result.code === 0 && result.out.includes('case-evidence'), 'case admission');
result = run(['mechanism', 'register', write('mechanism.json', mechanism('mech-evidence')), '--state', state, '--json']);
must(result.code === 0 && result.out.includes('mech-evidence'), 'mechanism registration');

result = run(['mechanism', 'run', write('bad-run.json', runRecord('run-bad', 'case-evidence', 'mech-evidence', '2026-09-15T00:00:00.000Z', { verified_by: 'fixer' })), '--state', state, '--json']);
must(result.code === 1 && /independent/i.test(result.out + result.err), 'self-verification must BLOCK');
result = run(['mechanism', 'run', write('bad-hash.json', runRecord('run-bad-hash', 'case-evidence', 'mech-evidence', '2026-09-15T00:00:00.000Z', { input_sha256: 'short' })), '--state', state, '--json']);
must(result.code === 1 && /sha256/i.test(result.out + result.err), 'missing hashes must BLOCK');
result = run(['mechanism', 'run', write('good-run.json', runRecord('run-good', 'case-evidence', 'mech-evidence', '2026-09-15T00:00:00.000Z')), '--state', state, '--json']);
must(result.code === 0 && result.out.includes('run-good'), 'verified run');
result = run(['mechanism', 'close', '--case', 'case-evidence', '--run', 'run-good', '--state', state, '--json']);
must(result.code === 0 && result.out.includes('closed'), 'verified run closes case');
result = run(['mechanism', 'status', 'mech-evidence', '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).status === 'closed', 'closed status');

result = run(['mechanism', 'register', write('unverified-mechanism.json', mechanism('mech-unverified')), '--state', state, '--json']);
must(result.code === 0, 'unverified mechanism register');
result = run(['mechanism', 'status', 'mech-unverified', '--state', state, '--json']);
must(result.code === 1 && JSON.parse(result.out).status === 'unverified', 'no runs must be unverified');

result = run(['mechanism', 'case-admit', write('stale-case.json', admit('case-stale', 'inc-2')), '--state', state, '--json']);
must(result.code === 0, 'stale case admission');
result = run(['mechanism', 'register', write('stale-mechanism.json', mechanism('mech-stale', 1)), '--state', state, '--json']);
must(result.code === 0, 'stale mechanism register');
result = run(['mechanism', 'run', write('stale-run.json', runRecord('run-stale', 'case-stale', 'mech-stale', '2020-01-01T00:00:00.000Z')), '--state', state, '--json']);
must(result.code === 0, 'stale run record');
result = run(['mechanism', 'status', 'mech-stale', '--state', state, '--json']);
must(result.code === 1 && JSON.parse(result.out).status === 'expired', 'stale run must expire');

console.log('mechanism tests passed: case, register, run, close, status, independent verification, hashes, expiry');
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const mechanism = require('../src/lib/mechanism');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-mechanism-'));
const state = path.join(temp, '.selfforge');
fs.mkdirSync(state, { recursive: true });
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

function must(condition, message) { if (!condition) throw new Error(message); }
function write(name, value) { const file = path.join(temp, name); fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); return file; }
function claimCase(id, incidentId) { return { schema_version: 'autoarmory/case/v1', id: id, incident_id: incidentId, title: 'Replayable failure case', expected_transition: 'FAIL->PASS', failure_mode: 'evidence_fabrication', severity: 'critical', evidence: ['before/after observation'], reproducible: true, owner: 'codex' }; }
function mechanismRecord(id, staleDays) { return { schema_version: 'autoarmory/mechanism/v1', id: id, name: 'Evidence closure mechanism', covered_failure_modes: ['evidence_fabrication'], trigger: 'candidate is proposed', action: 'require independently verified replay evidence', verification: 'independent verifier replays the case', closure_criteria: 'pass, independent verification, no regression, hashes recorded', owner: 'codex', version: '1.0.0', verification_stale_days: staleDays || 30 }; }
function runRecord(id, caseId, mechanismId, finishedAt, overrides) { return Object.assign({ schema_version: 'autoarmory/mechanism-run/v1', id: id, mechanism_id: mechanismId, case_id: caseId, actor: 'fixer', verified_by: 'independent-verifier', verified: true, result: 'pass', evidence: ['replay output'], input_sha256: hashA, output_sha256: hashB, environment_fingerprint: 'test-env', exit_code: 0, regression: false, started_at: finishedAt, finished_at: finishedAt }, overrides || {}); }
function cliRun(args) { const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' }); return { code: result.status, out: result.stdout || '', err: result.stderr || '' }; }

must(mechanism.admitCase(state, claimCase('case-evidence', 'inc-1')).ok, 'case admission');
must(mechanism.registerMechanism(state, mechanismRecord('mech-evidence')).ok, 'mechanism registration');
let result = mechanism.recordMechanismRun(state, runRecord('run-bad', 'case-evidence', 'mech-evidence', '2026-09-15T00:00:00.000Z', { verified_by: 'fixer' }));
must(!result.ok && /independent/i.test(result.errors.join(' ')), 'self-verification must fail');
result = mechanism.recordMechanismRun(state, runRecord('run-bad-hash', 'case-evidence', 'mech-evidence', '2026-09-15T00:00:00.000Z', { input_sha256: 'short' }));
must(!result.ok && /sha256/i.test(result.errors.join(' ')), 'missing hashes must fail');
must(mechanism.recordMechanismRun(state, runRecord('run-good', 'case-evidence', 'mech-evidence', '2026-09-15T00:00:00.000Z')).ok, 'verified run');

result = cliRun(['close', '--case', 'case-evidence', '--run', 'run-good', '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).status.status === 'closed', 'close command must close and return verdict');
must(mechanism.status(state, 'mech-evidence').status === 'closed', 'closed status');

must(mechanism.registerMechanism(state, mechanismRecord('mech-unverified')).ok, 'unverified mechanism register');
must(mechanism.status(state, 'mech-unverified').status === 'unverified', 'no runs must be unverified');

must(mechanism.admitCase(state, claimCase('case-stale', 'inc-2')).ok, 'stale case admission');
must(mechanism.registerMechanism(state, mechanismRecord('mech-stale', 1)).ok, 'stale mechanism register');
must(mechanism.recordMechanismRun(state, runRecord('run-stale', 'case-stale', 'mech-stale', '2020-01-01T00:00:00.000Z')).ok, 'stale run record');
must(mechanism.status(state, 'mech-stale').status === 'expired', 'stale run must expire');

console.log('mechanism tests passed: case, register, run, close, status, independent verification, hashes, expiry');
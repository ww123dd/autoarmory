#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'autoarmory.js');
const verify = require(path.join(ROOT, 'src', 'lib', 'verify'));
const mechanism = require(path.join(ROOT, 'src', 'lib', 'mechanism'));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-negative-controls-'));

function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function run(args, cwd) { return spawnSync(process.execPath, [CLI].concat(args), { cwd: cwd || ROOT, encoding: 'utf8' }); }
function control(id, expected, observed, detail) { return { id, expected, observed, pass: expected === observed, detail: detail || '' }; }
function writePid(file, value) { fs.writeFileSync(file, String(value), 'ascii'); }
function makeRepo(name) {
  const repo = path.join(work, name);
  const adapter = path.join(repo, 'scripts', 'verify', 'state-query.js');
  const bridge = path.join(repo, 'examples', 'adapters', 'pid-file-live', 'bridge.js');
  const pidFile = path.join(repo, 'fixture.pid');
  fs.mkdirSync(path.dirname(adapter), { recursive: true });
  fs.mkdirSync(path.dirname(bridge), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts', 'verify', 'state-query.js'), adapter);
  fs.copyFileSync(path.join(ROOT, 'examples', 'adapters', 'pid-file-live', 'bridge.js'), bridge);
  writePid(pidFile, process.pid);
  const lock = {
    schema_version: 'autoarmory/verifiers-lock/v1',
    verifiers: [{
      id: 'nc-pid-file-live', kind: 'pid-file-live', readonly: true,
      adapter: 'scripts/verify/state-query.js', adapter_sha256: sha(adapter),
      statement: 'PID file must parse as a positive integer and the referenced process must be alive.',
      assertion: { path: 'valid_and_alive', op: 'eq', value: true }, timeout_ms: 10000,
      bridge: { adapter: 'examples/adapters/pid-file-live/bridge.js', adapter_sha256: sha(bridge), server: { pid_file: pidFile } }
    }]
  };
  write(path.join(repo, 'verifiers.lock.json'), JSON.stringify(lock, null, 2) + '\n');
  return { repo: repo, adapter: adapter, bridge: bridge, pidFile: pidFile };
}

function caseRecord() {
  return { schema_version: 'autoarmory/case/v1', id: 'case-nc', incident_id: 'inc-nc', title: 'Negative control fixture', expected_transition: 'COUNT->0', failure_mode: 'masked_failure', severity: 'high', evidence: ['fixture'], reproducible: true, owner: 'codex' };
}
function mechanismRecord() {
  return { schema_version: 'autoarmory/mechanism/v1', id: 'mech-nc', name: 'Negative control fixture', covered_failure_modes: ['masked_failure'], trigger: 'fixture trigger', action: 'fixture action', verification: 'pinned fixture verifier', verifier_id: 'nc-pid-file-live', closure_criteria: 'valid live pid passes and invalid pid fails', owner: 'codex', version: '1.0.0' };
}
function capture(fx, id) {
  const result = verify.captureRefs([{ id: id, verifier: 'nc-pid-file-live', params: {} }], { repo: fx.repo, case_id: 'case-nc', mechanism_id: 'mech-nc', run_id: 'run-' + id, trials: 3 });
  if (result.status !== 'captured') throw new Error('capture failed: ' + JSON.stringify(result));
  return result.captured[0];
}
function runRecord(id, ref, now) {
  return { schema_version: 'autoarmory/mechanism-run/v1', id: id, mechanism_id: 'mech-nc', case_id: 'case-nc', actor: 'codex', evidence_refs: [ref], counterexample: { kind: 'fixture', expected: true }, environment_fingerprint: 'negative-control-fixture', started_at: now, finished_at: now };
}
function setupMechanism(fx) {
  const state = path.join(fx.repo, '.selfforge');
  const a = mechanism.admitCase(state, caseRecord());
  if (!a.ok) throw new Error('case admission failed: ' + JSON.stringify(a));
  const m = mechanism.registerMechanism(state, mechanismRecord(), { repo: fx.repo });
  if (!m.ok) throw new Error('mechanism registration failed: ' + JSON.stringify(m));
}
function baseRun(fx) {
  setupMechanism(fx);
  const ref = capture(fx, 'base');
  const now = new Date().toISOString();
  const r = mechanism.recordMechanismRun(path.join(fx.repo, '.selfforge'), runRecord('run-base', ref, now), { repo: fx.repo });
  if (!r.ok) throw new Error('base run failed: ' + JSON.stringify(r));
  return ref;
}

const controls = [];
const base = makeRepo('base');
baseRun(base);
const baseClose = mechanism.closeCase(path.join(base.repo, '.selfforge'), 'case-nc', 'run-base', { repo: base.repo });
if (!baseClose.ok) throw new Error('base chain did not close: ' + JSON.stringify(baseClose));

// 1. self-reported pass but verifier fail.
{
  const fx = makeRepo('false-pass');
  setupMechanism(fx);
  writePid(fx.pidFile, 0);
  const ref = capture(fx, 'false-pass');
  const forged = runRecord('run-false-pass', ref, new Date().toISOString());
  forged.result = 'pass';
  write(path.join(fx.repo, '.selfforge', 'mechanism-runs.jsonl'), JSON.stringify(forged) + '\n');
  const result = mechanism.closeCase(path.join(fx.repo, '.selfforge'), 'case-nc', 'run-false-pass', { repo: fx.repo });
  controls.push(control('false-success', 'REJECT', result.ok ? 'ADMITTED' : 'REJECT', result.ok ? 'forged pass was admitted' : 'forged pass rejected'));
}

// 2. adapter tamper.
{
  const fx = makeRepo('adapter-tamper');
  baseRun(fx);
  fs.appendFileSync(fx.adapter, '\n// tampered\n', 'utf8');
  const result = mechanism.closeCase(path.join(fx.repo, '.selfforge'), 'case-nc', 'run-base', { repo: fx.repo });
  controls.push(control('adapter-tamper', 'MISMATCH', result.ok ? 'ADMITTED' : 'MISMATCH', result.errors ? result.errors.join('; ') : ''));
}

// 3. bridge tamper.
{
  const fx = makeRepo('bridge-tamper');
  baseRun(fx);
  fs.appendFileSync(fx.bridge, '\n// tampered\n', 'utf8');
  const result = mechanism.closeCase(path.join(fx.repo, '.selfforge'), 'case-nc', 'run-base', { repo: fx.repo });
  controls.push(control('bridge-tamper', 'MISMATCH', result.ok ? 'ADMITTED' : 'MISMATCH', result.errors ? result.errors.join('; ') : ''));
}

// 4-5. missing hashes.
{
  const fx = makeRepo('missing-input');
  const ref = capture(fx, 'missing-input');
  delete ref.input_sha256;
  const result = verify.verifyRefs([ref], { repo: fx.repo });
  controls.push(control('missing-input-hash', 'UNVERIFIABLE', result.status.toUpperCase(), result.reason));
}
{
  const fx = makeRepo('missing-output');
  const ref = capture(fx, 'missing-output');
  delete ref.output_sha256;
  const result = verify.verifyRefs([ref], { repo: fx.repo });
  controls.push(control('missing-output-hash', 'UNVERIFIABLE', result.status.toUpperCase(), result.reason));
}

// 6. unknown verifier.
{
  const fx = makeRepo('unknown-verifier');
  const result = verify.verifyRefs([{ id: 'unknown', verifier: 'not-registered', input_sha256: '0'.repeat(64), output_sha256: '0'.repeat(64), exit_code: 0 }], { repo: fx.repo });
  controls.push(control('unknown-verifier', 'UNVERIFIABLE', result.status.toUpperCase(), result.reason));
}

// 7. non-readonly verifier.
{
  const fx = makeRepo('non-readonly');
  const lockFile = path.join(fx.repo, 'verifiers.lock.json');
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  lock.verifiers[0].readonly = false;
  write(lockFile, JSON.stringify(lock, null, 2) + '\n');
  const result = verify.verifyRefs([{ id: 'non-readonly', verifier: 'nc-pid-file-live', input_sha256: '0'.repeat(64), output_sha256: '0'.repeat(64), exit_code: 0 }], { repo: fx.repo });
  controls.push(control('non-readonly-verifier', 'UNVERIFIABLE', result.status.toUpperCase(), result.reason));
}

// 8-9. approval and gate missing.
{
  const state = path.join(work, 'transition-state');
  const candidateId = 'cand-nc';
  const candidateFile = path.join(work, 'candidate-nc.json');
  const gateFile = path.join(work, 'gate-nc.json');
  const approvalFile = path.join(work, 'approval-nc.json');
  write(candidateFile, JSON.stringify({ schema_version: 'selfforge/candidate/v1', id: candidateId, status: 'candidate' }, null, 2));
  write(gateFile, JSON.stringify({ schema_version: 'selfforge/gate/v1', ok: true, candidate_id: candidateId, skillcanary: { schema_version: 'selfforge/skillcanary-gate/v1', ok: true, command: 'gate', exit_code: 0, change_sha256: 'd'.repeat(64) } }, null, 2));
  write(approvalFile, JSON.stringify({ schema_version: 'selfforge/approval/v1', id: 'appr-nc', candidate_id: candidateId, requested_by: 'agent', approved_by: 'user', approved_at: new Date().toISOString(), channel: 'fixture', scope: 'gated', status: 'approved' }, null, 2));
  let r = run(['transition', candidateFile, '--to', 'pending_approval', '--actor', 'codex', '--state', state, '--json']);
  if (r.status !== 0) throw new Error('pending transition failed: ' + r.stdout + r.stderr);
  r = run(['transition', candidateFile, '--to', 'gated', '--gate', gateFile, '--state', state, '--json']);
  controls.push(control('approval-missing', 'REJECT', r.status === 0 ? 'ADMITTED' : 'REJECT', r.stderr || r.stdout));
  r = run(['transition', candidateFile, '--to', 'gated', '--approval', approvalFile, '--state', state, '--json']);
  controls.push(control('gate-missing', 'REJECT', r.status === 0 ? 'ADMITTED' : 'REJECT', r.stderr || r.stdout));
}

// 10. missing counterexample.
{
  const fx = makeRepo('missing-counterexample');
  setupMechanism(fx);
  const ref = capture(fx, 'counterexample');
  const record = runRecord('run-counterexample', ref, new Date().toISOString());
  delete record.counterexample;
  const result = mechanism.recordMechanismRun(path.join(fx.repo, '.selfforge'), record, { repo: fx.repo });
  controls.push(control('missing-counterexample', 'REJECT', result.ok ? 'ADMITTED' : 'REJECT', (result.errors || []).join('; ')));
}

// 11. exit code mismatch.
{
  const fx = makeRepo('exit-mismatch');
  const ref = capture(fx, 'exit-mismatch');
  ref.exit_code = ref.exit_code === 0 ? 1 : 0;
  const result = verify.verifyRefs([ref], { repo: fx.repo });
  controls.push(control('exit-code-mismatch', 'MISMATCH', result.status.toUpperCase(), result.reason));
}

// 12. external lock anchor and write guard.
{
  const guardPath = process.env.AUTOARMORY_GUARD_CORE || path.join(os.homedir(), '.codex', 'hooks', 'guard-core.js');
  const anchorPath = process.env.AUTOARMORY_LOCK_ANCHOR || path.join(os.homedir(), '.codex', 'hooks', 'verifier-lock.sha256');
  const tamperedLock = path.join(work, 'tampered-verifiers.lock.json');
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'verifiers.lock.json'), 'utf8'));
  lock.verifiers[0].assertion.value = false;
  write(tamperedLock, JSON.stringify(lock, null, 2) + '\n');
  const probe = spawnSync(process.execPath, ['-e', "const g=require(process.argv[1]); console.log(JSON.stringify(g.verifierLockStatus()));", guardPath], { env: Object.assign({}, process.env, { AUTOARMORY_LOCK_PATH: tamperedLock, AUTOARMORY_LOCK_ANCHOR: anchorPath }), encoding: 'utf8' });
  const status = JSON.parse(probe.stdout || '{}');
  const guard = require(guardPath);
  const lockPath = path.join(ROOT, 'verifiers.lock.json');
  const writeBlocked = guard.veto(['Edit', lockPath], { tool: 'Edit', command: '', pathTargets: [lockPath] }).length > 0;
  controls.push(control('lock-anchor-tamper', 'BLOCK', status.ok === false && writeBlocked ? 'BLOCK' : 'ALLOWED', JSON.stringify({ status: status, writeBlocked: writeBlocked })));
}

const failed = controls.filter(function (item) { return !item.pass; });
const tamper = controls.filter(function (item) { return /tamper|lock-anchor/.test(item.id); });
const unverifiable = controls.filter(function (item) { return /missing-input|missing-output|unknown-verifier|non-readonly/.test(item.id); });
const falseSuccess = controls.find(function (item) { return item.id === 'false-success'; });
const report = {
  schema_version: 'autoarmory/negative-controls/v1',
  generated_at: new Date().toISOString(),
  mode: 'one-chain-x-12-negative-controls',
  base_chain: { status: baseClose.ok ? 'closed' : 'failed' },
  controls: controls,
  metrics: {
    total: controls.length,
    passed: controls.length - failed.length,
    failed: failed.length,
    tamper_detection_rate: tamper.length ? tamper.filter(function (item) { return item.pass; }).length / tamper.length : 0,
    unverifiable_rate: unverifiable.length ? unverifiable.filter(function (item) { return item.pass; }).length / unverifiable.length : 0,
    false_success_attempts: 1,
    false_success_admitted: falseSuccess && falseSuccess.observed === 'ADMITTED' ? 1 : 0,
    false_success_rate: falseSuccess && falseSuccess.observed === 'ADMITTED' ? 1 : 0,
    wrong_admission_rate: falseSuccess && falseSuccess.observed === 'ADMITTED' ? 1 : 0
  }
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1 && process.argv[outputIndex + 1]) write(path.resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
process.exit(failed.length ? 1 : 0);

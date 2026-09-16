'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const mechanism = require('../src/lib/mechanism');
const verify = require('../src/lib/verify');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-mechanism-'));
const cli = path.resolve(__dirname, '..', 'bin', 'autoarmory.js');
function must(condition, message) { if (!condition) throw new Error(message); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); }
function adapterSource() {
  return [
    "'use strict';",
    "const fs = require('fs');",
    "const crypto = require('crypto');",
    "function canonicalize(value) { if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonicalize(value[key]); }).join(',') + '}'; return JSON.stringify(value); }",
    "function sha256(value) { return crypto.createHash('sha256').update(canonicalize(value)).digest('hex'); }",
    "const payload = JSON.parse(fs.readFileSync(0, 'utf8'));",
    "const fail = payload.ref && payload.ref.params && payload.ref.params.mode === 'fail';",
    "const observed = fail ? 4998287 : 0;",
    "const exitCode = fail ? 1 : 0;",
    "const input = { verifier: payload.ref.verifier, observed: observed };",
    "const output = { observed: observed, exit_code: exitCode };",
    "process.stdout.write(JSON.stringify({ ok: true, input_sha256: sha256(input), output_sha256: sha256(output), exit_code: exitCode, observed: observed }));",
    "process.exit(0);"
  ].join('\n');
}
function makeRepo(name) {
  const repo = path.join(root, name);
  const adapter = path.join(repo, 'scripts', 'verify', 'fixture.js');
  write(adapter, adapterSource());
  write(path.join(repo, 'verifiers.lock.json'), JSON.stringify({
    schema_version: 'autoarmory/verifiers-lock/v1',
    verifiers: [
      { id: 'fixture', kind: 'fixture', readonly: true, adapter: 'scripts/verify/fixture.js', adapter_sha256: sha256File(adapter), timeout_ms: 10000 },
      { id: 'other', kind: 'fixture', readonly: true, adapter: 'scripts/verify/fixture.js', adapter_sha256: sha256File(adapter), timeout_ms: 10000 }
    ]
  }, null, 2) + '\n');
  fs.mkdirSync(path.join(repo, '.selfforge'), { recursive: true });
  return { repo: repo, state: path.join(repo, '.selfforge') };
}
function caseRecord(id, incidentId) {
  return { schema_version: 'autoarmory/case/v1', id: id, incident_id: incidentId, title: 'Replayable failure case', expected_transition: 'COUNT->0', failure_mode: 'drift', severity: 'critical', evidence: ['fixture evidence'], reproducible: true, owner: 'codex' };
}
function mechanismRecord(id, staleDays) {
  return { schema_version: 'autoarmory/mechanism/v1', id: id, name: 'Fixture guard', covered_failure_modes: ['drift'], trigger: 'fixture trigger', action: 'fixture action', verification: 'pinned fixture adapter', verifier_id: 'fixture', closure_criteria: 'exit code 0 with a counterexample', owner: 'codex', version: '1.0.0', verification_stale_days: staleDays || 30 };
}
function fixtureRef(id, mode, verifier) { return { id: id, verifier: verifier || 'fixture', params: { mode: mode || 'pass' } }; }
function capture(repo, id, mode, verifier) {
  const captured = verify.captureRefs([fixtureRef(id, mode, verifier)], { repo: repo });
  must(captured.status === 'captured' && captured.captured.length === 1, 'fixture capture ' + id + ' must succeed');
  return captured.captured[0];
}
function runRecord(id, mechanismId, caseId, evidenceRef, finishedAt, overrides) {
  const base = Object.assign({
    schema_version: 'autoarmory/mechanism-run/v1',
    id: id,
    mechanism_id: mechanismId,
    case_id: caseId,
    actor: 'fixer',
    evidence_refs: [evidenceRef],
    result: evidenceRef.exit_code === 0 ? 'pass' : 'fail',
    counterexample: { kind: 'count_gt_zero', expected: 0, observed: evidenceRef.exit_code === 0 ? 0 : 4998287 },
    environment_fingerprint: 'fixture-environment',
    started_at: finishedAt,
    finished_at: finishedAt,
    regression: false
  }, overrides || {});
  return base;
}
function cliRun(args, cwd) { const result = spawnSync(process.execPath, [cli].concat(args), { cwd: cwd, encoding: 'utf8' }); return { code: result.status, out: result.stdout || '', err: result.stderr || '' }; }

let fixture = makeRepo('self-report');
must(mechanism.admitCase(fixture.state, caseRecord('case-self', 'inc-self')).ok, 'case admission');
must(mechanism.registerMechanism(fixture.state, mechanismRecord('mech-self')).ok, 'mechanism registration');
let result = mechanism.recordMechanismRun(fixture.state, runRecord('run-self', 'mech-self', 'case-self', { id: 'self', verifier: 'fixture', input_sha256: '0'.repeat(64), output_sha256: '0'.repeat(64), exit_code: 0 }, '2026-09-15T00:00:00.000Z', { verification: { independent: true, verifier_id: 'fixer' }, verified_by: 'fixer', verified: true }), { repo: fixture.repo });
must(!result.ok && /no evidence refs|verification failed/.test(result.errors.join(' ')), 'self-reported verification must be rejected');

fixture = makeRepo('missing-hash');
must(mechanism.admitCase(fixture.state, caseRecord('case-missing-hash', 'inc-missing-hash')).ok, 'missing-hash case admission');
must(mechanism.registerMechanism(fixture.state, mechanismRecord('mech-missing-hash')).ok, 'missing-hash mechanism registration');
result = mechanism.recordMechanismRun(fixture.state, runRecord('run-missing-hash', 'mech-missing-hash', 'case-missing-hash', { id: 'missing-hash', verifier: 'fixture' }, '2026-09-15T00:00:00.000Z'), { repo: fixture.repo });
must(!result.ok && /input_sha256|output_sha256|exit_code/.test(result.errors.join(' ')), 'missing ref hashes must be rejected');

fixture = makeRepo('fake-pass');
must(mechanism.admitCase(fixture.state, caseRecord('case-fake-pass', 'inc-fake-pass')).ok, 'fake-pass case admission');
must(mechanism.registerMechanism(fixture.state, mechanismRecord('mech-fake-pass')).ok, 'fake-pass mechanism registration');
const failRef = capture(fixture.repo, 'fake-pass-fail', 'fail');
result = mechanism.recordMechanismRun(fixture.state, runRecord('run-fake-pass', 'mech-fake-pass', 'case-fake-pass', failRef, '2026-09-15T00:00:00.000Z', { result: 'pass' }), { repo: fixture.repo });
must(!result.ok && /result does not match|re-derived exit code|verification failed/.test(result.errors.join(' ')), 'claimed pass with re-derived failure must be rejected');

fixture = makeRepo('good-pass');
must(mechanism.admitCase(fixture.state, caseRecord('case-good', 'inc-good')).ok, 'good case admission');
must(mechanism.registerMechanism(fixture.state, mechanismRecord('mech-good', 1)).ok, 'good mechanism registration');
const goodRef = capture(fixture.repo, 'good-pass-ref', 'pass');
const now = new Date().toISOString();
result = mechanism.recordMechanismRun(fixture.state, runRecord('run-good', 'mech-good', 'case-good', goodRef, now), { repo: fixture.repo });
must(result.ok, 'verified pass run must record');
must(result.run.input_sha256 === goodRef.input_sha256 && result.run.output_sha256 === goodRef.output_sha256 && result.run.exit_code === 0 && result.run.result === 'pass', 'recorded run must use re-derived facts');
must(result.run.verification_result && result.run.verification_result.status === 'verified', 'recorded run must carry judge result');
must(result.run.verification === undefined && result.run.verified_by === undefined, 'self-reported verification fields must not be stored');
const cliClose = cliRun(['close', '--case', 'case-good', '--run', 'run-good', '--state', fixture.state, '--repo', fixture.repo, '--json'], fixture.repo);
must(cliClose.code === 0 && JSON.parse(cliClose.out).status.status === 'closed', 'close CLI must pass repo root to the judge');
must(mechanism.status(fixture.state, 'mech-good', { repo: fixture.repo }).status === 'closed', 'closed status must be derived from a fresh re-derivation');

const recorder = path.resolve(__dirname, '..', 'scripts', 'mechanism-record.js');
fixture = makeRepo('recorder');
must(mechanism.admitCase(fixture.state, caseRecord('case-recorder', 'inc-recorder')).ok, 'recorder case admission');
must(mechanism.registerMechanism(fixture.state, mechanismRecord('mech-recorder')).ok, 'recorder mechanism registration');
const recorderRun = spawnSync(process.execPath, [recorder, '--mechanism', 'mech-recorder', '--case', 'case-recorder', '--counterexample-kind', 'count_gt_zero', '--state', fixture.state, '--repo', fixture.repo, '--close', '--json'], { cwd: fixture.repo, encoding: 'utf8' });
must(recorderRun.status === 0, 'mechanism recorder must record and close: ' + String(recorderRun.stderr || recorderRun.stdout || '').slice(0, 300));
const recorderReport = JSON.parse(recorderRun.stdout);
must(recorderReport.run.result === 'pass' && recorderReport.run.exit_code === 0, 'mechanism recorder must store re-derived facts');
must(/^[a-f0-9]{64}$/.test(recorderReport.run.input_sha256), 'mechanism recorder must store the re-derived input digest');
must(recorderReport.closure && recorderReport.closure.run_id === recorderReport.run.id, 'mechanism recorder --close must close the recorded run');
must(recorderReport.status.status === 'closed', 'mechanism recorder must report the closed verdict');
const recorderUnknown = spawnSync(process.execPath, [recorder, '--mechanism', 'mech-missing', '--state', fixture.state, '--repo', fixture.repo, '--json'], { cwd: fixture.repo, encoding: 'utf8' });
must(recorderUnknown.status !== 0 && /mechanism not found/.test(recorderUnknown.stdout + recorderUnknown.stderr), 'unknown mechanism must be rejected by the recorder');

fixture = makeRepo('good-fail');
must(mechanism.admitCase(fixture.state, caseRecord('case-fail', 'inc-fail')).ok, 'fail case admission');
must(mechanism.registerMechanism(fixture.state, mechanismRecord('mech-fail')).ok, 'fail mechanism registration');
const failRef2 = capture(fixture.repo, 'good-fail-ref', 'fail');
result = mechanism.recordMechanismRun(fixture.state, runRecord('run-fail', 'mech-fail', 'case-fail', failRef2, now), { repo: fixture.repo });
must(result.ok && result.run.result === 'fail' && result.run.exit_code === 1, 're-derived failure must record');
result = mechanism.closeCase(fixture.state, 'case-fail', 'run-fail', { repo: fixture.repo });
must(!result.ok && /did not pass/.test(result.errors.join(' ')), 'failed run must not close a case');
must(mechanism.status(fixture.state, 'mech-fail', { repo: fixture.repo }).status === 'bypassed', 'failed run status must be bypassed');

fixture = makeRepo('tamper-after-record');
must(mechanism.admitCase(fixture.state, caseRecord('case-tamper', 'inc-tamper')).ok, 'tamper case admission');
must(mechanism.registerMechanism(fixture.state, mechanismRecord('mech-tamper')).ok, 'tamper mechanism registration');
const tamperRef = capture(fixture.repo, 'tamper-ref', 'pass');
result = mechanism.recordMechanismRun(fixture.state, runRecord('run-tamper', 'mech-tamper', 'case-tamper', tamperRef, now), { repo: fixture.repo });
must(result.ok, 'pre-tamper pass run must record');
fs.appendFileSync(path.join(fixture.repo, 'scripts', 'verify', 'fixture.js'), '\n// tampered after recording\n', 'utf8');
result = mechanism.closeCase(fixture.state, 'case-tamper', 'run-tamper', { repo: fixture.repo });
must(!result.ok && /adapter_integrity|mismatch/.test(result.errors.join(' ')), 'closure must re-run the verifier and reject a tampered adapter');

fixture = makeRepo('missing-counterexample');
must(mechanism.admitCase(fixture.state, caseRecord('case-counterexample', 'inc-counterexample')).ok, 'counterexample case admission');
must(mechanism.registerMechanism(fixture.state, mechanismRecord('mech-counterexample')).ok, 'counterexample mechanism registration');
const counterexampleRef = capture(fixture.repo, 'counterexample-ref', 'pass');
const missingCounterexample = runRecord('run-counterexample', 'mech-counterexample', 'case-counterexample', counterexampleRef, '2026-09-15T00:00:00.000Z');
delete missingCounterexample.counterexample;
result = mechanism.recordMechanismRun(fixture.state, missingCounterexample, { repo: fixture.repo });
must(!result.ok && /counterexample/.test(result.errors.join(' ')), 'missing counterexample must be rejected');

fixture = makeRepo('expired');
must(mechanism.admitCase(fixture.state, caseRecord('case-expired', 'inc-expired')).ok, 'expired case admission');
must(mechanism.registerMechanism(fixture.state, mechanismRecord('mech-expired', 1)).ok, 'expired mechanism registration');
const expiredRef = capture(fixture.repo, 'expired-ref', 'pass');
result = mechanism.recordMechanismRun(fixture.state, runRecord('run-expired', 'mech-expired', 'case-expired', expiredRef, '2020-01-01T00:00:00.000Z'), { repo: fixture.repo });
must(result.ok, 'old but verifiable run must record');
must(mechanism.status(fixture.state, 'mech-expired', { repo: fixture.repo }).status === 'expired', 'stale verified run must expire');


fixture = makeRepo('unknown-verifier');
const unknownMechanism = mechanismRecord('mech-unknown');
unknownMechanism.verifier_id = 'missing-verifier';
result = mechanism.registerMechanism(fixture.state, unknownMechanism, { repo: fixture.repo });
must(!result.ok && /not registered/.test(result.errors.join(' ')), 'unknown verifier must be rejected at mechanism registration');

fixture = makeRepo('unbound-verifier');
must(mechanism.admitCase(fixture.state, caseRecord('case-unbound', 'inc-unbound')).ok, 'unbound case admission');
must(mechanism.registerMechanism(fixture.state, mechanismRecord('mech-unbound')).ok, 'unbound mechanism registration');
const otherRef = capture(fixture.repo, 'unbound-ref', 'pass', 'other');
result = mechanism.recordMechanismRun(fixture.state, runRecord('run-unbound', 'mech-unbound', 'case-unbound', otherRef, now), { repo: fixture.repo });
must(!result.ok && /mechanism verifier/.test(result.errors.join(' ')), 'run using an unrelated registered verifier must be rejected');

console.log('mechanism tests passed: self-report=REJECT, missing-hash=REJECT, fake-pass=REJECT, derived-pass=close, derived-fail=bypassed, adapter-tamper=REJECT, missing-counterexample=REJECT, unbound-verifier=REJECT, unknown-verifier=REJECT, expiry=expired');

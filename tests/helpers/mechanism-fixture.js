'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mechanism = require('../../src/lib/mechanism');
const verify = require('../../src/lib/verify');

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}
function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function adapterSource(tag) {
  return [
    "'use strict';",
    "const fs = require('fs');",
    "const crypto = require('crypto');",
    "function canonicalize(value) { if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonicalize(value[key]); }).join(',') + '}'; return JSON.stringify(value); }",
    "function sha256(value) { return crypto.createHash('sha256').update(canonicalize(value)).digest('hex'); }",
    "const payload = JSON.parse(fs.readFileSync(0, 'utf8'));",
    "const observed = payload.params && payload.params.observed !== undefined ? payload.params.observed : 0;",
    "const exitCode = 0;",
    "const input = { verifier: payload.ref.verifier, observed: observed };",
    "const output = { observed: observed, exit_code: exitCode };",
    "process.stdout.write(JSON.stringify({ ok: true, input_sha256: sha256(input), output_sha256: sha256(output), exit_code: exitCode, observed: observed, runner: payload.runner || null }));",
    "process.exit(0);",
    "// fixture runner: " + (tag || 'v1')
  ].join('\n');
}
function writeLock(fixture, options) {
  const opts = options || {};
  const adapterSha = opts.adapter_sha256 || sha256File(fixture.adapter);
  write(path.join(fixture.repo, 'verifiers.lock.json'), JSON.stringify({
    schema_version: 'autoarmory/verifiers-lock/v1',
    verifiers: [{
      id: 'fixture',
      kind: 'fixture',
      version: opts.version || '1.0.0',
      invocation_contract_version: opts.contract || verify.INVOCATION_CONTRACT,
      readonly: true,
      adapter: 'scripts/verify/fixture.js',
      adapter_sha256: adapterSha,
      statement: 'fixture statement',
      assertion: { path: 'observed', op: 'eq', value: opts.expected === undefined ? 0 : opts.expected },
      timeout_ms: 10000
    }]
  }, null, 2) + '\n');
}
function createFixture(root, name) {
  const repo = path.join(root, name);
  const state = path.join(repo, '.selfforge');
  const adapter = path.join(repo, 'scripts', 'verify', 'fixture.js');
  write(adapter, adapterSource(name));
  const fixture = { repo: repo, state: state, adapter: adapter };
  fs.mkdirSync(state, { recursive: true });
  writeLock(fixture);
  return fixture;
}
function registerCaseAndMechanism(fixture) {
  const admitted = mechanism.admitCase(fixture.state, {
    schema_version: 'autoarmory/case/v1',
    id: 'case-fixture',
    incident_id: 'inc-fixture',
    title: 'Fixture case',
    expected_transition: 'COUNT->0',
    failure_mode: 'masked_failure',
    severity: 'high',
    evidence: ['fixture'],
    reproducible: true,
    owner: 'codex',
    verifier: 'fixture',
    done_criteria: 'the pinned fixture re-derives the same fact'
  });
  if (!admitted.ok) throw new Error('case admission: ' + admitted.errors.join('; '));
  const registered = mechanism.registerMechanism(fixture.state, {
    schema_version: 'autoarmory/mechanism/v1',
    id: 'mech-fixture',
    name: 'Fixture guard',
    covered_failure_modes: ['masked_failure'],
    trigger: 'fixture trigger',
    action: 'fixture action',
    verification: 'pinned fixture runner',
    verifier_id: 'fixture',
    closure_criteria: 'runner stays fixed and the fact re-derives',
    owner: 'codex',
    version: '1.0.0'
  }, { repo: fixture.repo });
  if (!registered.ok) throw new Error('mechanism registration: ' + registered.errors.join('; '));
}
function recordRun(fixture, runId, options) {
  const opts = options || {};
  const observed = opts.observed === undefined ? 0 : opts.observed;
  const captured = verify.captureRefs([{ id: runId + '-ref', verifier: 'fixture', params: { observed: observed } }], {
    repo: fixture.repo,
    case_id: 'case-fixture',
    mechanism_id: 'mech-fixture',
    run_id: runId,
    trials: opts.trials || 1
  });
  if (captured.status !== 'captured') throw new Error(runId + ': capture failed: ' + JSON.stringify(captured));
  const now = new Date().toISOString();
  const recorded = mechanism.recordMechanismRun(fixture.state, {
    schema_version: 'autoarmory/mechanism-run/v1',
    id: runId,
    mechanism_id: 'mech-fixture',
    case_id: 'case-fixture',
    actor: 'codex',
    evidence_refs: [captured.captured[0]],
    counterexample: { kind: 'fixture_counterexample', expected: 'COUNT->0', observed: observed },
    environment_fingerprint: 'mechanism-fixture',
    started_at: now,
    finished_at: now
  }, { repo: fixture.repo, trials: opts.trials || 1 });
  if (!recorded.ok) throw new Error(runId + ': record failed: ' + recorded.errors.join('; '));
  return recorded.run;
}
function closeRun(fixture, run, options) {
  const opts = options || {};
  const closed = mechanism.closeCase(fixture.state, 'case-fixture', run.id, { repo: fixture.repo, trials: opts.trials || 1 });
  if (!closed.ok) throw new Error('close failed: ' + closed.errors.join('; '));
  return closed.closure;
}
function reuseRecord(fixture, changeId, options) {
  const opts = options || {};
  const lockText = fs.readFileSync(path.join(fixture.repo, 'verifiers.lock.json'), 'utf8');
  const lock = JSON.parse(lockText);
  const entry = (lock.verifiers || []).find(function (item) { return item.id === 'fixture'; });
  const expected = verify.sha256Text(JSON.stringify({ id: 'fixture', assertion: entry && entry.assertion || null, kind: entry && entry.kind || null }));
  const claim = verify.sha256Text(JSON.stringify({ change_id: changeId, expected_transition: opts.expected_transition || 'COUNT->0', expected_sha256: expected }));
  const record = {
    schema_version: 'autoarmory/reuse-record/v1',
    change_id: changeId,
    decision_id: changeId + ':' + claim,
    claim_sha256: claim,
    expected_sha256: expected,
    expected_provenance: opts.expected_provenance || 'pinned_verifier',
    claim_instance: opts.claim_instance || { verifier: 'fixture' },
    expected_value: opts.expected_value === undefined ? 0 : opts.expected_value,
    verifier_lock_sha256: verify.sha256Text(lockText),
    source_verifier_id: 'fixture',
    verifier: 'fixture',
    mechanism_id: opts.mechanism_id || 'mech-fixture',
    case_id: opts.case_id || 'case-fixture',
    status: opts.status || 'closed',
    run: opts.run || null,
    closure: opts.closure || null,
    expires_at: opts.expires_at || new Date(Date.now() + 30 * 86400000).toISOString(),
    resolved_at: new Date().toISOString()
  };
  write(path.join(fixture.state, 'reuse-records', changeId + '.json'), JSON.stringify(record, null, 2) + '\n');
  return record;
}
module.exports = { createFixture, writeLock, registerCaseAndMechanism, recordRun, closeRun, reuseRecord, adapterSource, sha256File };
'use strict';

// Vertical acceptance for the runner-identity / evidence-freshness loop.
//
// One chain: case -> mechanism -> run -> closure. Every verdict has to name the
// runner that produced it (runner_id + runner_sha256 + invocation_contract_version),
// and that verdict stays valid only while the identity still matches the active
// profile. A human-readable version is compatibility metadata, not a trust root.
//
// The metric is stale_verdict_escape_count: how many stale verdicts were still
// reported as verified or closed.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const mechanism = require('../src/lib/mechanism');
const verify = require('../src/lib/verify');

const CONTRACT = 'autoarmory/invocation-contract/v1';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-stale-verdict-'));
let escapes = 0;

function must(condition, message) { if (!condition) throw new Error(message); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); }
function readJsonl(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); }) : []; }

function adapterSource(tag) {
  return [
    "'use strict';",
    "const fs = require('fs');",
    "const crypto = require('crypto');",
    "function canonicalize(value) { if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonicalize(value[key]); }).join(',') + '}'; return JSON.stringify(value); }",
    "function sha256(value) { return crypto.createHash('sha256').update(canonicalize(value)).digest('hex'); }",
    "const payload = JSON.parse(fs.readFileSync(0, 'utf8'));",
    "const observed = 0;",
    "const exitCode = 0;",
    "const input = { verifier: payload.ref.verifier, observed: observed };",
    "const output = { observed: observed, exit_code: exitCode };",
    "process.stdout.write(JSON.stringify({ ok: true, input_sha256: sha256(input), output_sha256: sha256(output), exit_code: exitCode, observed: observed, runner: payload.runner || null }));",
    "process.exit(0);",
    "// fixture runner: " + (tag || 'v1')
  ].join('\n');
}

function writeLock(repo, options) {
  write(path.join(repo, 'verifiers.lock.json'), JSON.stringify({
    schema_version: 'autoarmory/verifiers-lock/v1',
    verifiers: [{
      id: 'fixture',
      kind: 'fixture',
      version: options.version,
      invocation_contract_version: options.contract,
      readonly: true,
      adapter: 'scripts/verify/fixture.js',
      adapter_sha256: options.adapter_sha256,
      statement: 'fixture statement',
      assertion: { path: 'observed', op: 'eq', value: 0 },
      timeout_ms: 10000
    }]
  }, null, 2) + '\n');
}

function makeFixture(name) {
  const repo = path.join(root, name);
  const adapter = path.join(repo, 'scripts', 'verify', 'fixture.js');
  write(adapter, adapterSource(name));
  writeLock(repo, { version: '1.0.0', contract: CONTRACT, adapter_sha256: sha256File(adapter) });
  const state = path.join(repo, '.selfforge');
  fs.mkdirSync(state, { recursive: true });
  must(mechanism.admitCase(state, {
    schema_version: 'autoarmory/case/v1', id: 'case-fixture', incident_id: 'inc-fixture', title: 'Fixture case',
    expected_transition: 'COUNT->0', failure_mode: 'masked_failure', severity: 'high', evidence: ['fixture'],
    reproducible: true, owner: 'codex'
  }).ok, 'case admission');
  must(mechanism.registerMechanism(state, {
    schema_version: 'autoarmory/mechanism/v1', id: 'mech-fixture', name: 'Fixture guard', covered_failure_modes: ['masked_failure'],
    trigger: 'fixture trigger', action: 'fixture action', verification: 'pinned fixture runner', verifier_id: 'fixture',
    closure_criteria: 'runner stays fixed and the fact re-derives', owner: 'codex', version: '1.0.0'
  }, { repo: repo }).ok, 'mechanism registration');
  return { repo: repo, state: state, adapter: adapter };
}

function recordRun(fixture, runId) {
  const captured = verify.captureRefs([{ id: runId + '-ref', verifier: 'fixture', params: {} }], { repo: fixture.repo, case_id: 'case-fixture', mechanism_id: 'mech-fixture', run_id: runId, trials: 3 });
  must(captured.status === 'captured', runId + ': capture must succeed: ' + JSON.stringify(captured.refs));
  const now = new Date().toISOString();
  const recorded = mechanism.recordMechanismRun(fixture.state, {
    schema_version: 'autoarmory/mechanism-run/v1',
    id: runId,
    mechanism_id: 'mech-fixture',
    case_id: 'case-fixture',
    actor: 'codex',
    evidence_refs: [captured.captured[0]],
    counterexample: { kind: 'fixture_counterexample', expected: 'COUNT->0', observed: 0 },
    environment_fingerprint: 'stale-verdict-fixture',
    started_at: now,
    finished_at: now
  }, { repo: fixture.repo, trials: 3 });
  must(recorded.ok, runId + ': record must succeed: ' + (recorded.errors || []).join('; '));
  must(/^[a-f0-9]{64}$/.test(String(recorded.run.runner_sha256 || '')), runId + ': recorded run must carry runner_sha256');
  must(recorded.run.runner_id === 'fixture', runId + ': recorded run must carry runner_id');
  must(recorded.run.invocation_contract_version === CONTRACT, runId + ': recorded run must carry the invocation contract version');
  return recorded.run;
}
function statusOf(fixture) { return mechanism.status(fixture.state, 'mech-fixture', { repo: fixture.repo, trials: 3 }); }
function runOf(fixture, runId) { return readJsonl(path.join(fixture.state, 'mechanism-runs.jsonl')).find(function (item) { return item.id === runId; }); }
function escapeCheck(fixture, label) {
  const status = statusOf(fixture);
  if (status.status === 'verified' || status.status === 'closed') {
    escapes += 1;
    console.error('ESCAPE(' + label + '): stale verdict reported as ' + status.status);
  }
  return status;
}

// 1. baseline: a run is verified, then the case is closed by that run.
let fixture = makeFixture('baseline');
const baseline = recordRun(fixture, 'run-baseline');
must(statusOf(fixture).status === 'verified', 'baseline run must verify');
const closed = mechanism.closeCase(fixture.state, 'case-fixture', baseline.id, { repo: fixture.repo, trials: 3 });
must(closed.ok && closed.closure.runner_sha256 === baseline.runner_sha256, 'closure must record the runner that closed it');
must(statusOf(fixture).status === 'closed', 'baseline must be closed');

// 2. tamper: same pin, different bytes -> the verdict must go stale and close must be refused.
fixture = makeFixture('tamper');
const tampered = recordRun(fixture, 'run-tamper');
fs.appendFileSync(fixture.adapter, '\n// tampered after record\n');
const tamperStatus = escapeCheck(fixture, 'adapter-tamper');
must(tamperStatus.status !== 'closed', 'tampered runner must not keep a case closed');
const tamperRefusal = mechanism.closeCase(fixture.state, 'case-fixture', tampered.id, { repo: fixture.repo, trials: 3 });
must(!tamperRefusal.ok, 'close must be refused for a tampered runner');
must(/mismatch|integrity|digest/.test(tamperRefusal.errors.join(' ')), 'tamper refusal must name the integrity break: ' + tamperRefusal.errors.join(' '));

// 3. runner change: new runner bytes plus a re-pin. The old verdict must not survive,
//    and the same case must close again once the run is re-bound to the new runner.
fixture = makeFixture('runner-change');
const before = recordRun(fixture, 'run-before-change');
must(mechanism.closeCase(fixture.state, 'case-fixture', before.id, { repo: fixture.repo, trials: 3 }).ok, 'close before the runner change');
write(fixture.adapter, adapterSource('v2'));
writeLock(fixture.repo, { version: '2.0.0', contract: CONTRACT, adapter_sha256: sha256File(fixture.adapter) });
const changedStatus = escapeCheck(fixture, 'runner-change');
must(changedStatus.status !== 'closed', 'closure must not survive a runner change');
must(!mechanism.closeCase(fixture.state, 'case-fixture', before.id, { repo: fixture.repo, trials: 3 }).ok, 'close must be refused for the previous runner');
const rebound = recordRun(fixture, 'run-after-change');
must(rebound.runner_sha256 !== before.runner_sha256, 'a changed runner must produce a different runner_sha256');
must(mechanism.closeCase(fixture.state, 'case-fixture', rebound.id, { repo: fixture.repo, trials: 3 }).ok, 're-bound runner must close the case again');
must(statusOf(fixture).status === 'closed', 're-bound closure must be reported as closed');

// 4. version bump only: compatibility metadata is not a trust root.
fixture = makeFixture('version-bump');
const versioned = recordRun(fixture, 'run-version-bump');
writeLock(fixture.repo, { version: '1.1.0', contract: CONTRACT, adapter_sha256: sha256File(fixture.adapter) });
const versionFresh = verify.runnerFreshness(runOf(fixture, versioned.id), { repo: fixture.repo });
must(versionFresh.ok === true && versionFresh.version_drift === true, 'version drift must be reported without invalidating the verdict');
must(statusOf(fixture).status === 'verified', 'human version bump must not invalidate a verdict');

// 5. invocation contract change: the fixed contract is part of the identity.
fixture = makeFixture('contract-bump');
const contracted = recordRun(fixture, 'run-contract-bump');
writeLock(fixture.repo, { version: '1.0.0', contract: 'autoarmory/invocation-contract/v2', adapter_sha256: sha256File(fixture.adapter) });
escapeCheck(fixture, 'contract-bump');
must(verify.runnerFreshness(runOf(fixture, contracted.id), { repo: fixture.repo }).ok === false, 'contract change must invalidate the recorded runner');
must(!mechanism.closeCase(fixture.state, 'case-fixture', contracted.id, { repo: fixture.repo, trials: 3 }).ok, 'close must be refused after a contract change');

// 6. case change: the verdict describes a case record that no longer exists.
fixture = makeFixture('case-change');
const caseBound = recordRun(fixture, 'run-case-change');
must(mechanism.closeCase(fixture.state, 'case-fixture', caseBound.id, { repo: fixture.repo, trials: 3 }).ok, 'close before the case change');
const casesFile = path.join(fixture.state, 'cases.jsonl');
fs.writeFileSync(casesFile, readJsonl(casesFile).map(function (item) { return JSON.stringify(Object.assign({}, item, { expected_transition: 'COUNT->1' })); }).join(String.fromCharCode(10)) + String.fromCharCode(10), 'utf8');
const caseStatus = escapeCheck(fixture, 'case-change');
must(caseStatus.status !== 'closed', 'a rewritten case must not stay closed');
must(!mechanism.closeCase(fixture.state, 'case-fixture', caseBound.id, { repo: fixture.repo, trials: 3 }).ok, 'close must be refused after the case changed');
const caseRebound = recordRun(fixture, 'run-case-rebound');
must(mechanism.closeCase(fixture.state, 'case-fixture', caseRebound.id, { repo: fixture.repo, trials: 3 }).ok, 'a run bound to the current case must close again');
must(statusOf(fixture).status === 'closed', 're-bound case must be closed');

must(escapes === 0, 'stale_verdict_escape_count must be 0, got ' + escapes);
console.log('stale verdict tests passed: stale_verdict_escape_count=' + escapes + ' (baseline close, adapter tamper, runner change, version bump, contract bump, case change, re-bind close)');
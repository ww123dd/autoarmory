'use strict';

// Acceptance test for 1.2.0 (roadmap slot 0.8): capability health is a projection of the
// evidence behind it, so a capability cannot look healthier than its facts.
//
//   1. a capability backed by a closed, promoted mechanism reports healthy
//   2. when that mechanism evidence goes stale the capability is downgraded to degraded
//   3. when the mechanism is rolled back the capability is offline
//   4. a capability with no mechanism references keeps the old behaviour (additive)

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const mechanism = require('../src/lib/mechanism');
const verify = require('../src/lib/verify');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'autoarmory.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-health-evidence-'));

function must(condition, message) { if (!condition) throw new Error(message); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8'); }
function adapterSource(tag) {
  return [
    "'use strict';",
    "const fs = require('fs');",
    "const crypto = require('crypto');",
    "function canonicalize(value) { if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonicalize(value[key]); }).join(',') + '}'; return JSON.stringify(value); }",
    "function sha256(value) { return crypto.createHash('sha256').update(canonicalize(value)).digest('hex'); }",
    "const payload = JSON.parse(fs.readFileSync(0, 'utf8'));",
    "const observed = 0;",
    "const input = { verifier: payload.ref.verifier, observed: observed };",
    "const output = { observed: observed, exit_code: 0 };",
    "process.stdout.write(JSON.stringify({ ok: true, input_sha256: sha256(input), output_sha256: sha256(output), exit_code: 0, observed: observed, runner: payload.runner || null }));",
    "process.exit(0);",
    "// fixture runner: " + (tag || 'v1')
  ].join('\n');
}

const repo = path.join(work, 'repo');
const adapter = path.join(repo, 'scripts', 'verify', 'fixture.js');
write(adapter, adapterSource('v1'));
write(path.join(repo, 'verifiers.lock.json'), {
  schema_version: 'autoarmory/verifiers-lock/v1',
  verifiers: [{
    id: 'health-verifier', kind: 'fixture', version: '1.0.0', invocation_contract_version: 'autoarmory/invocation-contract/v1',
    readonly: true, adapter: 'scripts/verify/fixture.js', adapter_sha256: sha256File(adapter),
    statement: 'fixture', assertion: { path: 'observed', op: 'eq', value: 0 }, timeout_ms: 10000
  }]
});
const state = path.join(repo, '.selfforge');
fs.mkdirSync(state, { recursive: true });
function capability(id, evidenceRefs) {
  return { schema_version: 'autoarmory/capability/v1', id: id, vendor: 'fixture', kind: 'evaluator', version: '1.0.0', capabilities: ['verify-evidence'], permissions: { read: true, write: false, network: false }, cost: { unit: 'usd', estimate: 0 }, latency_ms: { p50: 100, p95: 200 }, reliability: { alpha: 9, beta: 1 }, risk: 'low', trust_level: 'trusted', conformance_level: 'ci-gated', health: 'healthy', freshness: new Date().toISOString(), evidence_refs: evidenceRefs };
}
write(path.join(state, 'capabilities.jsonl'), [capability('cap.backed', ['mech-health']), capability('cap.unbacked', [])].map(function (item) { return JSON.stringify(item); }).join('\n') + '\n');

must(mechanism.admitCase(state, { schema_version: 'autoarmory/case/v1', id: 'case-health', incident_id: 'inc-health', title: 'Health fixture', expected_transition: 'COUNT->0', failure_mode: 'masked_failure', severity: 'low', evidence: ['fixture'], reproducible: true, owner: 'user', verifier: 'health-verifier', done_criteria: 'fixture verifier re-derives the pass' }).ok, 'case admission');
must(mechanism.registerMechanism(state, { schema_version: 'autoarmory/mechanism/v1', id: 'mech-health', name: 'Health fixture', covered_failure_modes: ['masked_failure'], trigger: 't', action: 'a', verification: 'v', verifier_id: 'health-verifier', closure_criteria: 'c', owner: 'user', version: '1.0.0', scope: { project: 'health', task_type: 'fixture', environment: 'test', artifact_type: 'fixture' } }, { repo: repo }).ok, 'mechanism registration');

function recordAndClose(runId) {
  const captured = verify.captureRefs([{ id: runId + '-ref', verifier: 'health-verifier', params: {} }], { repo: repo, case_id: 'case-health', mechanism_id: 'mech-health', run_id: runId, trials: 3 });
  must(captured.status === 'captured', 'capture must succeed');
  const now = new Date().toISOString();
  const recorded = mechanism.recordMechanismRun(state, { schema_version: 'autoarmory/mechanism-run/v1', id: runId, mechanism_id: 'mech-health', case_id: 'case-health', actor: 'codex', evidence_refs: [captured.captured[0]], counterexample: { kind: 'fixture', expected: 'COUNT->0', observed: 0 }, environment_fingerprint: 'health-fixture', started_at: now, finished_at: now }, { repo: repo, trials: 3 });
  must(recorded.ok, 'record must succeed: ' + (recorded.errors || []).join('; '));
  must(mechanism.closeCase(state, 'case-health', runId, { repo: repo, trials: 3 }).ok, 'close must succeed');
}
function healthOf(id) {
  const result = spawnSync(process.execPath, [CLI, 'capability', 'health', '--state', state, '--json'], { cwd: repo, encoding: 'utf8', windowsHide: true });
  must(result.status === 0, 'health command must succeed: ' + result.stdout + result.stderr);
  return JSON.parse(result.stdout).capabilities.filter(function (row) { return row.id === id; })[0];
}

recordAndClose('run-health-1');
must(mechanism.promote(state, 'mech-health', { repo: repo, actor: 'codex' }).ok, 'promotion must succeed');
let row = healthOf('cap.backed');
must(row.status === 'healthy' && /evidence ok/.test(row.reason), 'a backed capability with a live verdict must be healthy: ' + JSON.stringify(row));
must(healthOf('cap.unbacked').status === 'healthy', 'a capability without mechanism references keeps the old behaviour');

// 2. stale evidence downgrades the capability
write(adapter, adapterSource('v2'));
const lock = JSON.parse(fs.readFileSync(path.join(repo, 'verifiers.lock.json'), 'utf8'));
lock.verifiers[0].adapter_sha256 = sha256File(adapter);
write(path.join(repo, 'verifiers.lock.json'), lock);
row = healthOf('cap.backed');
must(row.status === 'degraded' && /evidence stale: mech-health/.test(row.reason), 'stale mechanism evidence must degrade the capability: ' + JSON.stringify(row));

// 3. a rolled-back mechanism makes the capability offline
const rolled = mechanism.rollbackIfStale(state, 'mech-health', { repo: repo, actor: 'codex' });
must(rolled.ok && rolled.action === 'rolled_back', 'rollback must succeed: ' + JSON.stringify(rolled));
row = healthOf('cap.backed');
must(row.status === 'offline' && /evidence retired: mech-health/.test(row.reason), 'retired evidence must take the capability offline: ' + JSON.stringify(row));

console.log('capability evidence health tests passed: promoted=healthy, stale=degraded, retired=offline, unbacked=unchanged');
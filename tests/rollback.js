'use strict';

// Acceptance test for the 0.5 lifecycle loop: canary/promotion records and rollback.
//
// Shape required of every item: a PASS path, a FAIL path, and a recovery path, all on
// real re-derivation - no mocks.
//
//   1. promote requires an evidence-backed verdict (stale verdict -> refused)
//   2. a healthy promoted mechanism is not rolled back (no rollback without a forcing fact)
//   3. a promoted mechanism whose evidence goes stale blocks preflight
//      (stale_lifecycle_escape_count = 1) instead of silently staying promoted
//   4. rollback records the evidence that forced it, and is idempotent
//   5. after rollback the escape count is 0 and preflight passes again
//   6. re-binding the runner and re-verifying allows promotion again

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const mechanism = require('../src/lib/mechanism');
const verify = require('../src/lib/verify');

const ROOT = path.resolve(__dirname, '..');
const PREFLIGHT = path.join(ROOT, 'scripts', 'mechanism-preflight.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-rollback-'));
let escapesSeen = 0;

function must(condition, message) { if (!condition) throw new Error(message); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8'); }
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
    "const input = { verifier: payload.ref.verifier, observed: observed };",
    "const output = { observed: observed, exit_code: 0 };",
    "process.stdout.write(JSON.stringify({ ok: true, input_sha256: sha256(input), output_sha256: sha256(output), exit_code: 0, observed: observed, runner: payload.runner || null }));",
    "process.exit(0);",
    "// fixture runner: " + (tag || 'v1')
  ].join('\n');
}
function makeFixture(name) {
  const repo = path.join(work, name);
  const adapter = path.join(repo, 'scripts', 'verify', 'fixture.js');
  write(adapter, adapterSource(name));
  const lock = {
    schema_version: 'autoarmory/verifiers-lock/v1',
    verifiers: [{
      id: 'rollback-verifier', kind: 'fixture', version: '1.0.0', invocation_contract_version: 'autoarmory/invocation-contract/v1',
      readonly: true, adapter: 'scripts/verify/fixture.js', adapter_sha256: sha256File(adapter),
      statement: 'fixture statement', assertion: { path: 'observed', op: 'eq', value: 0 }, timeout_ms: 10000
    }]
  };
  write(path.join(repo, 'verifiers.lock.json'), lock);
  const state = path.join(repo, '.selfforge');
  fs.mkdirSync(state, { recursive: true });
  must(mechanism.admitCase(state, {
    schema_version: 'autoarmory/case/v1', id: 'case-rollback', incident_id: 'inc-rollback', title: 'Rollback fixture',
    expected_transition: 'COUNT->0', failure_mode: 'masked_failure', severity: 'high', evidence: ['fixture'], reproducible: true, owner: 'user'
  }).ok, 'case admission');
  must(mechanism.registerMechanism(state, {
    schema_version: 'autoarmory/mechanism/v1', id: 'mech-rollback', name: 'Rollback fixture', covered_failure_modes: ['masked_failure'],
    trigger: 'fixture trigger', action: 'fixture action', verification: 'pinned fixture runner', verifier_id: 'rollback-verifier',
    closure_criteria: 'evidence stays fresh', owner: 'user', version: '1.0.0'
  }, { repo: repo }).ok, 'mechanism registration');
  return { repo: repo, state: state, adapter: adapter, lockFile: path.join(repo, 'verifiers.lock.json') };
}
function recordAndClose(fixture, runId) {
  const captured = verify.captureRefs([{ id: runId + '-ref', verifier: 'rollback-verifier', params: {} }], { repo: fixture.repo, case_id: 'case-rollback', mechanism_id: 'mech-rollback', run_id: runId, trials: 3 });
  must(captured.status === 'captured', runId + ': capture failed: ' + JSON.stringify(captured.refs));
  const now = new Date().toISOString();
  const recorded = mechanism.recordMechanismRun(fixture.state, {
    schema_version: 'autoarmory/mechanism-run/v1', id: runId, mechanism_id: 'mech-rollback', case_id: 'case-rollback', actor: 'codex',
    evidence_refs: [captured.captured[0]], counterexample: { kind: 'fixture', expected: 'COUNT->0', observed: 0 },
    environment_fingerprint: 'rollback-fixture', started_at: now, finished_at: now
  }, { repo: fixture.repo, trials: 3 });
  must(recorded.ok, runId + ': record failed: ' + (recorded.errors || []).join('; '));
  const closed = mechanism.closeCase(fixture.state, 'case-rollback', runId, { repo: fixture.repo, trials: 3 });
  must(closed.ok, runId + ': close failed: ' + (closed.errors || []).join('; '));
  return recorded.run;
}
function preflight(fixture) {
  const result = spawnSync(process.execPath, [PREFLIGHT], { cwd: fixture.repo, encoding: 'utf8', env: Object.assign({}, process.env, { AUTOARMORY_STATE: fixture.state }), windowsHide: true });
  return { code: result.status, out: String(result.stdout || ''), err: String(result.stderr || '') };
}
function breakRunner(fixture) {
  write(fixture.adapter, adapterSource('v2'));
  const lock = JSON.parse(fs.readFileSync(fixture.lockFile, 'utf8'));
  lock.verifiers[0].adapter_sha256 = sha256File(fixture.adapter);
  write(fixture.lockFile, lock);
}
function repairRunner(fixture) {
  write(fixture.adapter, adapterSource('v1'));
  const lock = JSON.parse(fs.readFileSync(fixture.lockFile, 'utf8'));
  lock.verifiers[0].adapter_sha256 = sha256File(fixture.adapter);
  write(fixture.lockFile, lock);
}

const fixture = makeFixture('lifecycle');
const healthyRun = recordAndClose(fixture, 'run-healthy');
must(mechanism.status(fixture.state, 'mech-rollback', { repo: fixture.repo }).status === 'closed', 'a freshly closed run must report closed');

// 1. promotion is evidence-backed
const promoted = mechanism.promote(fixture.state, 'mech-rollback', { repo: fixture.repo, actor: 'codex' });
must(promoted.ok && promoted.lifecycle.to === 'promoted', 'an evidence-backed verdict must be promotable: ' + JSON.stringify(promoted.errors || promoted));
must(promoted.lifecycle.verdict === 'closed', 'the promotion must record the verdict it rested on');
must(Array.isArray(promoted.lifecycle.evidence_refs) && promoted.lifecycle.evidence_refs[0].run_id === healthyRun.id, 'the promotion must name the run it rested on');
must(mechanism.lifecycle(fixture.state, 'mech-rollback').to === 'promoted', 'lifecycle must report promoted');

// 2. no rollback without a forcing fact
const noop = mechanism.rollbackIfStale(fixture.state, 'mech-rollback', { repo: fixture.repo, actor: 'codex' });
must(noop.ok && noop.action === 'none' && mechanism.lifecycle(fixture.state, 'mech-rollback').to === 'promoted', 'a healthy promoted mechanism must not be rolled back');
must(readJsonl(path.join(fixture.state, 'lifecycle.jsonl')).filter(function (row) { return row.to === 'retired'; }).length === 0, 'no rollback record may exist yet');

// 3. a promoted mechanism whose evidence goes stale blocks preflight
breakRunner(fixture);
const staleStatus = mechanism.status(fixture.state, 'mech-rollback', { repo: fixture.repo });
must(staleStatus.status !== 'verified' && staleStatus.status !== 'closed', 'a changed runner must stale the verdict, got ' + staleStatus.status);
const blocked = preflight(fixture);
must(blocked.code === 2 && /stale_lifecycle_escape_count=1/.test(blocked.err), 'preflight must count a promoted-with-stale-evidence escape: ' + blocked.err);
escapesSeen += 1;
must(/mechanism-lifecycle/.test(blocked.err), 'preflight must name the tool that closes the loop: ' + blocked.err);

// 4. rollback records the forcing evidence, and is idempotent
const rolled = mechanism.rollbackIfStale(fixture.state, 'mech-rollback', { repo: fixture.repo, actor: 'codex' });
must(rolled.ok && rolled.action === 'rolled_back' && rolled.lifecycle.to === 'retired', 'a stale promoted mechanism must be rolled back: ' + JSON.stringify(rolled));
must(rolled.lifecycle.forced_by && rolled.lifecycle.forced_by.status === staleStatus.status, 'the rollback must record the status that forced it');
must(rolled.lifecycle.forced_by.reason && rolled.lifecycle.forced_by.reason.length > 0, 'the rollback must record why it was forced');
must(rolled.lifecycle.forced_by.runner_sha256 === staleStatus.runner_sha256, 'the rollback must record the runner it was resting on');
const again = mechanism.rollbackIfStale(fixture.state, 'mech-rollback', { repo: fixture.repo, actor: 'codex' });
must(again.ok && again.action === 'none', 'rollback must be idempotent');
must(readJsonl(path.join(fixture.state, 'lifecycle.jsonl')).filter(function (row) { return row.to === 'retired'; }).length === 1, 'exactly one rollback record');

// 5. the escape count is zero and preflight passes once the loop is closed
must(mechanism.staleLifecycleEscapes(fixture.state, { repo: fixture.repo }) === 0, 'a handled rollback must leave no stale lifecycle escape');
const afterRollback = preflight(fixture);
must(afterRollback.code === 0 && /stale_lifecycle_escape_count=0/.test(afterRollback.out), 'preflight must pass after the rollback: ' + afterRollback.out + afterRollback.err);

// 6. recovery: re-bind the runner, re-verify, promote again
repairRunner(fixture);
const recovered = recordAndClose(fixture, 'run-recovered');
const rePromoted = mechanism.promote(fixture.state, 'mech-rollback', { repo: fixture.repo, actor: 'codex' });
must(rePromoted.ok && rePromoted.lifecycle.to === 'promoted' && rePromoted.lifecycle.evidence_refs[0].run_id === recovered.id, 'recovery must allow promotion again on fresh evidence');
must(mechanism.lifecycle(fixture.state, 'mech-rollback').to === 'promoted', 'lifecycle must be promoted after recovery');
const finalPreflight = preflight(fixture);
must(finalPreflight.code === 0, 'preflight must pass after recovery: ' + finalPreflight.out + finalPreflight.err);

// 7. promotion refuses a stale verdict outright
breakRunner(fixture);
const refused = mechanism.promote(fixture.state, 'mech-rollback', { repo: fixture.repo, actor: 'codex' });
must(!refused.ok && /cannot promote/.test(refused.errors.join(' ')), 'promotion of a stale verdict must be refused: ' + JSON.stringify(refused));

console.log('rollback tests passed: promote=evidence-backed, healthy=no-rollback, stale-promoted=BLOCK(stale_lifecycle_escape_count=1), rollback=recorded+idempotent, after-rollback=0+pass, recovery=re-promoted, stale-promotion=refused');
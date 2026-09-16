'use strict';

// Operator-loop acceptance: how many steps still need a human?
//
// One chain is driven end to end - propose, request approval, approve, gate, declare,
// record, close, preflight - and the only step that may consume operator input is the
// approval decision itself. Everything else must be produced by a tool, and an
// approval without the operator own words must be refused.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'autoarmory.js');
const APPROVE = path.join(ROOT, 'scripts', 'approve.js');
const DECLARE = path.join(ROOT, 'scripts', 'mechanism-declare.js');
const RECORD = path.join(ROOT, 'scripts', 'mechanism-record.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-operator-loop-'));
const state = path.join(work, '.selfforge');
fs.mkdirSync(state, { recursive: true });

function must(condition, message) { if (!condition) throw new Error(message); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8'); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function run(script, args, cwd, env) {
  const result = spawnSync(process.execPath, [script].concat(args), { cwd: cwd || ROOT, encoding: 'utf8', env: Object.assign({}, process.env, env || {}), windowsHide: true });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
const steps = [];

// fixture verifier repo (the mechanism has to name a registered one)
const repo = path.join(work, 'repo');
const adapter = path.join(repo, 'scripts', 'verify', 'fixture.js');
write(adapter, [
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
  "process.exit(0);"
].join('\n'));
write(path.join(repo, 'verifiers.lock.json'), {
  schema_version: 'autoarmory/verifiers-lock/v1',
  verifiers: [{
    id: 'operator-loop-verifier', kind: 'fixture', version: '1.0.0', invocation_contract_version: 'autoarmory/invocation-contract/v1',
    readonly: true, adapter: 'scripts/verify/fixture.js', adapter_sha256: sha256File(adapter),
    statement: 'fixture statement', assertion: { path: 'observed', op: 'eq', value: 0 }, timeout_ms: 10000
  }]
});

// 1. propose (fixture stands in for observe/propose, both mechanical)
const candidateId = 'cand-operator-loop';
const candidate = {
  schema_version: 'selfforge/candidate/v1', id: candidateId, incident_id: 'inc-operator-loop', action: 'fix_reference',
  target: { kind: 'deterministic', id: 'operator-loop' }, expected_transition: 'COUNT->0',
  prediction: { fix: ['operator_steps'], regress_risk: ['verification'] }, evidence: ['operator loop'], risk: 'low', status: 'candidate',
  change: { skill: 'operator-loop', reason: 'Drive the whole chain without hand-written artifacts.', decision: 'Prove one operator decision is enough.', production_change: false, budget: { repeat: 3, max_runs: 9 } }
};
const candidateFile = path.join(work, 'candidate.json');
write(candidateFile, candidate);
write(path.join(state, 'candidates.jsonl'), JSON.stringify(candidate) + '\n');
const gateFile = path.join(work, 'gate.json');
write(gateFile, {
  schema_version: 'selfforge/gate/v1', ok: true, candidate_id: candidateId,
  skillcanary: { schema_version: 'selfforge/skillcanary-gate/v1', ok: true, command: 'gate', version: '0.9.0', exit_code: 0, change_sha256: 'c'.repeat(64) }
});
steps.push('propose');

// 2. request approval (mechanical)
let result = run(CLI, ['transition', candidateFile, '--to', 'pending_approval', '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).to === 'pending_approval', 'pending_approval must be mechanical: ' + result.out + result.err);
steps.push('request-approval');

// 3. the one operator decision: an approval without the operator words must be refused
result = run(APPROVE, ['--candidate', candidateId, '--state', state, '--json']);
must(result.code !== 0 && /own words/.test(result.out + result.err), 'an unattributed approval must be refused');
const dryOut = path.join(work, 'dry-approval.json');
result = run(APPROVE, ['--candidate', candidateId, '--quote', 'go ahead, approve this candidate', '--state', state, '--out', dryOut, '--dry-run', '--json']);
must(result.code === 0 && JSON.parse(result.out).dry_run === true, 'dry run must print the approval request');
must(!fs.existsSync(dryOut), 'a dry run must not write an approval');
const approvalFile = path.join(work, 'approval.json');
result = run(APPROVE, ['--candidate', candidateId, '--quote', 'go ahead, approve this candidate', '--state', state, '--out', approvalFile, '--json']);
must(result.code === 0 && fs.existsSync(approvalFile), 'approval must be recorded mechanically: ' + result.out + result.err);
const approval = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
must(approval.approved_by === 'user' && approval.requested_by === 'agent' && approval.scope === 'gated', 'the approval must attribute the operator and the agent separately');
must(approval.evidence && approval.evidence.quote === 'go ahead, approve this candidate', 'the approval must carry the operator words it was recorded from');
steps.push('approve (operator decision)');

// 4. gate transition (mechanical)
result = run(CLI, ['transition', candidateFile, '--to', 'gated', '--gate', gateFile, '--approval', approvalFile, '--state', state, '--json']);
must(result.code === 0, 'gated transition must be mechanical once the approval exists: ' + result.out + result.err);
const gated = JSON.parse(result.out);
must(gated.actor === 'user' && gated.consumption && gated.consumption.consumer.id === 'user', 'the transition must record the operator as actor and consumer');
steps.push('gate');

// 5. declare the mechanism (mechanical)
const descriptor = path.join(work, 'descriptor.json');
write(descriptor, {
  case: {
    schema_version: 'autoarmory/case/v1', id: 'case-operator-loop', incident_id: 'inc-operator-loop', title: 'Operator loop fixture',
    expected_transition: 'COUNT->0', failure_mode: 'masked_failure', severity: 'low', evidence: ['fixture'], reproducible: true, owner: 'user'
  },
  mechanism: {
    schema_version: 'autoarmory/mechanism/v1', id: 'mech-operator-loop', name: 'Operator loop fixture',
    covered_failure_modes: ['masked_failure'], trigger: 'fixture trigger', action: 'fixture action', verification: 'registered fixture verifier',
    verifier_id: 'operator-loop-verifier', closure_criteria: 'fresh pass closes the case', owner: 'user', version: '1.0.0'
  }
});
const unknownDescriptor = path.join(work, 'descriptor-unknown.json');
write(unknownDescriptor, Object.assign({}, JSON.parse(fs.readFileSync(descriptor, 'utf8')), { mechanism: Object.assign({}, JSON.parse(fs.readFileSync(descriptor, 'utf8')).mechanism, { verifier_id: 'not-registered', id: 'mech-operator-loop-unknown' }) }));
result = run(DECLARE, ['--descriptor', unknownDescriptor, '--state', state, '--repo', repo, '--json']);
must(result.code !== 0 && /not registered/.test(result.out + result.err), 'declaring a mechanism on an unregistered verifier must be refused');
result = run(DECLARE, ['--descriptor', descriptor, '--state', state, '--repo', repo, '--json']);
must(result.code === 0, 'declaration must be mechanical: ' + result.out + result.err);
steps.push('declare');

// 6. record the run and close the case (mechanical)
result = run(RECORD, ['--mechanism', 'mech-operator-loop', '--case', 'case-operator-loop', '--state', state, '--repo', repo, '--close', '--json']);
must(result.code === 0, 'recording the run must be mechanical: ' + result.out + result.err);
const recorded = JSON.parse(result.out);
must(recorded.closure && recorded.status.status === 'closed', 'the recorded run must close the case');
steps.push('record+close');

// 7. preflight (mechanical)
result = run(path.join(ROOT, 'scripts', 'mechanism-preflight.js'), [], repo, { AUTOARMORY_STATE: state });
must(result.code === 0 && /stale_verdict_escape_count=0/.test(result.out), 'preflight must pass mechanically: ' + result.out + result.err);
steps.push('preflight');

const operatorSteps = steps.filter(function (step) { return step.indexOf('operator decision') !== -1; });
console.log('operator loop tests passed: steps=' + steps.length + ' mechanical=' + (steps.length - operatorSteps.length) + ' operator-decisions=' + operatorSteps.length
  + ' (' + steps.join(' -> ') + '); unattributed approvals refused, unregistered verifiers refused');
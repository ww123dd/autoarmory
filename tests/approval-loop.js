'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-approval-loop-'));
const state = path.join(temp, '.selfforge');
const workspace = path.join(temp, 'workspace');
fs.mkdirSync(state, { recursive: true });
fs.mkdirSync(workspace, { recursive: true });
const target = path.join(workspace, 'target.txt');
fs.writeFileSync(target, 'old\n', 'utf8');

function must(condition, message) {
  if (!condition) { console.error('FAIL: ' + message); process.exit(1); }
}
function run(args) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function writeJson(name, value) {
  const file = path.join(temp, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

const candidateId = 'cand-approval-loop';
const gateProof = {
  schema_version: 'selfforge/gate/v1',
  ok: true,
  candidate_id: candidateId,
  skillcanary: {
    schema_version: 'selfforge/skillcanary-gate/v1',
    ok: true,
    command: 'gate',
    version: '0.9.0',
    exit_code: 0,
    change_sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
  }
};
const candidate = {
  schema_version: 'selfforge/candidate/v1',
  id: candidateId,
  incident_id: 'inc-approval-loop',
  action: 'replace_file',
  target: { kind: 'deterministic', id: 'approval-loop-target' },
  expected_transition: 'COUNT->0',
  prediction: { fix: ['user_mechanical_steps'], regress_risk: ['verification'] },
  evidence: ['The user requested approval-only operations and no manual execution.'],
  risk: 'low',
  status: 'candidate',
  change: {
    skill: 'local-operator-workflow',
    reason: 'The operator should approve once while the Agent performs and verifies the mechanical work.',
    decision: 'Require approval before execution and verify the result after execution.',
    production_change: true,
    budget: { repeat: 3, max_runs: 9 }
  }
};
const candidateFile = writeJson('candidate.json', candidate);
const gateFile = writeJson('gate.json', gateProof);
fs.writeFileSync(path.join(state, 'candidates.jsonl'), JSON.stringify(candidate) + '\n', 'utf8');

let result = run(['transition', candidateFile, '--to', 'pending_approval', '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).to === 'pending_approval', 'candidate must enter pending_approval');

const before = fs.readFileSync(target, 'utf8');
must(before === 'old\n', 'agent action must not execute before approval');

result = run(['transition', candidateFile, '--to', 'gated', '--gate', gateFile, '--state', state, '--json']);
must(result.code === 1 && /approval/i.test(result.out + result.err), 'gated transition must require approval');

const approvalFile = writeJson('approval.json', {
  schema_version: 'selfforge/approval/v1',
  id: 'appr-approval-loop',
  candidate_id: candidateId,
  requested_by: 'agent',
  approved_by: 'user',
  approved_at: '2026-09-16T00:00:00.000Z',
  channel: 'conversation',
  scope: 'gated',
  status: 'approved'
});
result = run(['transition', candidateFile, '--to', 'gated', '--gate', gateFile, '--approval', approvalFile, '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).to === 'gated', 'approved candidate must become gated');

// The Agent executes only after approval. This is the mechanical work the user must not perform.
fs.writeFileSync(target, 'new\n', 'utf8');

const verify = spawnSync(process.execPath, ['-e', "const fs=require('fs'); if(fs.readFileSync(process.argv[1],'utf8').trim()!=='new') process.exit(2)", target], { encoding: 'utf8' });
must(verify.status === 0, 'external verification must pass after Agent execution');

const outcomeEvidenceFile = writeJson('outcome-evidence.json', {
  kind: 'deterministic',
  before: { user_mechanical_steps: 2, approval_required: 1 },
  after: { user_mechanical_steps: 0, approval_required: 1 },
  artifacts: [{ uri: target, sha256: null }]
});
result = run(['record', '--candidate', candidateId, '--action', candidate.action, '--reward', '1', '--verified', 'true', '--gate', gateFile, '--evidence', outcomeEvidenceFile, '--dir', workspace, '--state', state, '--json']);
must(result.code === 0, 'approval loop outcome must be recorded: ' + result.out + result.err);

const transitions = fs.readFileSync(path.join(state, 'transitions.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
must(transitions.length === 2 && transitions[0].to === 'pending_approval' && transitions[1].to === 'gated', 'approval loop transitions must be replayable');
must(fs.existsSync(path.join(state, 'decisions.jsonl')), 'approval loop must leave an outcome record');

console.log('Approval loop tests passed: approval-only, agent-executed, verified');
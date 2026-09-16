'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-execution-'));
const state = path.join(temp, '.selfforge');
fs.mkdirSync(state, { recursive: true });

function must(condition, message) {
  if (!condition) { console.error('FAIL: ' + message); process.exit(1); }
}
function writeJson(name, value) {
  const file = path.join(temp, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}
function run(args) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function decision(overrides) {
  return Object.assign({
    schema_version: 'autoarmory/routing-decision/v1',
    request_id: 'route-1',
    task_id: 'task-1',
    selected: [{ id: 'skill.alpha' }],
    rejected: [],
    fallback_chain: [],
    reason: 'fixture route',
    policy_version: 'autoarmory/policy/v1',
    seed: 1,
    evidence_refs: [],
    candidate_set: ['skill.alpha'],
    top_k: [{ id: 'skill.alpha' }],
    selection_margin: null,
    selection_confidence: null,
    confidence_method: 'uncalibrated'
  }, overrides || {});
}
function trace(overrides) {
  return Object.assign({
    schema_version: 'autoarmory/execution-trace/v1',
    id: 'exec-1',
    decision_id: 'route-1',
    task_id: 'task-1',
    skill_id: 'skill.alpha',
    plan: { steps: ['read', 'verify'] },
    steps_expected: [
      { id: 'read', description: 'Read required input', required: true },
      { id: 'verify', description: 'Run external verifier', required: true }
    ],
    steps_observed: [
      { id: 'obs-1', expected_step_id: 'read', status: 'completed' },
      { id: 'obs-2', expected_step_id: 'verify', status: 'completed' }
    ],
    order_ok: true,
    stop_conditions_ok: true,
    environment_fingerprint: 'env-1',
    isolation: {
      independent_process: true,
      temp_workspace: true,
      namespace: 'exec-1',
      dependency_versions: { node: process.version },
      evidence_refs: ['ref-process']
    },
    artifact_refs: [],
    started_at: '2026-09-16T00:00:00.000Z',
    finished_at: '2026-09-16T00:00:01.000Z'
  }, overrides || {});
}

fs.writeFileSync(path.join(state, 'routing-decisions.jsonl'), JSON.stringify(decision()) + '\n', 'utf8');

let result = run(['execution', 'record', writeJson('exec-1.json', trace()), '--state', state, '--json']);
must(result.code === 0, 'valid execution trace must record: ' + result.out + result.err);
const recorded = JSON.parse(result.out);
must(recorded.ok === true && recorded.trace.status === 'conformant', 'valid trace must be conformant');
must(/^[a-f0-9]{64}$/.test(recorded.trace.plan_sha256), 'trace must derive plan_sha256');

const wrongDecision = trace({ id: 'exec-missing', decision_id: 'route-missing' });
result = run(['execution', 'record', writeJson('exec-missing.json', wrongDecision), '--state', state, '--json']);
must(result.code === 1 && /routing decision not found/i.test(result.out + result.err), 'unknown decision must be rejected');

const wrongSkill = trace({ id: 'exec-skill', skill_id: 'skill.beta' });
result = run(['execution', 'record', writeJson('exec-skill.json', wrongSkill), '--state', state, '--json']);
must(result.code === 1 && /skill_id.*selected/i.test(result.out + result.err), 'mismatched skill must be rejected');

const weakIsolation = trace({ id: 'exec-weak', isolation: { independent_process: false, temp_workspace: true, namespace: 'exec-weak', dependency_versions: {}, evidence_refs: [] } });
const unlinked = trace({ id: 'exec-unlinked', decision_id: undefined, task_id: 'task-direct', skill_id: 'skill.direct' });
result = run(['execution', 'record', writeJson('exec-unlinked.json', unlinked), '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).trace.selection_status === 'unlinked', 'execution without routing decision must be recorded as unlinked');
result = run(['execution', 'record', writeJson('exec-weak.json', weakIsolation), '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).trace.status === 'nonconformant', 'weak isolation must be recorded as nonconformant');

result = run(['execution', 'list', '--state', state, '--json']);
must(result.code === 0, 'execution list must succeed');
const listed = JSON.parse(result.out);
must(listed.length === 3 && listed.some(function (item) { return item.id === 'exec-1' && item.status === 'conformant'; }) && listed.some(function (item) { return item.id === 'exec-weak' && item.status === 'nonconformant'; }) && listed.some(function (item) { return item.id === 'exec-unlinked' && item.selection_status === 'unlinked'; }), 'execution list must return recorded traces');

const frictionManual = writeJson('friction-manual.json', {
  schema_version: 'autoarmory/friction/v1',
  id: 'friction-manual-ops',
  signal: '不要让我做操作，我只需要审批。',
  intent: 'manual_operation_fatigue',
  target: 'agent_handoff',
  reversible: true,
  blast_radius: 'local',
  high_risk: false
});
result = run(['execution', 'friction', 'record', frictionManual, '--state', state, '--json']);
must(result.code === 0, 'friction manual-operation event must record: ' + result.out + result.err);
let friction = JSON.parse(result.out).event;
must(friction.decision === 'auto_execute' && friction.approval_required === true && friction.user_actions_required === 1 && friction.manual_steps.length === 0, 'manual-operation fatigue must be executed by agent with approval only');

const frictionVague = writeJson('friction-vague.json', {
  schema_version: 'autoarmory/friction/v1',
  id: 'friction-vague',
  signal: '这个好烦。',
  intent: 'unknown',
  target: null,
  reversible: true,
  blast_radius: 'local',
  high_risk: false
});
result = run(['execution', 'friction', 'record', frictionVague, '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).event.decision === 'record_only', 'vague one-off frustration must only be recorded');

const frictionIrreversible = writeJson('friction-irreversible.json', {
  schema_version: 'autoarmory/friction/v1',
  id: 'friction-irreversible',
  signal: '别问了，直接发布。',
  intent: 'approval_fatigue',
  target: 'external_release',
  reversible: false,
  blast_radius: 'external',
  high_risk: true
});
result = run(['execution', 'friction', 'record', frictionIrreversible, '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).event.decision === 'approval_required', 'irreversible friction must require approval');

result = run(['execution', 'friction', 'list', '--state', state, '--json']);
must(result.code === 0 && JSON.parse(result.out).length === 3, 'friction list must return recorded events');
console.log('Execution trace tests passed');
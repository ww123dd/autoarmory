'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const boundary = require('../src/lib/boundary-policy');
const failureModes = require('../src/lib/failure-modes');
function must(condition, message) { if (!condition) throw new Error(message); }

const policy = boundary.loadPolicy();
const check = boundary.validatePolicy(policy);
must(check.ok && check.missing_stop_condition_count === 0, 'boundary policy must declare stop conditions for every task class');
must(failureModes.countUnlabeledRules(failureModes.MODES) === 0, 'every failure-mode rule must carry one of the four declared categories');
must(boundary.classifyAction(policy, 'replace_file').tier === 'local_write', 'replace_file must be a local write');
must(boundary.classifyAction(policy, 'delete_table').tier === 'irreversible_write', 'delete_* must be irreversible');
must(boundary.classifyAction(policy, 'publish_release').tier === 'external_side_effect', 'publish* must be an external side effect');
must(boundary.classifyAction(policy, 'unknown_action').conflict === true, 'an unclassified action must be a conflict');

const candidates = [{ id: 'c1', action: 'replace_file' }];
const unauthorized = boundary.auditTransitions(candidates, [{ candidate_id: 'c1', to: 'gated', action: 'replace_file' }], policy);
must(unauthorized.authorized_action_without_approval_count === 1 && unauthorized.action_classification_conflict_count === 0, 'a write without approval must be counted');
const approved = boundary.auditTransitions(candidates, [
  { candidate_id: 'c1', to: 'gated', action: 'replace_file', approval: { status: 'approved' } },
  { candidate_id: 'c1', to: 'shadow', action: 'replace_file' }
], policy);
must(approved.ok && approved.authorized_action_without_approval_count === 0, 'an approval must authorize the later action transitions');
const conflict = boundary.auditTransitions([{ id: 'c2', action: 'replace_file', action_tier: 'read_only' }], [{ candidate_id: 'c2', to: 'gated', action: 'replace_file', approval: { status: 'approved' } }], policy);
must(conflict.action_classification_conflict_count === 1, 'an explicit tier that contradicts policy must be a conflict');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-boundary-'));
const candidateFile = path.join(temp, 'candidates.jsonl');
const transitionFile = path.join(temp, 'transitions.jsonl');
fs.writeFileSync(candidateFile, candidates.map(function (item) { return JSON.stringify(item); }).join('\n') + '\n', 'utf8');
fs.writeFileSync(transitionFile, [
  { candidate_id: 'c1', to: 'gated', action: 'replace_file', approval: { status: 'approved' }, at: '2026-09-17T00:00:00.000Z' }
].map(function (item) { return JSON.stringify(item); }).join('\n') + '\n', 'utf8');
const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'boundary-audit.js'), '--candidates', candidateFile, '--transitions', transitionFile, '--enforce', '--json'], { encoding: 'utf8' });
must(result.status === 0 && /boundary_policy_escape_count/.test(result.stdout), 'boundary audit CLI must enforce zero escapes: ' + result.stdout + result.stderr);
console.log('boundary policy tests passed: stop conditions, action tiers, approval audit, explicit-tier conflict, unlabeled-rule count, fail-closed unknown action');
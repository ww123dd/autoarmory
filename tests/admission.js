'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-admission-'));
const input = path.join(temp, 'candidates.jsonl');
const output = path.join(temp, 'admission.jsonl');

function candidate(overrides) {
  return Object.assign({
    schema_version: 'selfforge/candidate/v1',
    id: 'cand-test',
    incident_id: 'inc-test',
    failure_mode: 'counterexample_replay_missing',
    action: 'add_counterexample_replay',
    evidence: ['13 条 rule_based 判据缺反例回放'],
    owner_scope: 'vibe-coding',
    skill_id: 'vibe-coding',
    owner_confirmation: { status: 'approved', batch_id: 'test-batch' },
    status: 'candidate',
    gate: { ok: true, skillcanary: { ok: true, command: 'gate', exit_code: 0, change_sha256: 'a'.repeat(64) } }
  }, overrides || {});
}
const rows = [
  candidate({ id: 'cand-admit' }),
  candidate({ id: 'cand-nogate', gate: null }),
  candidate({ id: 'cand-duplicate' }),
  candidate({ id: 'cand-observed', action: 'add_evidence', failure_mode: 'missing_validation' }),
  candidate({ id: 'cand-owner-unconfirmed', change: { skill: 'vibe-coding' }, owner_scope: undefined, skill_id: undefined, owner_confirmation: undefined }),
  candidate({ id: 'cand-owner-unknown', owner_scope: undefined, skill_id: undefined, owner_confirmation: undefined })
];
fs.writeFileSync(input, rows.map(function (row) { return JSON.stringify(row); }).join('\n') + '\n', 'utf8');

const result = spawnSync(process.execPath, [cli, 'admit', input, '--output', output, '--json'], { cwd: root, encoding: 'utf8' });
if (result.status !== 0) { console.error(result.stderr || result.stdout); process.exit(1); }
const decisions = fs.readFileSync(output, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
function status(id) { return decisions.find(function (item) { return item.candidate_id === id; }).status; }
if (status('cand-admit') !== 'admitted') { console.error('FAIL: admitted status'); process.exit(1); }
if (status('cand-nogate') !== 'candidate') { console.error('FAIL: gate-required status'); process.exit(1); }
if (status('cand-duplicate') !== 'duplicate') { console.error('FAIL: duplicate status'); process.exit(1); }
if (status('cand-observed') !== 'observed') { console.error('FAIL: observed status'); process.exit(1); }
if (status('cand-owner-unconfirmed') !== 'holding') { console.error('FAIL: unconfirmed owner must hold'); process.exit(1); }
if (status('cand-owner-unknown') !== 'holding') { console.error('FAIL: unknown owner must hold'); process.exit(1); }
const unconfirmed = decisions.find(function (item) { return item.candidate_id === 'cand-owner-unconfirmed'; });
if (unconfirmed.reason_code !== 'owner_confirmation_required') { console.error('FAIL: unconfirmed owner reason code'); process.exit(1); }
const unknown = decisions.find(function (item) { return item.candidate_id === 'cand-owner-unknown'; });
if (unknown.reason_code !== 'owner_inheritance_unknown') { console.error('FAIL: unknown owner reason code'); process.exit(1); }
console.log('Admission gate tests passed');
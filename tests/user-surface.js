'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-user-surface-'));
const state = path.join(temp, '.selfforge');
const artifactPath = path.join(temp, 'best_skill.md');
fs.writeFileSync(artifactPath, '# Best Skill\n', 'utf8');

function must(condition, message) { if (!condition) throw new Error(message); }
function run(args) { const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' }); return { code: result.status, out: result.stdout || '', err: result.stderr || '' }; }
function json(result) { must(result.code === 0, 'command failed: ' + result.out + result.err); return JSON.parse(result.out); }
function write(name, value) { const file = path.join(temp, name); fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); return file; }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function cardKeys(card) { return Object.keys(card).filter(function (key) { return ['schema_version', 'id', 'action'].indexOf(key) === -1; }).sort(); }

const descriptor = write('artifact.json', { schema_version: 'autoarmory/artifact-intake/v1', artifact_id: 'best_skill.md', source: 'skillopt', path: 'best_skill.md', verifier_hint: 'external-eval' });
let result = json(run(['intake', 'artifact', descriptor, '--state', state, '--repo', temp, '--json']));
must(result.ok && result.artifact.sha256 === sha(artifactPath) && result.artifact.revision === 1, 'artifact intake must hash the bytes and record revision 1');
result = json(run(['intake', 'artifact', descriptor, '--state', state, '--repo', temp, '--json']));
must(result.ok && result.duplicate === true, 'the same artifact bytes must be idempotent');
const rowsAfterDuplicate = fs.readFileSync(path.join(state, 'artifacts.jsonl'), 'utf8').trim().split('\n').length;
must(rowsAfterDuplicate === 1, 'a duplicate intake must not append a second row');
const firstSha = sha(artifactPath);
fs.appendFileSync(artifactPath, 'changed\n');
result = json(run(['intake', 'artifact', descriptor, '--state', state, '--repo', temp, '--json']));
must(result.ok && result.artifact.revision === 2, 'new bytes must append a new revision');
const artifactRows = fs.readFileSync(path.join(state, 'artifacts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
must(artifactRows[1].previous_sha256 === firstSha, 'revision 2 must name the previous hash');
const badDescriptor = write('bad-artifact.json', { schema_version: 'autoarmory/artifact-intake/v1', artifact_id: 'bad.md', source: 'skillopt', path: 'best_skill.md', sha256: '0'.repeat(64) });
result = run(['intake', 'artifact', badDescriptor, '--state', state, '--repo', temp, '--json']);
must(result.code === 1 && /sha256 mismatch/.test(result.out), 'a declared hash that does not match the bytes must fail closed');

const candidate = { schema_version: 'selfforge/candidate/v1', id: 'cand-user-surface', incident_id: 'inc-user-surface', action: 'replace_file', target: { kind: 'deterministic', id: 'target' }, expected_transition: 'COUNT->0', prediction: { fix: ['x'], regress_risk: ['y'] }, evidence: ['real'], risk: 'low', status: 'candidate', change: { skill: 'x', reason: 'reason', decision: 'decision', production_change: false } };
const candidateFile = write('candidate.json', candidate);
json(run(['transition', candidateFile, '--to', 'pending_approval', '--state', state, '--json']));
result = json(run(['inbox', '--state', state, '--json']));
must(result.pending.length === 1, 'pending approval must appear in inbox');
must(JSON.stringify(cardKeys(result.pending[0])) === JSON.stringify(['case', 'lifetime', 'run', 'verifier']), 'the user card must expose exactly case/verifier/run/lifetime');
result = json(run(['result', 'cand-user-surface', '--state', state, '--json']));
must(result.case && result.lifetime && result.verifier === null && result.run === null, 'result must return a four-field user card');
result = json(run(['status', '--state', state, '--json']));
must(result.pending === 1 && result.unbound_artifacts === 1, 'status must count the pending case and latest unbound artifact only');
result = json(run(['approve', '--candidate', 'cand-user-surface', '--quote', 'please approve this change', '--state', state, '--dry-run', '--json']));
must(result.ok && result.dry_run === true, 'approve must delegate to the existing one-decision approval recorder');
console.log('user surface tests passed: artifact intake hashes/revisions, pending inbox, four-field result card, status projection, approval delegation');
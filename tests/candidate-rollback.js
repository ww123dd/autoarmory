'use strict';

// Acceptance test for 1.3.0 (roadmap slot 0.9): candidate-side rollback.
//
// A promotion rests on outcome evidence. When that evidence names artifacts by hash and
// those bytes no longer reproduce, the promoted candidate must be retired with the fact
// that forced it - and preflight must report the escape until it is.
//
//   1. a promoted candidate with reproducing evidence reports no escape
//   2. mutating the artifact makes preflight report stale_candidate_escape_count=1
//   3. `candidate-lifecycle --rollback-if-stale` records a retired transition carrying the mismatch
//   4. a fresh candidate with the restored artifact promotes again
//   5. evidence with no hashed artifact is reported as uncovered, never as fresh, and never auto-retired

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'autoarmory.js');
const APPROVE = path.join(ROOT, 'scripts', 'approve.js');
const LIFECYCLE = path.join(ROOT, 'scripts', 'candidate-lifecycle.js');
const PREFLIGHT = path.join(ROOT, 'scripts', 'mechanism-preflight.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-candidate-rollback-'));
const repo = path.join(work, 'repo');
const state = path.join(repo, '.selfforge');
fs.mkdirSync(state, { recursive: true });
const artifact = path.join(repo, 'artifact.txt');

function must(condition, message) { if (!condition) throw new Error(message); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8'); }
function run(script, args) {
  const result = spawnSync(process.execPath, [script].concat(args), { cwd: repo, encoding: 'utf8', windowsHide: true, env: Object.assign({}, process.env, { AUTOARMORY_STATE: state }) });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function gateFor(candidateId) {
  return { schema_version: 'selfforge/gate/v1', ok: true, candidate_id: candidateId, skillcanary: { schema_version: 'selfforge/skillcanary-gate/v1', ok: true, command: 'gate', version: '0.9.0', exit_code: 0, change_sha256: 'd'.repeat(64) } };
}
function promote(candidateId, evidence) {
  const candidateFile = path.join(work, candidateId + '.json');
  write(candidateFile, { schema_version: 'selfforge/candidate/v1', id: candidateId, incident_id: 'inc-' + candidateId, action: 'replace_file', target: { kind: 'deterministic', id: candidateId }, expected_transition: 'COUNT->0', prediction: { fix: ['x'], regress_risk: ['y'] }, evidence: ['fixture'], risk: 'low', status: 'candidate', change: { skill: 'fixture', reason: 'Candidate rollback fixture that is long enough to pass.', decision: 'Promote with artifact evidence.', production_change: false, budget: { repeat: 3, max_runs: 9 } } });
  const gateFile = path.join(work, candidateId + '-gate.json');
  write(gateFile, gateFor(candidateId));
  const evidenceFile = path.join(work, candidateId + '-evidence.json');
  write(evidenceFile, evidence);
  let result = run(CLI, ['transition', candidateFile, '--to', 'pending_approval', '--state', state, '--json']);
  must(result.code === 0, candidateId + ': pending_approval failed: ' + result.out + result.err);
  const approvalFile = path.join(work, candidateId + '-approval.json');
  result = run(APPROVE, ['--candidate', candidateId, '--quote', 'approve the candidate rollback fixture', '--state', state, '--out', approvalFile, '--json']);
  must(result.code === 0, candidateId + ': approval failed: ' + result.out + result.err);
  result = run(CLI, ['transition', candidateFile, '--to', 'gated', '--gate', gateFile, '--approval', approvalFile, '--state', state, '--json']);
  must(result.code === 0, candidateId + ': gated failed: ' + result.out + result.err);
  result = run(CLI, ['transition', candidateFile, '--to', 'shadow', '--gate', gateFile, '--state', state, '--json']);
  must(result.code === 0, candidateId + ': shadow failed: ' + result.out + result.err);
  result = run(CLI, ['transition', candidateFile, '--to', 'canary', '--evidence', evidenceFile, '--state', state, '--json']);
  must(result.code === 0, candidateId + ': canary failed: ' + result.out + result.err);
  result = run(CLI, ['transition', candidateFile, '--to', 'promoted', '--evidence', evidenceFile, '--state', state, '--json']);
  must(result.code === 0, candidateId + ': promoted failed: ' + result.out + result.err);
}
function lifecycle(args) {
  const result = run(LIFECYCLE, args.concat(['--state', state, '--repo', repo, '--json']));
  must(result.code === 0, 'candidate-lifecycle must succeed: ' + result.out + result.err);
  return JSON.parse(result.out);
}
function preflight() {
  const result = run(PREFLIGHT, []);
  return { code: result.code, text: result.out + result.err };
}

write(artifact, 'v1\n');
const sha1 = sha256File(artifact);
promote('cand-rb', { kind: 'artifact_hash', artifacts: [{ path: 'artifact.txt', sha256: sha1 }] });

// 1
let report = lifecycle(['--list']);
must(report.stale_candidate_escape_count === 0, 'a reproducing promotion must report no escape: ' + JSON.stringify(report));
let gate = preflight();
must(gate.code === 0 && /stale_candidate_escape_count=0/.test(gate.text), 'preflight must pass while the evidence reproduces: ' + gate.text);

// 2
write(artifact, 'v2\n');
report = lifecycle(['--list']);
must(report.stale_candidate_escape_count === 1, 'a mutated artifact must produce one escape: ' + JSON.stringify(report));
gate = preflight();
must(gate.code === 2 && /stale_candidate_escape_count=1/.test(gate.text), 'preflight must report the escape: ' + gate.text);
must(/candidate-lifecycle/.test(gate.text), 'the block must name the tool that closes the loop: ' + gate.text);

// 3
const rolled = lifecycle(['--rollback-if-stale']);
must(rolled.rolled_back === 1 && rolled.escapes_after === 0, 'rollback must retire the stale promotion: ' + JSON.stringify(rolled));
const transitions = fs.readFileSync(path.join(state, 'transitions.jsonl'), 'utf8').trim().split('\n').map(function (line) { return JSON.parse(line); });
const retired = transitions.filter(function (item) { return item.to === 'retired'; }).pop();
must(retired && retired.forced_by && retired.forced_by.kind === 'artifact_hash_mismatch', 'the retired transition must carry the mismatch that forced it');
must(retired.forced_by.artifact_mismatches[0].path === 'artifact.txt' && retired.forced_by.artifact_mismatches[0].expected === sha1, 'the forced_by record must name the artifact and the expected hash');
gate = preflight();
must(gate.code === 0 && /stale_candidate_escape_count=0/.test(gate.text), 'preflight must pass after the rollback: ' + gate.text);

// 4
write(artifact, 'v1\n');
promote('cand-rb2', { kind: 'artifact_hash', artifacts: [{ path: 'artifact.txt', sha256: sha256File(artifact) }] });
report = lifecycle(['--list']);
must(report.stale_candidate_escape_count === 0, 'a fresh candidate with restored evidence must be clean: ' + JSON.stringify(report));

// 5
promote('cand-uncovered', { kind: 'observation', before: { count: 1 }, after: { count: 0 } });
report = lifecycle(['--list']);
must(report.stale_candidate_escape_count === 0 && report.uncovered_candidate_evidence === 1, 'evidence without hashes must be reported as uncovered, not as fresh: ' + JSON.stringify(report));
const before = fs.readFileSync(path.join(state, 'transitions.jsonl'), 'utf8');
const noop = lifecycle(['--rollback-if-stale']);
must(noop.rolled_back === 0, 'an uncovered candidate must not be auto-retired');
must(fs.readFileSync(path.join(state, 'transitions.jsonl'), 'utf8') === before, 'a no-op rollback must not rewrite the transitions file');

console.log('candidate rollback tests passed: reproducing=0 escapes, mutated=1 escape+BLOCK, rollback=retired with forced_by, fresh candidate=promotes again, uncovered=reported not retired');
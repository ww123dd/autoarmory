'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { writeJson, writeJsonl, readJsonl } = require('./util');
const PROJECT_TEST_RE = /(pytest|npm test|node tests|tsc|npm run build)/i;
const SAFE_COMMAND_RE = /^[^&|;<>`$]+$/;
function stateDir(options) { return path.resolve((options && options.stateDir) || process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow')); }
function resolveVerifier(job) {
  if (job && job.verifier_id) return { kind: 'registered', ref: job.verifier_id, reason: 'registered verifier id is present' };
  const candidate = job && job.verifier_candidate || {};
  const commands = (job && job.commands) || [];
  if (candidate.kind === 'project_test') {
    const command = candidate.ref || commands.find(function (item) { return PROJECT_TEST_RE.test(item); });
    if (!command || !PROJECT_TEST_RE.test(command)) return { kind: 'unverifiable', ref: null, reason: 'project_test command is not whitelisted' };
    if (!SAFE_COMMAND_RE.test(command)) return { kind: 'unverifiable', ref: null, reason: 'project_test command contains shell metacharacters' };
    return { kind: 'project_test', ref: command, reason: 'project test command is mechanically replayable' };
  }
  if (candidate.kind === 'git_status') return { kind: 'git_status', ref: candidate.ref || '.', reason: 'git status is mechanically replayable' };
  if (candidate.kind === 'file_hash') return { kind: 'file_hash', ref: candidate.ref, reason: 'file hash is mechanically recomputable' };
  const inferred = commands.find(function (item) { return PROJECT_TEST_RE.test(item); });
  if (inferred) return { kind: 'project_test', ref: inferred, reason: 'recorded command matches project-test whitelist' };
  return { kind: 'unverifiable', ref: null, reason: 'no registered verifier or mechanically replayable command' };
}
function writeReuse(dir, record) { const out = path.join(dir, 'reuse-records', record.change_id + '.json'); fs.mkdirSync(path.dirname(out), { recursive: true }); writeJson(out, record); return out; }
function appendUnverifiable(dir, record) { const file = path.join(dir, 'unverifiable.jsonl'); writeJsonl(file, readJsonl(file).concat([record])); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function descriptorFor(job, verifier) { const now = new Date(); const expires = new Date(now.getTime() + 30 * 86400000).toISOString(); const changeId = job.change_id; const caseId = 'case-' + changeId; const mechanismId = 'mech-' + changeId; return { case: { schema_version: 'autoarmory/case/v1', id: caseId, incident_id: 'inc-' + changeId, title: job.title || ('History-derived change ' + changeId), expected_transition: job.expected_transition || 'FAIL->PASS', failure_mode: 'history_derived_change', severity: job.severity || 'medium', evidence: job.evidence || job.signals || [], reproducible: true, owner: job.owner || 'codex', verifier: verifier, done_criteria: 'registered verifier ' + verifier + ' re-derives the recorded change fact' }, mechanism: { schema_version: 'autoarmory/mechanism/v1', id: mechanismId, name: 'History-derived guard ' + changeId, covered_failure_modes: ['history_derived_change'], trigger: 'A pending history change needs an external reuse verdict.', action: 'Replay the registered verifier and record the result.', verification: 'registered readonly ' + verifier + ' verifier', verifier_id: verifier, closure_criteria: 'registered verifier passes and the run closes', owner: 'codex', version: '1.0.0', verification_stale_days: 30, scope: { project: 'autoarmory', task_type: 'history-derived', environment: 'codex-local', artifact_type: 'change' }, expires_at: expires, reopen_trigger: [{ kind: 'runner_changed' }] } }; }
function splitCommand(command) { return (String(command).match(/"[^"]*"|'[^']*'|\S+/g) || []).map(function (part) { return part.replace(/^['"]|['"]$/g, ''); }); }
function mechanicalRecord(job, verifier, repo) {
  if (verifier.kind === 'project_test') {
    const parts = splitCommand(verifier.ref); const run = spawnSync(parts[0], parts.slice(1), { cwd: repo, encoding: 'buffer', windowsHide: true });
    const exitCode = run.status === null ? 124 : run.status; const stdout = run.stdout || Buffer.alloc(0); const stderr = run.stderr || Buffer.alloc(0);
    return { status: exitCode === 0 ? 'closed' : 'failed', run: { command: verifier.ref, exit_code: exitCode, stdout_sha256: sha256(stdout), stderr_sha256: sha256(stderr) }, reason: exitCode === 0 ? null : 'project test command failed' };
  }
  if (verifier.kind === 'git_status') {
    const run = spawnSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8', windowsHide: true }); const lines = String(run.stdout || '').split(/\r?\n/).filter(Boolean);
    const expected = job.changed_files || []; const mismatch = expected.filter(function (file) { return !lines.some(function (line) { return line.indexOf(file) !== -1; }); });
    return { status: run.status === 0 && mismatch.length === 0 ? 'closed' : 'failed', run: { command: 'git status --porcelain', exit_code: run.status, observed_changed_files: lines }, reason: mismatch.length ? 'recorded file state does not match git status' : null };
  }
  if (verifier.kind === 'file_hash') {
    const full = path.resolve(repo, verifier.ref || ''); if (!verifier.ref || !fs.existsSync(full)) return { status: 'unverifiable', reason: 'file_hash target does not exist', run: null };
    return { status: 'closed', run: { path: verifier.ref, baseline_sha256: sha256(fs.readFileSync(full)) }, reason: null };
  }
  return { status: 'unverifiable', reason: 'unsupported mechanical verifier', run: null };
}
function drain(options) {
  const opts = options || {}; const dir = stateDir(opts); const repo = path.resolve(opts.repo || path.join(__dirname, '..', '..')); const pendingDir = path.join(dir, 'pending'); const files = fs.existsSync(pendingDir) ? fs.readdirSync(pendingDir).filter(function (x) { return /\.json$/i.test(x); }).sort() : []; const results = [];
  for (const name of files) {
    const file = path.join(pendingDir, name); let job; try { job = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { results.push({ change_id: null, status: 'failed', reason: 'pending job unreadable: ' + error.message }); continue; }
    const changeId = job.change_id; const reuseFile = path.join(dir, 'reuse-records', changeId + '.json'); if (fs.existsSync(reuseFile)) { try { fs.unlinkSync(file); } catch (_) {} results.push({ change_id: changeId, status: 'skipped', reason: 'reuse record exists' }); continue; }
    const verifier = resolveVerifier(job); let record = null;
    if (verifier.kind === 'registered') {
      const descDir = path.join(dir, 'history-runner-descriptors'); fs.mkdirSync(descDir, { recursive: true }); const descriptorPath = path.join(descDir, changeId + '.json'); const descriptor = descriptorFor(job, verifier.ref); writeJson(descriptorPath, descriptor);
      const declare = spawnSync(process.execPath, [path.join(repo, 'scripts', 'mechanism-declare.js'), '--descriptor', descriptorPath, '--state', dir, '--repo', repo, '--json'], { cwd: repo, encoding: 'utf8', windowsHide: true });
      if (declare.status !== 0) record = { schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: 'failed', stage: 'declare', reason: (declare.stderr || declare.stdout || '').trim(), resolved_at: new Date().toISOString() };
      else { const run = spawnSync(process.execPath, [path.join(repo, 'scripts', 'mechanism-record.js'), '--mechanism', descriptor.mechanism.id, '--case', descriptor.case.id, '--state', dir, '--repo', repo, '--close', '--json'], { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 90000 }); if (run.status === 0) { let parsed = {}; try { parsed = JSON.parse(run.stdout || '{}'); } catch (_) {} record = { schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: 'closed', verifier: verifier.ref, run: parsed.run || null, closure: parsed.closure || null, resolved_at: new Date().toISOString() }; } else record = { schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: 'failed', stage: 'run', reason: (run.stderr || run.stdout || '').trim(), resolved_at: new Date().toISOString() }; }
    } else if (verifier.kind === 'unverifiable') {
      record = { schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: 'unverifiable', reason: verifier.reason, resolved_at: new Date().toISOString() };
    } else {
      const outcome = mechanicalRecord(job, verifier, repo); record = { schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: outcome.status, verifier: verifier.ref, run: outcome.run || null, reason: outcome.reason || null, resolved_at: new Date().toISOString() };
    }
    writeReuse(dir, record); if (record.status === 'unverifiable') appendUnverifiable(dir, record); try { fs.unlinkSync(file); } catch (_) {} results.push({ change_id: changeId, status: record.status, reason: record.reason || null, verifier: verifier.ref });
  }
  return { schema_version: 'autoarmory/history-runner/v1', pending_dir: pendingDir, processed: results.length, history_derived_run_count: results.filter(function (x) { return x.status === 'closed'; }).length, unverifiable_count: results.filter(function (x) { return x.status === 'unverifiable'; }).length, failed_count: results.filter(function (x) { return x.status === 'failed'; }).length, results: results };
}
module.exports = { drain, resolveVerifier, descriptorFor, stateDir, PROJECT_TEST_RE };
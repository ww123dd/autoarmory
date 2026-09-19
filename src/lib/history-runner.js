'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { writeJson, writeJsonl, readJsonl, sha256: sha256Text } = require('./util');
const commandFamily = require('./command-family');
const PROJECT_TEST_RE = /(pytest|npm test|node tests|tsc|npm run build)/i;
const SAFE_COMMAND_RE = /^[^&|;<>`$]+$/;
function stateDir(options) { return path.resolve((options && options.stateDir) || process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow')); }
// Mechanical transition derivation, not a guess: the recorded command's family
// carries a default transition (same command_shape derivation the
// transition-proposer models; owner_declared still wins when present).
function deriveTransition(job) {
  if (job && job.expected_transition) return { transition: job.expected_transition, source: 'owner_declared' };
  const commands = (job && job.commands) || [];
  for (const command of commands) {
    const classified = commandFamily.classify(command);
    if (classified.transition) return { transition: classified.transition, source: 'command_shape' };
  }
  return { transition: null, source: null };
}
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
function bindingProblem(job, verifier, repo) {
  if (verifier.kind === 'registered') return null;
  const binding = job && job.mechanical_binding;
  if (!binding) return 'mechanical_binding_missing';
  if (binding.kind !== verifier.kind) return 'mechanical_binding_kind_mismatch';
  if (binding.command_sha256 && sha256(String(verifier.ref || '')) !== binding.command_sha256) return 'mechanical_binding_command_mismatch';
  if (binding.repo_head) { const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', windowsHide: true }); if (head.status !== 0 || String(head.stdout || '').trim() !== binding.repo_head) return 'mechanical_binding_repo_mismatch'; }
  return null;
}
function writeReuse(dir, record) { const root = path.join(dir, 'reuse-records'); fs.mkdirSync(root, { recursive: true }); const changeOut = path.join(root, record.change_id + '.json'); writeJson(changeOut, record); if (record.decision_id) writeJson(path.join(root, record.decision_id.replace(/[:]/g, '_') + '.json'), record); return changeOut; }
function verifierIdentity(repo, verifierId, job) {
  const lockPath = path.join(repo, 'verifiers.lock.json');
  let lockSha = null, entry = null;
  try { const text = fs.readFileSync(lockPath, 'utf8'); lockSha = sha256Text(text); const lock = JSON.parse(text); entry = (lock.verifiers || []).find(function (item) { return item.id === verifierId; }) || null; } catch (_) {}
  const claimInstance = job && job.claim_instance || null;
  const expectedProvenance = job && job.expected_provenance || (verifierId ? 'pinned_verifier' : null);
  const expectedValue = job && Object.prototype.hasOwnProperty.call(job, 'expected_value') ? job.expected_value : (entry && entry.assertion ? entry.assertion.value : null);
  const expected = verifierId
    ? sha256Text(JSON.stringify({ id: verifierId, assertion: entry && entry.assertion || null, kind: entry && entry.kind || null, claim_instance: claimInstance, expected_value: expectedValue, expected_provenance: expectedProvenance }))
    : (job && job.mechanical_binding && job.mechanical_binding.command_sha256) || null;
  const claim = sha256Text(JSON.stringify({ change_id: job.change_id, expected_transition: job.expected_transition, expected_sha256: expected, claim_instance: claimInstance, expected_provenance: expectedProvenance }));
  return { decision_id: job.change_id + ':' + claim, claim_sha256: claim, expected_sha256: expected, verifier_lock_sha256: lockSha, source_verifier_id: verifierId || null, claim_instance: claimInstance, expected_value: expectedValue, expected_provenance: expectedProvenance };
}
function provenanceProblem(job, verifier) {
  if (!job || verifier.kind === 'unverifiable') return null;
  if (verifier.kind === 'registered' && !job.expected_provenance) return null;
  const allowed = ['pinned_verifier', 'owner_approval', 'baseline_manifest', 'commit'];
  if (!job.expected_provenance) return 'expected_provenance_missing';
  if (allowed.indexOf(job.expected_provenance) === -1) return 'expected_provenance_untrusted:' + job.expected_provenance;
  return null;
}
function appendUnverifiable(dir, record) { const file = path.join(dir, 'unverifiable.jsonl'); writeJsonl(file, readJsonl(file).concat([record])); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function descriptorFor(job, verifier, identity) { const now = new Date(); const expires = new Date(now.getTime() + 30 * 86400000).toISOString(); const changeId = job.change_id; const claim = identity && identity.claim_sha256 ? '-' + identity.claim_sha256.slice(0, 12) : ''; const caseId = 'case-' + changeId + claim; const mechanismId = 'mech-' + changeId + claim; return { case: { schema_version: 'autoarmory/case/v1', id: caseId, incident_id: 'inc-' + changeId, title: job.title || ('History-derived change ' + changeId), expected_transition: job.expected_transition || 'FAIL->PASS', failure_mode: 'history_derived_change', severity: job.severity || 'medium', evidence: job.evidence || job.signals || [], reproducible: true, owner: job.owner || 'codex', verifier: verifier, done_criteria: 'registered verifier ' + verifier + ' re-derives the recorded change fact' }, mechanism: { schema_version: 'autoarmory/mechanism/v1', id: mechanismId, name: 'History-derived guard ' + changeId, covered_failure_modes: ['history_derived_change'], trigger: 'A pending history change needs an external reuse verdict.', action: 'Replay the registered verifier and record the result.', verification: 'registered readonly ' + verifier + ' verifier', verifier_id: verifier, closure_criteria: 'registered verifier passes and the run closes', owner: 'codex', version: '1.0.0', verification_stale_days: 30, scope: { project: 'autoarmory', task_type: 'history-derived', environment: 'codex-local', artifact_type: 'change' }, expires_at: expires, reopen_trigger: [{ kind: 'runner_changed' }] } }; }
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
    const changeId = job.change_id; const reuseFile = path.join(dir, 'reuse-records', changeId + '.json'); let existing = null; try { existing = fs.existsSync(reuseFile) ? JSON.parse(fs.readFileSync(reuseFile, 'utf8')) : null; } catch (_) { existing = null; }
    const verifier = resolveVerifier(job); const identity = verifier.kind === 'registered' || verifier.kind === 'project_test' || verifier.kind === 'git_status' || verifier.kind === 'file_hash' ? verifierIdentity(repo, verifier.ref, job) : null; if (existing && (!identity || existing.decision_id === identity.decision_id)) { try { fs.unlinkSync(file); } catch (_) {} results.push({ change_id: changeId, status: 'skipped', reason: 'same claim already has a reuse record' }); continue; } if (existing && identity && existing.decision_id && existing.decision_id !== identity.decision_id) { try { fs.appendFileSync(path.join(dir, 'claim-events.jsonl'), JSON.stringify({ schema_version: 'autoarmory/claim-event/v1', at: new Date().toISOString(), change_id: changeId, from_decision_id: existing.decision_id, to_decision_id: identity.decision_id, reason: 'claim_changed' }) + '\n', 'utf8'); } catch (_) {} }
    const derived = deriveTransition(job); job.expected_transition = derived.transition; job.transition_source = derived.source;
    if (!job.expected_provenance && job && job.mechanical_binding && job.mechanical_binding.repo_head) job.expected_provenance = 'commit';
    const bindingError = verifier.kind === 'unverifiable' ? null : bindingProblem(job, verifier, repo); const provenanceError = provenanceProblem(job, verifier); let record = null;
    if (!job.expected_transition) { record = { schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: 'unverifiable', reason: 'expected_transition_missing', resolved_at: new Date().toISOString() }; }
    else if (bindingError) { record = { schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: 'unverifiable', reason: bindingError, resolved_at: new Date().toISOString() }; }
    else if (provenanceError) { record = { schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: 'unverifiable', reason: provenanceError, resolved_at: new Date().toISOString() }; }
    else if (verifier.kind === 'registered') {
      const descDir = path.join(dir, 'history-runner-descriptors'); fs.mkdirSync(descDir, { recursive: true }); const descriptorPath = path.join(descDir, changeId + '.json'); const descriptor = descriptorFor(job, verifier.ref, identity); writeJson(descriptorPath, descriptor);
      const declare = spawnSync(process.execPath, [path.join(repo, 'scripts', 'mechanism-declare.js'), '--descriptor', descriptorPath, '--state', dir, '--repo', repo, '--json'], { cwd: repo, encoding: 'utf8', windowsHide: true });
      const declareText = (declare.stderr || declare.stdout || '').trim();
      let declareOk = declare.status === 0;
      if (!declareOk && /already exists/.test(declareText)) {
        const cases = readJsonl(path.join(dir, 'cases.jsonl'));
        const mechanisms = readJsonl(path.join(dir, 'mechanisms.jsonl'));
        declareOk = cases.some(function (item) { return item.id === descriptor.case.id; }) && mechanisms.some(function (item) { return item.id === descriptor.mechanism.id && item.verifier_id === descriptor.mechanism.verifier_id; });
      }
      if (!declareOk) record = { schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: 'failed', stage: 'declare', reason: declareText, resolved_at: new Date().toISOString() };
      else {
        const run = spawnSync(process.execPath, [path.join(repo, 'scripts', 'mechanism-record.js'), '--mechanism', descriptor.mechanism.id, '--case', descriptor.case.id, '--state', dir, '--repo', repo, '--close', '--json'], { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 90000 });
        if (run.status === 0) { let parsed = {}; try { parsed = JSON.parse(run.stdout || '{}'); } catch (_) {} const currentIdentity = verifierIdentity(repo, verifier.ref, job); record = Object.assign({ schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: 'closed', verifier: verifier.ref, mechanism_id: descriptor.mechanism.id, case_id: descriptor.case.id, run: parsed.run || null, closure: parsed.closure || null, expires_at: descriptor.mechanism.expires_at || null, resolved_at: new Date().toISOString() }, currentIdentity); }
        else record = { schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: 'failed', stage: 'run', reason: (run.stderr || run.stdout || '').trim(), resolved_at: new Date().toISOString() };
      }
    } else if (verifier.kind === 'unverifiable') {
      record = { schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: 'unverifiable', reason: verifier.reason, resolved_at: new Date().toISOString() };
    } else {
      const outcome = mechanicalRecord(job, verifier, repo); const identity = verifierIdentity(repo, verifier.ref, job); record = Object.assign({ schema_version: 'autoarmory/reuse-record/v1', change_id: changeId, status: outcome.status, verifier: verifier.ref, run: outcome.run || null, reason: outcome.reason || null, resolved_at: new Date().toISOString() }, identity);
    }
    record.claim_instance = job.claim_instance || null;
    record.expected_transition = job.expected_transition || null;
    record.transition_source = job.transition_source || null;
    record.expected_value = Object.prototype.hasOwnProperty.call(job, 'expected_value') ? job.expected_value : null;
    record.expected_provenance = job.expected_provenance || (verifier.kind === 'registered' ? 'pinned_verifier' : null);
    record.session_id = job.session_id || null;
    record.turn_id = job.turn_id || null;
    record.source_message_id = job.source_message_id || null;
    record.session_link_status = job.session_id ? 'linked' : 'link_lost';
    record.session_link_source = job.session_id ? 'pending_job' : 'missing_source';
    writeReuse(dir, record); if (record.status === 'unverifiable') appendUnverifiable(dir, record); try { fs.unlinkSync(file); } catch (_) {} results.push({ change_id: changeId, status: record.status, reason: record.reason || null, verifier: verifier.ref });
  }
  return { schema_version: 'autoarmory/history-runner/v1', pending_dir: pendingDir, processed: results.length, history_derived_run_count: results.filter(function (x) { return x.status === 'closed'; }).length, unverifiable_count: results.filter(function (x) { return x.status === 'unverifiable'; }).length, failed_count: results.filter(function (x) { return x.status === 'failed'; }).length, results: results };
}
module.exports = { drain, resolveVerifier, descriptorFor, stateDir, PROJECT_TEST_RE };
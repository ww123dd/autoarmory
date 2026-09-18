'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs, printJson, readJson, readJsonl } = require('../lib/util');
const skillcanary = require('../lib/skillcanary');
const artifact = require('../lib/artifact');
const mechanism = require('../lib/mechanism');
const view = require('../lib/user-view');

// One state root for both legs: the operator surface and the shadow runner.
// CWD-relative defaults split the truth across roots; this keeps every command
// on the same files unless an explicit --state overrides it.
function defaultState() {
  return path.resolve(process.env.AUTOARMORY_STATE || process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow'));
}

function run(argv) {
  const args = parseArgs(argv);
  const dir = path.resolve(args._[0] || '.');
  const state = path.join(dir, '.selfforge');
  const checks = [];
  function add(id, ok, detail) { checks.push({ id, ok: !!ok, detail }); }
  add('state', fs.existsSync(state), state);
  add('incidents', fs.existsSync(path.join(state, 'incidents.jsonl')) && readJsonl(path.join(state, 'incidents.jsonl')).length > 0, 'observed incidents');
  add('candidates', fs.existsSync(path.join(state, 'candidates.jsonl')) && readJsonl(path.join(state, 'candidates.jsonl')).length > 0, 'proposed candidates');
  add('environment', fs.existsSync(path.join(state, 'environment.json')), 'environment fingerprint');
  add('capabilities', fs.existsSync(path.join(state, 'capabilities.jsonl')) && readJsonl(path.join(state, 'capabilities.jsonl')).length > 0, 'capability registry');
  add('capability-outcomes', fs.existsSync(path.join(state, 'capability-outcomes.jsonl')) && readJsonl(path.join(state, 'capability-outcomes.jsonl')).length > 0, 'capability outcome history');
  add('decisions', fs.existsSync(path.join(state, 'decisions.jsonl')) && readJsonl(path.join(state, 'decisions.jsonl')).length > 0, 'recorded outcomes');
  add('skillcanary', !!skillcanary.resolve(args.skillcanary || undefined, dir), 'SkillCanary dependency');
  const result = { schema_version: 'selfforge/doctor/v1', ok: checks.every(function (check) { return check.ok; }), checks };
  if (args.json) printJson(result); else { for (const check of checks) process.stdout.write('  ' + (check.ok ? 'o ' : 'x ') + check.id + ': ' + check.detail + '\n'); process.stdout.write('  Result: ' + (result.ok ? 'PASS' : 'INCOMPLETE') + '\n'); }
  return 0;
}

function inbox(argv) {
  const args = parseArgs(argv);
  const state = path.resolve(args.state || defaultState());
  const report = view.inbox(state, { repo: path.resolve(args.repo || process.cwd()) });
  if (args.json) printJson(report);
  else {
    process.stdout.write('pending: ' + report.pending.length + '  ready: ' + report.ready_to_run.length + '  results: ' + report.results.length + '  expired/revoked: ' + report.expired_or_revoked.length + '  unbound artifacts: ' + report.unbound_artifacts.length + '\n');
    for (const card of report.ready_to_run) process.stdout.write('  ready    ' + card.id + '  run with ' + ((card.verifier && card.verifier.id) || 'verifier') + '\n');
    for (const card of report.pending) process.stdout.write('  pending  ' + card.id + '  ' + ((card.case && card.case.title) || '') + '\n');
    for (const card of report.results) process.stdout.write('  result   ' + card.id + '  ' + card.lifetime.state + '\n');
    for (const card of report.expired_or_revoked) process.stdout.write('  expired  ' + card.id + '  ' + card.lifetime.state + '\n');
    for (const card of report.unbound_artifacts) process.stdout.write('  artifact ' + card.id + '  needs case+verifier\n');
  }
  return 0;
}

function result(argv) {
  const args = parseArgs(argv);
  const id = args._[0];
  if (!id) { process.stderr.write('Usage: autoarmory result <case|run|artifact-id> [--state <root>] [--json]\n'); return 2; }
  const report = view.result(path.resolve(args.state || defaultState()), id, { repo: path.resolve(args.repo || process.cwd()) });
  if (!report.ok) { if (args.json) printJson(report); else process.stderr.write(report.errors.join('\n') + '\n'); return 1; }
  const card = report.card;
  if (args.json) printJson(card);
  else {
    process.stdout.write('Case: ' + ((card.case && card.case.title) || card.id) + '\n');
    process.stdout.write('Fact: ' + ((card.verifier && card.verifier.status) || card.lifetime.reason) + '\n');
    process.stdout.write('Run: ' + ((card.run && card.run.result) || 'not run') + '\n');
    process.stdout.write('Lifetime: ' + card.lifetime.state + '\n');
    process.stdout.write('Action: ' + card.action + '\n');
  }
  return 0;
}

function status(argv) {
  const args = parseArgs(argv);
  const report = view.status(path.resolve(args.state || defaultState()), { repo: path.resolve(args.repo || process.cwd()) });
  if (args.json) printJson(report);
  else process.stdout.write('pending=' + report.pending + ' approved=' + report.approved + ' attention=' + report.attention + ' expired=' + report.expired + ' revoked=' + report.revoked + ' unbound_artifacts=' + report.unbound_artifacts + '\n');
  return 0;
}

function approve(argv) {
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'approve.js')].concat(argv), { stdio: 'inherit' });
  return result.status === null ? 2 : result.status;
}

function intake(argv) {
  const args = parseArgs(argv);
  if (args._[0] !== 'artifact' || !args._[1]) { process.stderr.write('Usage: autoarmory intake artifact <descriptor.json> [--state <root>] [--repo .] [--json]\n'); return 2; }
  const repo = path.resolve(args.repo || '.');
  const state = path.resolve(args.state || defaultState());
  let descriptor;
  try { descriptor = readJson(path.resolve(args._[1])); } catch (error) { const out = { schema_version: 'autoarmory/artifact-intake/v1', ok: false, errors: ['descriptor is unreadable: ' + error.message] }; if (args.json) printJson(out); else process.stderr.write(out.errors.join('\n') + '\n'); return 1; }
  const result = artifact.intakeArtifact(state, descriptor, { repo: repo });
  if (!result.ok) { if (args.json) printJson(result); else process.stderr.write(result.errors.join('\n') + '\n'); return 1; }
  const out = { schema_version: 'autoarmory/artifact-intake/v1', ok: true, duplicate: result.duplicate, artifact: { id: result.record.artifact_id, source: result.record.source, sha256: result.record.sha256, revision: result.record.revision }, next: result.next };
  if (args.json) printJson(out); else process.stdout.write((result.duplicate ? 'already intaken ' : 'intaken ') + out.artifact.id + '@' + out.artifact.sha256.slice(0, 12) + ' rev=' + out.artifact.revision + '\n  next: ' + out.next + '\n');
  return 0;
}

function bind(argv) {
  const args = parseArgs(argv);
  if (args._[0] !== 'artifact' || !args._[1]) { process.stderr.write('Usage: autoarmory bind artifact <artifact-id> --case <case-id> --verifier <verifier-id> [--case-file case.json] [--state <root>] [--repo .] [--json]\n'); return 2; }
  const artifactId = args._[1];
  const repo = path.resolve(args.repo || '.');
  const state = path.resolve(args.state || defaultState());
  let caseDescriptor = null;
  if (args['case-file']) {
    try { const raw = readJson(path.resolve(args['case-file'])); caseDescriptor = raw.case || raw; } catch (error) { process.stderr.write('case file is unreadable: ' + error.message + '\n'); return 1; }
  }
  const caseId = args.case || (caseDescriptor && caseDescriptor.id) || null;
  const verifierId = args.verifier || null;
  const result = artifact.bindArtifact(state, artifactId, { repo: repo, caseId: caseId, verifierId: verifierId, caseDescriptor: caseDescriptor, actor: args.actor || 'codex' });
  if (!result.ok) { if (args.json) printJson(result); else process.stderr.write(result.errors.join('\n') + '\n'); return 1; }
  const card = view.result(state, artifactId, { repo: repo });
  const out = { schema_version: 'autoarmory/artifact-bind/v1', ok: true, duplicate: result.duplicate, binding: result.binding, card: card.ok ? card.card : null };
  if (args.json) printJson(out); else process.stdout.write((result.duplicate ? 'already bound ' : 'bound ') + artifactId + ' -> ' + result.binding.case_id + ' / ' + result.binding.verifier_id + '\n  next: run the verifier and record the result\n');
  return 0;
}

function ensureMechanism(state, binding, artifactRecord, caseRecord, repo) {
  const existing = mechanism.listMechanisms(state).find(function (item) { return item.binding_id === binding.id; }) || null;
  if (existing) return { ok: true, duplicate: true, mechanism: existing };
  const result = mechanism.registerMechanism(state, {
    schema_version: 'autoarmory/mechanism/v1',
    id: 'mech-' + binding.id.replace(/^bind-/, ''),
    name: caseRecord.title || artifactRecord.artifact_id,
    covered_failure_modes: [caseRecord.failure_mode || 'artifact_quality'],
    trigger: 'artifact ' + artifactRecord.artifact_id + ' bound to ' + binding.case_id,
    action: 'run the bound verifier and record the result',
    verification: 'bound verifier ' + binding.verifier_id,
    verifier_id: binding.verifier_id,
    closure_criteria: caseRecord.expected_transition || 'verifier pass',
    owner: caseRecord.owner || 'user',
    version: '1.0.0',
    binding_id: binding.id,
    artifact_id: artifactRecord.artifact_id,
    artifact_sha256: artifactRecord.sha256
  }, { repo: repo });
  return result;
}
function runArtifact(argv) {
  const args = parseArgs(argv);
  if (args._[0] !== 'artifact' || !args._[1]) { process.stderr.write('Usage: autoarmory run artifact <artifact-id> [--trials 3] [--state <root>] [--repo .] [--json]\n'); return 2; }
  const artifactId = args._[1];
  const repo = path.resolve(args.repo || '.');
  const state = path.resolve(args.state || defaultState());
  const artifactRecord = artifact.readArtifacts(state).filter(function (item) { return item.artifact_id === artifactId; }).pop() || null;
  if (!artifactRecord) { process.stderr.write('artifact not found: ' + artifactId + '\n'); return 1; }
  const binding = artifact.readBindings(state).filter(function (item) { return item.artifact_id === artifactId; }).pop() || null;
  if (!binding) { process.stderr.write('artifact is not bound: ' + artifactId + '\n'); return 1; }
  const casesFile = path.join(state, 'cases.jsonl');
  const cases = fs.existsSync(casesFile) ? readJsonl(casesFile) : [];
  const caseRecord = cases.find(function (item) { return item.id === binding.case_id; }) || null;
  if (!caseRecord) { process.stderr.write('bound case not found: ' + binding.case_id + '\n'); return 1; }
  const ensured = ensureMechanism(state, binding, artifactRecord, caseRecord, repo);
  if (!ensured.ok) { if (args.json) printJson(ensured); else process.stderr.write(ensured.errors.join('\n') + '\n'); return 1; }
  const recordScript = path.join(__dirname, '..', '..', 'scripts', 'mechanism-record.js');
  const runArgs = ['--mechanism', ensured.mechanism.id, '--case', binding.case_id, '--state', state, '--repo', repo, '--trials', String(args.trials || 3), '--close', '--json'];
  const child = spawnSync(process.execPath, [recordScript].concat(runArgs), { encoding: 'utf8' });
  if (child.status !== 0) {
    const detail = (child.stdout || '') + (child.stderr || '');
    if (args.json) printJson({ ok: false, errors: [detail.trim() || 'mechanism run failed'] }); else process.stderr.write(detail + '\n');
    return child.status === null ? 2 : child.status;
  }
  const report = JSON.parse(child.stdout);
  const card = view.result(state, artifactId, { repo: repo });
  const out = { schema_version: 'autoarmory/artifact-run/v1', ok: true, run: report.run, status: report.status, card: card.ok ? card.card : null };
  if (args.json) printJson(out); else process.stdout.write('ran ' + artifactId + ' -> result=' + report.run.result + ' verdict=' + report.status.status + '\n');
  return report.status.status === 'verified' || report.status.status === 'closed' ? 0 : 1;
}

module.exports = run;
module.exports.inbox = inbox;
module.exports.result = result;
module.exports.status = status;
module.exports.approve = approve;
module.exports.intake = intake;
module.exports.bind = bind;
module.exports.run = runArtifact;
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs, printJson, readJson, readJsonl } = require('../lib/util');
const skillcanary = require('../lib/skillcanary');
const artifact = require('../lib/artifact');
const view = require('../lib/user-view');

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
  const state = path.resolve(args.state || '.selfforge');
  const report = view.inbox(state, { repo: path.resolve(args.repo || process.cwd()) });
  if (args.json) printJson(report);
  else {
    process.stdout.write('pending: ' + report.pending.length + '  results: ' + report.results.length + '  expired/revoked: ' + report.expired_or_revoked.length + '  unbound artifacts: ' + report.unbound_artifacts.length + '\n');
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
  if (!id) { process.stderr.write('Usage: autoarmory result <case|run|artifact-id> [--state .selfforge] [--json]\n'); return 2; }
  const report = view.result(path.resolve(args.state || '.selfforge'), id, { repo: path.resolve(args.repo || process.cwd()) });
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
  const report = view.status(path.resolve(args.state || '.selfforge'), { repo: path.resolve(args.repo || process.cwd()) });
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
  if (args._[0] !== 'artifact' || !args._[1]) { process.stderr.write('Usage: autoarmory intake artifact <descriptor.json> [--state .selfforge] [--repo .] [--json]\n'); return 2; }
  const repo = path.resolve(args.repo || '.');
  const state = path.resolve(args.state || path.join(repo, '.selfforge'));
  let descriptor;
  try { descriptor = readJson(path.resolve(args._[1])); } catch (error) { const out = { schema_version: 'autoarmory/artifact-intake/v1', ok: false, errors: ['descriptor is unreadable: ' + error.message] }; if (args.json) printJson(out); else process.stderr.write(out.errors.join('\n') + '\n'); return 1; }
  const result = artifact.intakeArtifact(state, descriptor, { repo: repo });
  if (!result.ok) { if (args.json) printJson(result); else process.stderr.write(result.errors.join('\n') + '\n'); return 1; }
  const out = { schema_version: 'autoarmory/artifact-intake/v1', ok: true, duplicate: result.duplicate, artifact: { id: result.record.artifact_id, source: result.record.source, sha256: result.record.sha256, revision: result.record.revision }, next: result.next };
  if (args.json) printJson(out); else process.stdout.write((result.duplicate ? 'already intaken ' : 'intaken ') + out.artifact.id + '@' + out.artifact.sha256.slice(0, 12) + ' rev=' + out.artifact.revision + '\n  next: ' + out.next + '\n');
  return 0;
}

module.exports = run;
module.exports.inbox = inbox;
module.exports.result = result;
module.exports.status = status;
module.exports.approve = approve;
module.exports.intake = intake;
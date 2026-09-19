'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const gate = require('../src/lib/load-gate');
const fixtureHelper = require('./helpers/mechanism-fixture');

function must(condition, message) { if (!condition) throw new Error(message); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-load-gate-'));
const emptyState = path.join(root, 'empty-state');
fs.mkdirSync(path.join(emptyState, 'reuse-records'), { recursive: true });
const repo = path.join(root, 'repo');
fs.mkdirSync(repo, { recursive: true });

let r = gate.consult(emptyState, 'missing', { risk: 'low', repo: repo });
must(r.decision === 'degrade', 'missing verdict must degrade low-risk load');
r = gate.consult(emptyState, 'missing', { risk: 'high', repo: repo });
must(r.decision === 'block', 'missing verdict must block high-risk action');
r = gate.consult(emptyState, 'missing', { risk: 'low' });
must(r.decision === 'block' && r.reason === 'repo is required', 'missing repo must fail closed');

// Correct state: runner fresh, fact reproduces, lock present, expected matches.
const valid = fixtureHelper.createFixture(root, 'valid');
fixtureHelper.registerCaseAndMechanism(valid);
const run = fixtureHelper.recordRun(valid, 'run-valid');
const closure = fixtureHelper.closeRun(valid, run);
const validRecord = fixtureHelper.reuseRecord(valid, 'change-valid', { run: run, closure: closure });
r = gate.consult(valid.state, 'change-valid', { risk: 'high', repo: valid.repo, decisionId: validRecord.decision_id });
must(r.decision === 'allow' && r.verdict === 'closed', 'correct closed verdict must allow');

// Legacy records without claim identity are historical only and must not allow.
fs.writeFileSync(path.join(emptyState, 'reuse-records', 'legacy.json'), JSON.stringify({ change_id: 'legacy', status: 'closed', verifier: 'fixture', run: { result: 'pass' } }));
r = gate.consult(emptyState, 'legacy', { risk: 'low', repo: valid.repo });
must(r.decision === 'block' && r.verdict === 'superseded', 'legacy closed verdict must block as superseded');

// Expiry comes from mechanism.status and cannot be bypassed by a passing record.
const expired = fixtureHelper.createFixture(root, 'expired');
fixtureHelper.registerCaseAndMechanism(expired);
const expiredRun = fixtureHelper.recordRun(expired, 'run-expired');
const expiredClosure = fixtureHelper.closeRun(expired, expiredRun);
const expiredRecord = fixtureHelper.reuseRecord(expired, 'change-expired', { run: expiredRun, closure: expiredClosure });
const mechanismsFile = path.join(expired.state, 'mechanisms.jsonl');
fs.writeFileSync(mechanismsFile, fs.readFileSync(mechanismsFile, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) {
  const item = JSON.parse(line);
  item.expires_at = '2000-01-01T00:00:00.000Z';
  return JSON.stringify(item);
}).join('\n') + '\n', 'utf8');
r = gate.consult(expired.state, 'change-expired', { risk: 'low', repo: expired.repo, decisionId: expiredRecord.decision_id });
must(r.decision === 'degrade' && r.verdict === 'expired', 'expired evidence must degrade low-risk load');
r = gate.consult(expired.state, 'change-expired', { risk: 'high', repo: expired.repo, decisionId: expiredRecord.decision_id });
must(r.decision === 'block', 'expired evidence must block high-risk action');

// CLI must be explicit too: --state and --repo are both required.
const script = path.resolve(__dirname, '..', 'scripts', 'load-gate.js');
let cli = spawnSync(process.execPath, [script, '--state', valid.state, '--repo', valid.repo, '--change-id', 'change-valid', '--risk', 'high', '--json'], { encoding: 'utf8' });
must(cli.status === 0 && JSON.parse(cli.stdout).decision === 'allow', 'CLI with explicit --state/--repo must allow the fresh verdict');
cli = spawnSync(process.execPath, [script, '--state', valid.state, '--change-id', 'change-valid', '--json'], { encoding: 'utf8' });
must(cli.status === 2 && /--repo/.test(cli.stderr), 'CLI without --repo must fail closed');
cli = spawnSync(process.execPath, [script, '--repo', valid.repo, '--change-id', 'change-valid', '--json'], { encoding: 'utf8' });
must(cli.status === 2 && /--state/.test(cli.stderr), 'CLI without --state must fail closed');

console.log('load gate tests passed: missing, explicit repo, correct-state allow, legacy supersession, expired block, CLI context');
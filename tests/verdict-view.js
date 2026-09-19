'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const v = require('../src/lib/verdict-view');
const fixtureHelper = require('./helpers/mechanism-fixture');

function must(condition, message) { if (!condition) throw new Error(message); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-verdict-view-'));

// Missing evidence remains explicit.
const emptyState = path.join(root, 'empty-state');
fs.mkdirSync(path.join(emptyState, 'reuse-records'), { recursive: true });
const missing = v.verdictFor('change-missing', v.readReuseIndex(emptyState), { stateDir: emptyState, repo: root });
must(missing.effective_state === 'missing' && missing.verification_state === 'verdict_missing', 'missing verdict must be explicit');

// A complete claim is projected from mechanism.status(), not from reuse-record.status.
const fixture = fixtureHelper.createFixture(root, 'valid');
fixtureHelper.registerCaseAndMechanism(fixture);
const run = fixtureHelper.recordRun(fixture, 'run-valid');
const closure = fixtureHelper.closeRun(fixture, run);
const record = fixtureHelper.reuseRecord(fixture, 'change-valid', { run: run, closure: closure });
const index = v.readReuseIndex(fixture.state);
const closed = v.verdictFor('change-valid', index, { stateDir: fixture.state, repo: fixture.repo, decisionId: record.decision_id });
must(closed.effective_state === 'closed' && closed.mechanism_status === 'closed', 'closed mechanism status must be the effective verdict');
const joined = v.joinDraft({ change_id: 'change-valid', id: 'change-valid' }, index, { stateDir: fixture.state, repo: fixture.repo });
must(joined.verification_state === 'closed' && joined.link_status === 'linked', 'closed verdict must join back');

// Legacy reuse-records do not carry current claim identity and must not stay closed.
fs.writeFileSync(path.join(emptyState, 'reuse-records', 'change-legacy.json'), JSON.stringify({ change_id: 'change-legacy', status: 'closed', mechanism_id: 'mech-legacy', verifier: 'fixture', run: { result: 'pass' } }));
const legacy = v.verdictFor('change-legacy', v.readReuseIndex(emptyState), { stateDir: emptyState, repo: fixture.repo });
must(legacy.effective_state === 'superseded', 'legacy verdict without claim identity must be superseded');

// Expiry is sourced from the mechanism clock, not copied from a passing record.
const mechanismsFile = path.join(fixture.state, 'mechanisms.jsonl');
fs.writeFileSync(mechanismsFile, fs.readFileSync(mechanismsFile, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) {
  const item = JSON.parse(line);
  item.expires_at = '2000-01-01T00:00:00.000Z';
  return JSON.stringify(item);
}).join('\n') + '\n', 'utf8');
const expired = v.verdictFor('change-valid', v.readReuseIndex(fixture.state), { stateDir: fixture.state, repo: fixture.repo, decisionId: record.decision_id });
must(expired.effective_state === 'expired', 'expired mechanism must not remain closed');

console.log('verdict view tests passed: mechanism-status source, missing, legacy supersession, expiry');
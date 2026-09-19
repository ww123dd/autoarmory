'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtureHelper = require('./helpers/mechanism-fixture');
const recheck = require('../src/lib/mechanism-recheck');

function must(condition, message) { if (!condition) throw new Error(message); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-recheck-'));
const fixture = fixtureHelper.createFixture(root, 'recheck');
fixtureHelper.registerCaseAndMechanism(fixture);
const run = fixtureHelper.recordRun(fixture, 'run-recheck');
const closure = fixtureHelper.closeRun(fixture, run);
const record = fixtureHelper.reuseRecord(fixture, 'change-recheck', { run: run, closure: closure, expected_transition: 'COUNT->0' });
fixtureHelper.writeLock(fixture, { expected: 1 });
const report = recheck.recheck(fixture.state, { repo: fixture.repo, apply: true });
must(report.pending_written === 1 && report.rows[0].action === 'pending_written', 'stale mechanism must enqueue a registered-verifier recheck job');
const pendingFile = path.join(fixture.state, 'pending', 'change-recheck.json');
must(fs.existsSync(pendingFile), 'recheck must write pending job');
const job = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
must(job.verifier_id === 'fixture' && job.claim_instance && job.expected_provenance === 'pinned_verifier', 'recheck job must use the registered verifier and claim identity');
const again = recheck.recheck(fixture.state, { repo: fixture.repo, apply: true });
must(again.already_pending === 1 && again.pending_written === 0, 'recheck must be idempotent');
must(fs.existsSync(path.join(fixture.state, 'mechanism-recheck.jsonl')), 'recheck must audit its decisions');
console.log('mechanism recheck tests passed: stale registered verifier -> pending, claim identity required, idempotent');
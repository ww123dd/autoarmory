'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtureHelper = require('./helpers/mechanism-fixture');
const historical = require('../src/lib/historical-derived');
function must(condition, message) { if (!condition) throw new Error(message); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-historical-derived-'));
const fixture = fixtureHelper.createFixture(root, 'history');
fixtureHelper.registerCaseAndMechanism(fixture);
const run = fixtureHelper.recordRun(fixture, 'run-history');
const closure = fixtureHelper.closeRun(fixture, run);
fixtureHelper.reuseRecord(fixture, 'change-history', { run: run, closure: closure, expected_transition: 'COUNT->0' });
const report = historical.fromHistory(fixture.state);
must(report.count === 1 && report.candidates[0].candidate_transition === 'COUNT->0', 'closure-backed run must produce a derived transition');
must(report.candidates[0].source_strength === 'derived' && report.candidates[0].transition_source === 'historical_mechanism_run', 'historical candidate must cite the real mechanism run, not command text');
must(report.candidates[0].evidence_refs.indexOf('run-history') !== -1 && report.candidates[0].evidence_refs.indexOf(closure.id) !== -1, 'historical candidate must cite run and closure');
console.log('historical derived tests passed: mechanism run + closure -> derived transition');
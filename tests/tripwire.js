'use strict';
const path = require('path');
const tripwire = require('../src/lib/tripwire');
function must(condition, message) { if (!condition) throw new Error(message); }
const repo = path.resolve(__dirname, '..');
const vectors = path.join(repo, 'docs', 'evidence', 'tripwire-vectors-v1.json');
const report = tripwire.run(repo, vectors);
const project = report.verifiers.find(function (row) { return row.verifier_id === 'project-test-result'; });
must(project && project.passed === true, 'project-test-result must pass positive/negative/drift tripwires');
const bad = JSON.parse(JSON.stringify(require(vectors)));
bad.verifiers['project-test-result'].positive.expect_passed = false;
const badFile = path.join(require('os').tmpdir(), 'autoarmory-bad-tripwire-' + Date.now() + '.json');
require('fs').writeFileSync(badFile, JSON.stringify(bad), 'utf8');
const badReport = tripwire.run(repo, badFile);
must(badReport.ok === false && badReport.verifiers.find(function (row) { return row.verifier_id === 'project-test-result'; }).passed === false, 'known bad vector must fail tripwire');
console.log('tripwire tests passed: positive/negative/drift vectors and bad-vector trip');
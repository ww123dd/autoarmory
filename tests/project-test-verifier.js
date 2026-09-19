'use strict';
const path = require('path');
const verify = require('../src/lib/verify');
function must(condition, message) { if (!condition) throw new Error(message); }
const repo = path.resolve(__dirname, '..');
const positive = verify.captureRefs([{ id: 'project-test-positive', verifier: 'project-test-result', params: { instance: { command: 'node tests/jsonl-strict.js', cwd: '.' } } }], { repo: repo, trials: 3 });
must(positive.status === 'captured', 'project-test-result must capture a passing allowlisted test: ' + JSON.stringify(positive));
must(positive.refs[0].fresh.observed.passed === true && positive.refs[0].fresh.observed.exit_code === 0, 'project-test-result must report pass from exit_code');
const negative = verify.captureRefs([{ id: 'project-test-negative', verifier: 'project-test-result', params: { instance: { command: 'rm -rf production', cwd: '.' } } }], { repo: repo, trials: 1 });
must(negative.status === 'unverifiable', 'non-allowlisted command must be unverifiable');
console.log('project test verifier tests passed: allowlisted test captures pass; non-allowlisted command fails closed');
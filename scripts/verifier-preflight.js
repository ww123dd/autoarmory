#!/usr/bin/env node
'use strict';

// Verifier preflight: fail closed when any pinned verifier artifact is missing
// or changed, and independently exercise the known positive/negative checker
// vectors. This is intentionally not a report: failure exits 2 and blocks commit.

const path = require('path');
const { spawnSync } = require('child_process');
const verify = require('../src/lib/verify');

const repo = path.resolve(__dirname, '..');
const failures = [];

function run(args) {
  return spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', timeout: 60000, windowsHide: true });
}
function record(name, result, expected) {
  if (result.status !== expected) failures.push(name + ': exit ' + result.status + ', expected ' + expected + '; ' + String(result.stderr || result.stdout || '').trim().slice(0, 500));
  return result;
}

const inventory = verify.listVerifiers(repo);
if (!inventory.ok) failures.push('verifier inventory: ' + inventory.errors.join('; '));
for (const item of inventory.verifiers) {
  if (item.integrity !== true) failures.push('verifier integrity failed: ' + item.id + ' ' + JSON.stringify(item.checks));
}

const checker = path.join(repo, 'scripts', 'check-inc-real-02-500w-append.js');
const clean = record('checker-count-0', run([checker, '--count', '0', '--json']), 0);
const dirty = record('checker-count-1', run([checker, '--count', '1', '--json']), 1);
try {
  const cleanReport = JSON.parse(clean.stdout);
  if (!cleanReport.output || cleanReport.output.passed !== true || cleanReport.exit_code !== 0) failures.push('checker-count-0 did not emit a passing report');
} catch (error) { failures.push('checker-count-0 JSON: ' + error.message); }
try {
  const dirtyReport = JSON.parse(dirty.stdout);
  if (!dirtyReport.output || dirtyReport.output.passed !== false || dirtyReport.exit_code !== 1) failures.push('checker-count-1 did not emit a failing report');
} catch (error) { failures.push('checker-count-1 JSON: ' + error.message); }

record('verification-tests', run([path.join(repo, 'tests', 'verification.js')]), 0);
record('checker-tests', run([path.join(repo, 'tests', 'inc-real-02-checker.js')]), 0);

if (failures.length) {
  process.stderr.write('VERIFIER_PREFLIGHT_BLOCK\n' + failures.join('\n') + '\n');
  process.exit(2);
}
process.stdout.write('verifier preflight passed: pinned artifacts intact, checker positive/negative vectors pass, verifier tests pass\n');

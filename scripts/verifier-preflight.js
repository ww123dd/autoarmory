#!/usr/bin/env node
'use strict';

// Verifier rreflight: fail closed when any pinned verifier artifact is missing
// or changed, and independently exercise the known positive/negative checker
// vectors. This is intentionally not a report: failure exits 2 and blocks commit.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const verify = require('../src/lib/verify');

const repo = path.resolve(__dirname, '..');
const failures = [];
if (!fs.existsSync(path.join(repo, 'verifiers.lock.json'))) {
  process.stdout.write('verifier preflight: no active local verifier profile\n');
  process.exit(0);
}

function run(args) {
  return spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', timeout: 60000, windowsHide: true });
}
function record(name, result, expected) {
  if (result.status !== expected) failures.push(name + ': exit ' + result.status + ', expected ' + expected + '; ' + String(result.stderr || result.stdout || '').trim().slice(0, 500));
  return result;
}

const guardCorePath = process.env.AUTOARMORY_GUARD_CORE || path.join(os.homedir(), '.codex', 'hooks', 'guard-core.js');
try {
  const guard = require(guardCorePath);
  if (typeof guard.verifierLockStatus !== 'function') failures.push('external verifier lock anchor unavailable: guard-core has no verifierLockStatus');
  else {
    const lockStatus = guard.verifierLockStatus();
    if (!lockStatus.ok) failures.push('external verifier lock anchor mismatch: ' + (lockStatus.error || ('expected ' + String(lockStatus.expected).slice(0, 12) + ', actual ' + String(lockStatus.actual).slice(0, 12))));
  }
} catch (error) {
  failures.push('external verifier lock anchor unavailable: ' + error.message);
}
record('verifier-manifest', run([path.join(repo, 'scripts', 'verifier-manifest.js'), '--json']), 0);
const lockFile = path.join(repo, 'verifiers.lock.json');
let declaredVerifiers = [];
try { declaredVerifiers = JSON.parse(fs.readFileSync(lockFile, 'utf8')).verifiers || []; } catch (error) { failures.push('verifier profile unreadable: ' + error.message); }
const localOnlyPins = [];
for (const item of declaredVerifiers) {
  if (typeof item.version !== 'string' || !item.version) failures.push('verifier declares no human-readable version: ' + item.id);
  if (item.invocation_contract_version !== verify.INVOCATION_CONTRACT) failures.push('verifier invocation contract mismatch: ' + item.id + ' declares ' + String(item.invocation_contract_version) + ', expected ' + verify.INVOCATION_CONTRACT);
  for (const relative of [item.adapter].concat(item.bridge && item.bridge.adapter ? [item.bridge.adapter] : [])) {
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', relative], { cwd: repo, encoding: 'utf8', windowsHide: true });
    const notARepo = /not a git repository/i.test(String(tracked.stderr || ''));
    if (!tracked.error && !notARepo && tracked.status !== 0) localOnlyPins.push(item.id + ' -> ' + relative);
  }
}

// TUF lesson: the trust root expires. There is deliberately no expiry override flag.
const anchorFile = process.env.AUTOARMORY_LOCK_ANCHOR || path.join(os.homedir(), '.codex', 'hooks', 'verifier-lock.sha256');
const anchorMeta = anchorFile + '.meta.json';
if (fs.existsSync(anchorMeta)) {
  try {
    const meta = JSON.parse(fs.readFileSync(anchorMeta, 'utf8'));
    if (meta.rotate_by && Date.parse(meta.rotate_by) < Date.now()) failures.push('verifier trust root expired on ' + meta.rotate_by + '; review the change and re-pin it (node scripts/verifier-pin.js)');
  } catch (error) { failures.push('verifier trust root metadata unreadable: ' + error.message); }
} else {
  process.stdout.write('verifier preflight: no anchor lifetime stamped yet; run node scripts/verifier-pin.js\n');
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
process.stdout.write('verifier preflight passed: pinned artifacts intact, runner identity declared for ' + declaredVerifiers.length + ' verifier(s), checker positive/negative vectors pass, verifier tests pass' + (localOnlyPins.length ? '; local-only pins (not reproducible from a clone): ' + localOnlyPins.join(', ') : '') + '\n');

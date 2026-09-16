#!/usr/bin/env node
'use strict';

// Run a committed verifier profile in a sandbox, so the repository alone is enough
// to judge with it.
//
// The machine-local trust root (verifiers.lock.json) is gitignored on purpose: it
// pins this machine's absolute paths and live facts. A profile that travels with the
// repository therefore has to be runnable somewhere else, which means:
//
//   1. portability gate   - every referenced path is relative and stays inside the repo;
//   2. sandbox            - the profile and its artifacts are copied to a temp repo,
//                           nothing local is read or written;
//   3. shape requirement  - the run must produce at least one PASS and at least one
//                           FAIL, so a reader sees the checker both accept and reject.
//
// usage: node scripts/profile-run.js [--profile examples/profiles/portable.profile.json]
//                                    [--json] [--keep]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PROFILE = path.join('examples', 'profiles', 'portable.profile.json');
const ABSOLUTE = /^([A-Za-z]:[\\/]|\\\\|\/)/;

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] && process.argv[index + 1].indexOf('--') !== 0 ? process.argv[index + 1] : fallback;
}
function flag(name) { return process.argv.indexOf(name) >= 0; }
function fail(reason) {
  if (flag('--json')) process.stdout.write(JSON.stringify({ ok: false, reason: reason }, null, 2) + '\n');
  else process.stderr.write('profile run blocked: ' + reason + '\n');
  process.exit(2);
}
function copyInto(sandbox, relative) {
  const source = path.resolve(ROOT, relative);
  const target = path.resolve(sandbox, relative);
  if (source !== ROOT && source.indexOf(ROOT + path.sep) !== 0) fail('path escapes the repository: ' + relative);
  if (!fs.existsSync(source)) fail('referenced artifact is missing: ' + relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

const profileRelative = arg('--profile', DEFAULT_PROFILE);
const profilePath = path.resolve(ROOT, profileRelative);
if (!fs.existsSync(profilePath)) fail('profile not found: ' + profileRelative);

let profile;
try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')); } catch (error) { fail('profile is not JSON: ' + error.message); }
if (profile.schema_version !== 'autoarmory/verifiers-lock/v1') fail('unexpected schema_version: ' + profile.schema_version);
if (!Array.isArray(profile.verifiers) || profile.verifiers.length === 0) fail('profile declares no verifiers');

// 1. portability gate: a profile that travels cannot reference this machine.
const portability = [];
for (const item of profile.verifiers) {
  const server = (item.bridge && item.bridge.server) || {};
  const referenced = [item.adapter, item.bridge && item.bridge.adapter, server.path, server.root, server.config, server.entry].filter(function (value) { return typeof value === 'string' && value; });
  for (const value of referenced) {
    if (ABSOLUTE.test(value) || value.split(/[\\/]/).indexOf('..') !== -1) portability.push({ id: item.id, path: value });
  }
}
if (portability.length) fail('profile is not portable: ' + portability.map(function (entry) { return entry.id + ' -> ' + entry.path; }).join('; '));

// 2. sandbox: copy the profile and everything it names, then judge there.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-profile-run-'));
try {
  const lockTarget = path.join(sandbox, 'verifiers.lock.json');
  fs.writeFileSync(lockTarget, JSON.stringify(profile, null, 2) + '\n', 'utf8');
  for (const item of profile.verifiers) {
    const server = (item.bridge && item.bridge.server) || {};
    copyInto(sandbox, item.adapter);
    if (item.bridge && item.bridge.adapter) copyInto(sandbox, item.bridge.adapter);
    if (typeof server.path === 'string' && server.path) copyInto(sandbox, server.path);
  }

  const entries = [];
  for (const item of profile.verifiers) {
    const adapter = path.resolve(sandbox, item.adapter);
    const payload = { ref: { id: item.id + '-ref', verifier: item.id, params: {} }, case_id: null, mechanism_id: null, run_id: 'profile-run-' + item.id };
    const run = spawnSync(process.execPath, [adapter, '--json'], {
      cwd: sandbox,
      encoding: 'utf8',
      input: JSON.stringify(payload),
      timeout: item.timeout_ms || 60000,
      windowsHide: true,
      env: Object.assign({}, process.env, { AUTOARMOR_REPO: sandbox })
    });
    let report = null;
    try { report = JSON.parse(String(run.stdout || '').trim()); } catch (_) {}
    if (!report || report.ok !== true) {
      entries.push({ id: item.id, derived: false, reason: (report && report.reason) || String(run.stderr || run.stdout || run.status).slice(0, 200) });
      continue;
    }
    entries.push({
      id: item.id,
      derived: true,
      statement: item.statement,
      passed: report.passed === true,
      exit_code: report.exit_code,
      observed: report.observed,
      counterexample: report.counterexample || null,
      runner_sha256: report.runner ? report.runner.runner_sha256 : null
    });
  }

  // 3. shape: both verdicts have to show up, and every fact has to be re-derived.
  const declined = entries.filter(function (entry) { return entry.derived !== true; });
  const passes = entries.filter(function (entry) { return entry.derived === true && entry.passed === true; });
  const fails = entries.filter(function (entry) { return entry.derived === true && entry.passed !== true; });
  const report = {
    schema_version: 'autoarmory/profile-run/v1',
    profile: profileRelative,
    sandbox: flag('--keep') ? sandbox : null,
    verifiers: entries.length,
    re_derived: entries.length - declined.length,
    pass: passes.length,
    fail: fails.length,
    shape_ok: declined.length === 0 && passes.length >= 1 && fails.length >= 1,
    entries: entries.map(function (entry) {
      return {
        id: entry.id,
        derived: entry.derived,
        verdict: entry.derived ? (entry.passed ? 'PASS' : 'FAIL') : 'UNVERIFIABLE',
        exit_code: entry.exit_code === undefined ? null : entry.exit_code,
        observed: entry.observed === undefined ? null : entry.observed,
        reason: entry.reason || null
      };
    })
  };

  if (flag('--json')) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else {
    process.stdout.write('profile run: ' + profileRelative + '\n');
    for (const entry of report.entries) {
      const detail = entry.verdict === 'UNVERIFIABLE' ? entry.reason : (entry.observed && entry.observed.sha256 ? 'sha256=' + String(entry.observed.sha256).slice(0, 12) + '...' : 'exit=' + entry.exit_code);
      process.stdout.write('  ' + entry.verdict.padEnd(13) + entry.id + '  ' + detail + '\n');
    }
    process.stdout.write('  pass=' + report.pass + ' fail=' + report.fail + ' (a profile must show both: a checker that only passes is unproven)\n');
  }
  if (declined.length) fail('a fact could not be re-derived: ' + declined.map(function (entry) { return entry.id; }).join(', '));
  if (!report.shape_ok) fail('expected at least one PASS and one FAIL, saw pass=' + passes.length + ' fail=' + fails.length);
  process.exit(0);
} finally {
  if (!flag('--keep')) fs.rmSync(sandbox, { recursive: true, force: true });
}
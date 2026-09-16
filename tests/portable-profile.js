'use strict';

// Acceptance test for the profile that travels with the repository.
//
// A stranger has to be able to judge with this repository alone, which means:
//   - the committed profile runs in a sandbox without any local state;
//   - the run produces both a PASS and a FAIL verdict, so the checker is shown to
//     accept and to reject instead of only agreeing with itself;
//   - the verdict follows the bytes: changing an expectation flips that verdict;
//   - a profile with no failing entry is refused (a checker that only passes is unproven).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(ROOT, 'scripts', 'profile-run.js');
const PROFILE = path.join(ROOT, 'examples', 'profiles', 'portable.profile.json');
const LOCAL_LOCK = path.join(ROOT, 'verifiers.lock.json');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-portable-profile-'));

function must(condition, message) { if (!condition) throw new Error(message); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function run(profile) {
  const result = spawnSync(process.execPath, [RUNNER, '--json', '--profile', profile], { cwd: ROOT, encoding: 'utf8', timeout: 120000, windowsHide: true });
  let report = null;
  try { report = JSON.parse(String(result.stdout || '').trim()); } catch (_) {}
  return { status: result.status, report: report, stdout: result.stdout, stderr: result.stderr };
}
function entryOf(report, id) { return report.entries.filter(function (entry) { return entry.id === id; })[0] || null; }

must(fs.existsSync(PROFILE), 'examples/profiles/portable.profile.json must exist');
const profile = JSON.parse(fs.readFileSync(PROFILE, 'utf8'));
const localLockBefore = fs.existsSync(LOCAL_LOCK) ? sha256(LOCAL_LOCK) : null;
const headBefore = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const statusBefore = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout;

// 1. the committed profile runs and shows both verdicts.
const clean = run(PROFILE);
must(clean.status === 0, 'committed portable profile must run clean: ' + String(clean.stderr || clean.stdout).slice(0, 300));
must(clean.report && clean.report.shape_ok === true, 'clean run must report shape_ok');
must(clean.report.re_derived === clean.report.verifiers, 'every portable fact must be re-derived, not skipped');
must(clean.report.pass >= 1 && clean.report.fail >= 1, 'clean run must show at least one PASS and one FAIL');
const negative = entryOf(clean.report, 'portable-negative-control-sha256');
must(negative && negative.verdict === 'FAIL' && negative.exit_code === 1, 'the content negative control must fail');
const repoCommit = entryOf(clean.report, 'portable-repo-commit-exists');
must(repoCommit && repoCommit.verdict === 'PASS', 'the repository commit must be found in the clone that runs the profile');
must(repoCommit.observed && repoCommit.observed.exists === true, 'the repository commit fact must report exists:true');
const missingCommit = entryOf(clean.report, 'portable-negative-commit-missing');
must(missingCommit && missingCommit.verdict === 'FAIL' && missingCommit.observed && missingCommit.observed.exists === false, 'an all-zero commit control must fail');

// 2. the profile is portable and fully pinned to the committed bytes.
const text = fs.readFileSync(PROFILE, 'utf8');
must(!/[A-Za-z]:[\\/]/.test(text.replace(/\\\//g, '/')) && text.indexOf('/Users/') === -1 && text.indexOf('/home/') === -1, 'portable profile must not name machine-local paths');
for (const item of profile.verifiers) {
  must(sha256(path.join(ROOT, item.adapter)) === item.adapter_sha256, item.id + ': adapter_sha256 must match the committed adapter');
  must(sha256(path.join(ROOT, item.bridge.adapter)) === item.bridge.adapter_sha256, item.id + ': bridge digest must match the committed bridge');
  const negativeId = item.id.indexOf('negative') !== -1;
  if (item.bridge.server.path) {
    const target = item.bridge.server.path;
    const actual = sha256(path.join(ROOT, target));
    if (negativeId) must(actual !== item.bridge.server.sha256, item.id + ': a negative control must pin a digest the bytes do not have');
    else must(actual === item.bridge.server.sha256, item.id + ': pinned target digest must match ' + target);
  } else if (item.bridge.server.commit) {
    must(item.bridge.server.repo === '.', item.id + ': a repository fact must target the clone it runs in (repo: ".")');
    const exists = spawnSync('git', ['cat-file', '-e', item.bridge.server.commit + '^{commit}'], { cwd: ROOT, encoding: 'utf8' }).status === 0;
    if (negativeId) must(exists === false, item.id + ': a negative control must pin a commit the repository does not have');
    else must(exists === true, item.id + ': a positive repository fact must pin a commit the repository has');
  }
}

// 3. the verdict follows the bytes: flipping a positive expectation flips its verdict.
const flipped = JSON.parse(JSON.stringify(profile));
const positive = flipped.verifiers.filter(function (item) { return item.id === 'portable-bridge-self-sha256'; })[0];
must(positive, 'expected a positive entry to flip');
positive.bridge.server.sha256 = 'f'.repeat(64);
const flippedFile = path.join(work, 'flipped.profile.json');
fs.writeFileSync(flippedFile, JSON.stringify(flipped, null, 2) + '\n', 'utf8');
const flippedRun = run(flippedFile);
must(flippedRun.report, 'flipped profile must still run: ' + String(flippedRun.stderr || flippedRun.stdout).slice(0, 300));
const flippedEntry = entryOf(flippedRun.report, 'portable-bridge-self-sha256');
must(flippedEntry && flippedEntry.verdict === 'FAIL', 'a changed expectation must flip the verdict, not be ignored');

// 4. a profile that only passes is refused.
const allPass = JSON.parse(JSON.stringify(profile));
allPass.verifiers.filter(function (item) { return item.id === 'portable-negative-control-sha256'; })[0].bridge.server.sha256 = sha256(path.join(ROOT, 'examples', 'adapters', 'file-sha256', 'bridge.js'));
allPass.verifiers.filter(function (item) { return item.id === 'portable-negative-commit-missing'; })[0].bridge.server.commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const allPassFile = path.join(work, 'all-pass.profile.json');
fs.writeFileSync(allPassFile, JSON.stringify(allPass, null, 2) + '\n', 'utf8');
const allPassRun = run(allPassFile);
must(allPassRun.status !== 0, 'a profile with no failing entry must be refused');
const refusal = String(allPassRun.stdout || '') + String(allPassRun.stderr || '');
must(/at least one PASS and one FAIL/.test(refusal), 'refusal must name the shape rule: ' + refusal.slice(0, 200));

// 5. running a portable profile must not touch the machine-local trust root.
const localLockAfter = fs.existsSync(LOCAL_LOCK) ? sha256(LOCAL_LOCK) : null;
must(localLockBefore === localLockAfter, 'portable profile runs must not modify the machine-local trust root');
must(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim() === headBefore, 'a portable run must not move the checkout HEAD');
must(spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout === statusBefore, 'a portable run must not change the checkout state');

console.log('portable profile tests passed: sandbox run, pass=' + clean.report.pass + ' fail=' + clean.report.fail + ' (repo commit found, both controls fail), expectation change flips the verdict, all-pass profile refused, trust root + checkout untouched');
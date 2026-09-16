#!/usr/bin/env node
'use strict';

// 1.0 acceptance, checked mechanically.
//
// Each line of docs/roadmap.md "## 1.0 (acceptance)" must be checkable without a human
// reading prose. This prints one PASS/FAIL per criterion and exits non-zero on any FAIL.
//
// usage: node scripts/acceptance-check.js [--json]

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const flags = new Set(process.argv.slice(2).filter(function (value) { return value.indexOf('--') === 0; }));
const asJson = flags.has('--json');
const results = [];

function record(id, ok, detail) { results.push({ id: id, ok: !!ok, detail: detail }); }
function run(script, args, options) {
  const result = cp.spawnSync(process.execPath, [script].concat(args || []), { cwd: ROOT, encoding: 'utf8', windowsHide: true, env: Object.assign({}, process.env, (options && options.env) || {}) });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function tracked(relative) {
  return cp.spawnSync('git', ['ls-files', '--error-unmatch', relative], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).status === 0;
}

// 1. a stranger can clone and get PASS and FAIL verdicts offline
try {
  const profilePath = 'examples/profiles/portable.profile.json';
  const profileOk = fs.existsSync(path.join(ROOT, profilePath)) && tracked(profilePath);
  const runResult = run(path.join(ROOT, 'scripts', 'profile-run.js'), ['--json']);
  const report = JSON.parse(runResult.out);
  const shapeOk = runResult.code === 0 && report.shape_ok === true && report.re_derived === report.verifiers && report.pass >= 1 && report.fail >= 1;
  record('portable-profile', profileOk && shapeOk, 'facts=' + report.verifiers + ' pass=' + report.pass + ' fail=' + report.fail + ' tracked=' + profileOk);
} catch (error) {
  record('portable-profile', false, String(error.message).slice(0, 160));
}

// 2. external anchors from at least three channels re-verify (offline, from vendored bytes)
try {
  const dir = path.join(ROOT, 'examples', 'anchors');
  const records = fs.readdirSync(dir).filter(function (name) { return name.endsWith('.provenance.json'); }).map(function (name) { return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); });
  const channels = new Set(records.map(function (item) { return item.publisher; }));
  let verified = 0;
  for (const item of records) {
    const bytes = fs.readFileSync(path.join(ROOT, item.artifact));
    let digest;
    if (item.algorithm === 'git-blob-sha1') digest = cp.execFileSync('git', ['hash-object', '--stdin'], { cwd: ROOT, input: bytes, maxBuffer: 1e7 }).toString().trim();
    else digest = require('crypto').createHash(item.algorithm).update(bytes).digest(item.encoding);
    if (digest === item.published_digest) verified += 1;
  }
  record('external-anchors', channels.size >= 3 && verified === records.length, 'channels=' + channels.size + ' records=' + records.length + ' verified=' + verified);
} catch (error) {
  record('external-anchors', false, String(error.message).slice(0, 160));
}

// 3 + 4. freshness metrics from the mechanism preflight
try {
  const preflight = run(path.join(ROOT, 'scripts', 'mechanism-preflight.js'));
  const text = String(preflight.out || '') + String(preflight.err || '');
  if (/no mechanism state/.test(text)) {
    record('stale-verdict-escapes', true, 'no mechanism state in this checkout; nothing can escape');
    record('stale-lifecycle-escapes', true, 'no mechanism state in this checkout; nothing can escape');
  } else {
    const verdictMatch = text.match(/stale_verdict_escape_count=(\d+)/);
    const lifeMatch = text.match(/stale_lifecycle_escape_count=(\d+)/);
    record('stale-verdict-escapes', preflight.code === 0 && verdictMatch && verdictMatch[1] === '0', 'exit=' + preflight.code + ' ' + (verdictMatch ? 'count=' + verdictMatch[1] : 'metric missing'));
    record('stale-lifecycle-escapes', preflight.code === 0 && lifeMatch && lifeMatch[1] === '0', 'exit=' + preflight.code + ' ' + (lifeMatch ? 'count=' + lifeMatch[1] : 'metric missing'));
  }
} catch (error) {
  record('stale-verdict-escapes', false, String(error.message).slice(0, 160));
  record('stale-lifecycle-escapes', false, String(error.message).slice(0, 160));
}

// 5. the operator loop needs exactly one human decision and no hand-written JSON
try {
  const loop = run(path.join(ROOT, 'tests', 'operator-loop.js'));
  const line = String(loop.out || '').trim();
  record('operator-loop', loop.code === 0 && /operator-decisions=1/.test(line), line.split('\n').slice(-1)[0].slice(0, 160));
} catch (error) {
  record('operator-loop', false, String(error.message).slice(0, 160));
}

// 6. the shipped surface claims nothing it does not do
try {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').toLowerCase();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const help = run(path.join(ROOT, 'bin', 'autoarmory.js'), ['--help']).out;
  const forbidden = /cross-vendor|capability control plane|vendor-neutral/;
  const clean = !forbidden.test(readme) && !forbidden.test(String(pkg.description || '').toLowerCase()) && !/\bserve\b/i.test(help);
  const nonGoals = fs.existsSync(path.join(ROOT, 'docs', 'non-goals.md'));
  record('no-unimplemented-claims', clean && nonGoals, 'readme-clean=' + !forbidden.test(readme) + ' serve-hidden=' + !/\bserve\b/i.test(help) + ' non-goals=' + nonGoals);
} catch (error) {
  record('no-unimplemented-claims', false, String(error.message).slice(0, 160));
}

const passed = results.filter(function (item) { return item.ok; }).length;
const report = { schema_version: 'autoarmory/acceptance/v1', generated_at: new Date().toISOString(), criteria: results.length, passed: passed, failed: results.length - passed, results: results };
if (asJson) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
else {
  process.stdout.write('1.0 acceptance check\n');
  for (const item of results) process.stdout.write('  ' + (item.ok ? 'PASS' : 'FAIL') + '  ' + item.id.padEnd(24) + item.detail + '\n');
  process.stdout.write('  criteria=' + report.criteria + ' passed=' + report.passed + ' failed=' + report.failed + '\n');
}
process.exit(report.failed ? 1 : 0);
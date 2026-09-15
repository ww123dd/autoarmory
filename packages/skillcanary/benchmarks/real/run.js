'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const cli = path.join(root, 'bin', 'skillcanary.js');
const file = path.resolve(process.argv[2] || path.join(__dirname, 'cases.json'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skillcanary-real-'));

function expand(value) {
  return String(value).replace(/\{root\}/g, root).replace(/\{tmp\}/g, temp);
}

function runCase(testCase) {
  const spec = testCase.run;
  if (!spec || spec.type !== 'cli') return { code: 2, out: '', err: 'missing cli run spec' };
  const args = (spec.args || []).map(expand);
  const result = spawnSync(process.execPath, [cli].concat(args), {
    cwd: spec.cwd ? path.resolve(root, expand(spec.cwd)) : root,
    encoding: 'utf8',
    env: Object.assign({}, process.env, spec.env || {})
  });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = [];
for (const testCase of data.cases || []) {
  const result = runCase(testCase);
  const expected = Number(testCase.run && testCase.run.expect_exit);
  rows.push({
    id: testCase.id,
    expected,
    actual: result.code,
    ok: result.code === expected,
    stdout: result.out.trim().split(/\r?\n/).slice(-2).join('\n'),
    stderr: result.err.trim().split(/\r?\n/).slice(-2).join('\n')
  });
}

const failed = rows.filter(function (row) { return !row.ok; });
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ total: rows.length, passed: rows.length - failed.length, failed: failed.length, cases: rows }, null, 2) + '\n');
} else {
  process.stdout.write('# SkillCanary real regression benchmark\n\n');
  process.stdout.write('| Case | Expected | Actual | Result |\n|---|---:|---:|---|\n');
  for (const row of rows) process.stdout.write('| ' + row.id + ' | ' + row.expected + ' | ' + row.actual + ' | ' + (row.ok ? 'PASS' : 'FAIL') + ' |\n');
  process.stdout.write('\nTotal: ' + rows.length + ' | Passed: ' + (rows.length - failed.length) + ' | Failed: ' + failed.length + '\n');
  for (const row of failed) process.stdout.write('\nFAIL ' + row.id + '\n' + row.stdout + '\n' + row.stderr + '\n');
}

process.exit(failed.length ? 1 : 0);
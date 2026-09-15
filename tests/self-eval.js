'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-self-eval-'));

function run(args) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8', timeout: 120000 });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function must(condition, message) {
  if (!condition) { console.error('FAIL: ' + message); process.exit(1); }
}

const output = path.join(temp, 'self-eval.json');
let result = run(['self-eval', '--runs', '1', '--output', output, '--json']);
must(result.code === 0 && fs.existsSync(output), 'self-eval command');
const report = JSON.parse(fs.readFileSync(output, 'utf8'));
must(report.schema_version === 'autoarmory/self-eval/v1', 'self-eval schema');
must(report.independence.independent === false && /self/i.test(report.independence.note), 'self-eval must disclose self-assessment bias');
must(report.checks.some(function (item) { return item.id === 'tests' && item.pass_k === true; }), 'self-eval must run Pass^k tests');
must(report.checks.some(function (item) { return item.id === 'conformance' && item.ok === true; }), 'self-eval must run conformance');
must(typeof report.score.total === 'number' && report.score.total >= 0 && report.score.total <= 100, 'self-eval score range');

console.log('Self-evaluation tests passed');
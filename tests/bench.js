'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-bench-'));
const output = path.join(temp, 'bench.md');

function run(args) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function must(condition, message) {
  if (!condition) { console.error('FAIL: ' + message); process.exit(1); }
}

let result = run(['bench', '--seed', '11', '--output', output, '--json']);
must(result.code === 0 && fs.existsSync(output), 'bench command');
const report = JSON.parse(result.out);
must(report.schema_version === 'autoarmory/capability-routing-bench/v1', 'bench schema');
must(report.synthetic === true && /synthetic/i.test(report.note), 'bench must label synthetic evidence');
must(report.strategies.length === 3 && report.strategies.some(function (item) { return item.id === 'autoarmory'; }), 'bench strategies');
must(report.strategies.some(function (item) { return item.id === 'autoarmory' && item.metrics.safety_violations === 0; }), 'AutoArmory routing must avoid safety violations');
const auto = report.strategies.find(function (item) { return item.id === 'autoarmory'; });
must(auto.metrics.policy_compliance_rate === 1 && auto.metrics.success_rate_when_executed === 1 && auto.metrics.safe_refusals === 2, 'bench must score safe refusal separately from execution success');
must(report.recommendation && report.recommendation.length > 0, 'bench recommendation');

console.log('Capability routing bench tests passed');
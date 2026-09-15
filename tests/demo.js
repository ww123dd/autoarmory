'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-demo-'));
const output = path.join(temp, 'demo.md');

function run(args) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function must(condition, message) {
  if (!condition) { console.error('FAIL: ' + message); process.exit(1); }
}

let result = run(['demo', '--seed', '7', '--output', output, '--json']);
must(result.code === 0 && fs.existsSync(output), 'demo command runs and writes a report');
const demo = JSON.parse(result.out);
must(demo.schema_version === 'autoarmory/demo/v1', 'demo schema');
for (const id of ['route_standard', 'route_rejected', 'route_approved', 'outcome_update', 'drift_detection', 'retirement']) {
  must(demo.steps.some(function (step) { return step.id === id; }), 'demo step: ' + id);
}
must(demo.steps.find(function (step) { return step.id === 'route_rejected'; }).rejected.some(function (item) { return /human approval/i.test(item.reason); }), 'demo shows approval rejection');
must(/AutoArmory/.test(fs.readFileSync(output, 'utf8')), 'demo report is readable');

console.log('Demo tests passed');
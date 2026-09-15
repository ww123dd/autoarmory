'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-scenario-'));
const state = path.join(temp, '.selfforge');
fs.mkdirSync(state, { recursive: true });

function run(args, input) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8', input: input });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function must(condition, message) {
  if (!condition) { console.error('FAIL: ' + message); process.exit(1); }
}

let result = run(['scenario', 'list', '--json']);
must(result.code === 0, 'scenario list');
const list = JSON.parse(result.out);
for (const id of ['coding', 'support', 'research']) must(list.some(function (item) { return item.id === id; }), 'scenario profile: ' + id);

result = run(['scenario', 'show', 'coding', '--json']);
const coding = JSON.parse(result.out);
must(coding.hard_gates && coding.hard_gates.length > 0 && coding.required_capabilities.indexOf('run-agent-eval') !== -1, 'coding scenario contract');

result = run(['scenario', 'plan', 'coding', '--state', state, '--json']);
const plan = JSON.parse(result.out);
must(plan.missing.indexOf('run-agent-eval') !== -1 && plan.ready === false, 'scenario plan reports missing capabilities');

console.log('Scenario profile tests passed');
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-integrate-'));
const state = path.join(temp, '.selfforge');

function run(args) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function must(condition, message) {
  if (!condition) { console.error('FAIL: ' + message); process.exit(1); }
}
function write(name, value) {
  const file = path.join(temp, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

let result = run(['integrate', 'list', '--json']);
must(result.code === 0, 'integrate list');
const list = JSON.parse(result.out);
for (const id of ['skillgrade', 'promptfoo', 'sarif', 'contextforge', 'otel']) {
  must(list.some(function (item) { return item.id === id; }), 'integration adapter: ' + id);
}

const skillgrade = write('skillgrade.json', {
  tests: [
    { case_id: 'c1', before: { pass: 0, total: 3 }, after: { pass: 3, total: 3 } },
    { case_id: 'c2', before: { pass: 0, total: 3 }, after: { pass: 1, total: 3 }, error: 'expected PASS' }
  ]
});
result = run(['integrate', 'import', 'skillgrade', skillgrade, '--state', state, '--json']);
must(result.code === 0 && /runner.skillgrade/.test(result.out) && /inc-/.test(result.out), 'import skillgrade');

const sarif = write('scan.sarif', {
  version: '2.1.0',
  runs: [{ results: [{ ruleId: 'security/hardcoded-secret', level: 'error', message: { text: 'hardcoded secret' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/a.js' } } }] }] }]
});
result = run(['integrate', 'import', 'sarif', sarif, '--state', state, '--json']);
must(result.code === 0 && /scanner.sarif/.test(result.out) && /security_finding/.test(result.out), 'import sarif');

const contextforge = write('contextforge.json', {
  servers: [{ id: 'github', name: 'GitHub MCP', transport: 'stdio', permissions: { read: true, write: false, network: true } }]
});
result = run(['integrate', 'import', 'contextforge', contextforge, '--state', state, '--json']);
must(result.code === 0 && /mcp.contextforge/.test(result.out), 'import contextforge');

const otel = write('trace.json', { resourceSpans: [{ scopeSpans: [{ spans: [{ name: 'invoke_agent', status: { code: 2 }, attributes: [{ key: 'gen_ai.tool.name', value: { stringValue: 'lookup' } }, { key: 'error.type', value: { stringValue: 'tool not found' } }] }] }] }] });
result = run(['integrate', 'import', 'otel', otel, '--state', state, '--json']);
must(result.code === 0 && /tool_selection_error/.test(result.out), 'import otel');

console.log('Integration import tests passed');
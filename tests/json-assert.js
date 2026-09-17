'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const bridge = path.resolve(__dirname, '..', 'examples', 'adapters', 'json-assert', 'bridge.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-json-assert-'));
const file = path.join(temp, 'report.json');
fs.writeFileSync(file, JSON.stringify({ summary: { passed: 1, failed: 0 }, rows: [{ ok: true }] }), 'utf8');
function run(payload) { const result = spawnSync(process.execPath, [bridge], { input: JSON.stringify(payload), encoding: 'utf8' }); return { code: result.status, out: result.stdout || '', err: result.stderr || '' }; }
function must(condition, message) { if (!condition) throw new Error(message); }
function observed(payload) { const result = run(payload); must(result.code === 0, 'bridge must exit 0: ' + result.err); return JSON.parse(result.out).observed; }
must(observed({ server: { path: file, assertion: { path: 'summary.failed', op: 'eq', value: 0 } } }).passed === true, 'failed=0 must pass');
must(observed({ server: { path: file, assertion: { path: 'summary.failed', op: 'eq', value: 1 } } }).passed === false, 'failed=1 must fail');
must(observed({ server: { path: file, assertion: { path: 'rows[0].ok', op: 'eq', value: true } } }).passed === true, 'array path must resolve');
must(observed({ server: { path: path.join(temp, 'missing.json'), assertion: { path: 'ok', op: 'exists' } } }).exists === false, 'missing file must be reported, not guessed');
must(observed({ server: {} }).passed === false, 'empty server must fail closed');
console.log('json assert tests passed: eq, array path, missing file and empty config fail closed');
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
function must(condition, message) { if (!condition) throw new Error(message); }
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-validation-exec-'));
const tests = path.join(temp, 'tests');
fs.mkdirSync(tests, { recursive: true });
fs.writeFileSync(path.join(tests, 'smoke.js'), "console.log('smoke-ok')\n", 'utf8');
const state = path.join(temp, 'state');
const script = path.resolve(__dirname, '..', 'scripts', 'validation-exec.js');
const result = spawnSync(process.execPath, [script, '--state', state, '--link-decision', 'route-validation', '--', process.execPath, 'tests/smoke.js'], { cwd: temp, encoding: 'utf8' });
must(result.status === 0 && /stdout_sha256/.test(result.stdout), 'validation command must run and return its structured exec-record');
const records = fs.readFileSync(path.join(state, 'exec-records.jsonl'), 'utf8').trim().split(/\r?\n/).map(function (line) { return JSON.parse(line); });
must(records.length === 1 && records[0].decision_id === 'route-validation', 'validation command must be linked to a decision');
must(/^[a-f0-9]{64}$/.test(records[0].output.stdout_sha256), 'validation output must be stored as a hash');
must(records[0].outcome === 'success' && records[0].exit_code === 0, 'structured outcome must be recorded');
console.log('validation exec tests passed: validation command routed through exec-record with exit_code and stdout hash');
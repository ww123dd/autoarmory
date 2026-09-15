'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const checker = path.join(__dirname, '..', 'scripts', 'check-inc-real-02-500w-append.js');
function run(args) { const result = spawnSync(process.execPath, [checker].concat(args), { encoding: 'utf8' }); return { code: result.status, out: result.stdout || '', err: result.stderr || '' }; }
function must(condition, message) { if (!condition) throw new Error(message); }
let result = run(['--count', '0', '--json']);
must(result.code === 0 && JSON.parse(result.out).exit_code === 0 && JSON.parse(result.out).counterexample.observed === 0, 'count=0 must pass');
result = run(['--count', '1', '--json']);
must(result.code === 1 && JSON.parse(result.out).exit_code === 1 && JSON.parse(result.out).counterexample.observed === 1, 'count>0 must fail');
result = run([]);
must(result.code === 2, 'missing count must be usage error');
console.log('inc-real-02 checker tests passed: zero=PASS, positive=FAIL, missing=usage');
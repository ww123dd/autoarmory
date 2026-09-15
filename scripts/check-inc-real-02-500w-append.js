#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const os = require('os');

function canonicalize(value) { if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonicalize(value[key]); }).join(',') + '}'; return JSON.stringify(value); }
function sha256(value) { return crypto.createHash('sha256').update(canonicalize(value)).digest('hex'); }
const index = process.argv.indexOf('--count');
const count = index === -1 ? NaN : Number(process.argv[index + 1]);
if (!Number.isInteger(count) || count < 0) {
  console.error('Usage: node scripts/check-inc-real-02-500w-append.js --count <non-negative integer> [--json]');
  process.exit(2);
}
const input = { table: 'vasen_tmp.tmp_ads_svc_day_info01', count: count };
const exitCode = count === 0 ? 0 : 1;
const output = { table: input.table, count: count, expected: 0, passed: count === 0, exit_code: exitCode };
const report = {
  checker: 'inc-real-02-500w-append',
  input: input,
  output: output,
  input_sha256: sha256(input),
  output_sha256: sha256(output),
  environment_fingerprint: sha256({ platform: process.platform, arch: process.arch, node: process.version, host: os.hostname() }),
  exit_code: exitCode,
  counterexample: { kind: 'count_gt_zero', expected: 0, observed: count },
  result: output
};
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else console.log(JSON.stringify(report));
process.exit(exitCode);
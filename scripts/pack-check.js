#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const forbidden = [
  'docs/superpowers/',
  'docs/learning/',
  'docs/reading/',
  'packages/skillcanary/docs/reading/',
];
const result = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm pack --dry-run --json'], { encoding: 'utf8' })
  : spawnSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' });
if (result.status !== 0) {
  const detail = result.error ? result.error.message + '\n' : '';
  process.stderr.write(detail + (result.stderr || result.stdout || 'npm pack failed\n'));
  process.exit(2);
}
let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  process.stderr.write('Unable to parse npm pack JSON: ' + error.message + '\n');
  process.exit(2);
}
const files = [];
for (const entry of report) for (const file of (entry.files || [])) files.push(file.path);
const leaks = files.filter(function (file) { return forbidden.some(function (prefix) { return file.indexOf(prefix) === 0; }); });
if (leaks.length) {
  console.error('PACK_BLOCK: forbidden internal files would be published:\n' + leaks.join('\n'));
  process.exit(2);
}
console.log('pack-check passed: ' + files.length + ' files, no internal GTM/learning/reading docs');
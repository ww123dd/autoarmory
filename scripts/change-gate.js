#!/usr/bin/env node
'use strict';

// Staged-diff gate: new abstractions must come with a claim or a real improvement
// to an existing mechanism. This is a pre-commit enforcement point, not a report.
// Usage: node scripts/change-gate.js --staged [--json]
//        node scripts/change-gate.js --range HEAD~1 [--json]
// Exit: 0 PASS / 2 BLOCK
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}
function git(repo, args, options) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', input: options && options.input });
  if (result.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + (result.stderr || '').trim());
  return result.stdout || '';
}
function parseStatus(text) {
  return text.split(/\r?\n/).filter(Boolean).map(function (line) {
    const parts = line.split(/\t/);
    return { status: parts[0], file: parts.slice(1).join('\t') };
  });
}
function added(diff) { return diff.split(/\r?\n/).filter(function (line) { return line[0] === '+' && line.slice(0, 3) !== '+++'; }).join('\n'); }
function removed(diff) { return diff.split(/\r?\n/).filter(function (line) { return line[0] === '-' && line.slice(0, 3) !== '---'; }).join('\n'); }
function readStagedFile(repo, file, staged, range) {
  const spec = staged ? ':' + file : range + ':' + file;
  return git(repo, ['show', spec]);
}
function claimCheck(content) {
  const checker = path.join(__dirname, 'claim-check.js');
  const result = spawnSync(process.execPath, [checker, '--stdin', '--json'], { input: content, encoding: 'utf8' });
  if (result.status !== 0) return { ok: false, report: null, output: (result.stdout || '') + (result.stderr || '') };
  try {
    const report = JSON.parse(result.stdout);
    return { ok: report.verdict === 'PASS', report: report, output: result.stdout };
  } catch (error) {
    return { ok: false, report: null, output: error.message + '\n' + result.stdout };
  }
}

const repo = path.resolve(argValue('--repo', process.cwd()));
const staged = process.argv.includes('--staged') || !process.argv.includes('--range');
const range = argValue('--range', 'HEAD~1');
const args = staged ? ['diff', '--cached'] : ['diff', range];
const status = parseStatus(git(repo, args.concat(['--name-status'])));
const diff = git(repo, args.concat(['--unified=0']));
const addedText = added(diff);
const removedText = removed(diff);
const abstractions = [];
const claims = [];

for (const item of status) {
  if (item.status === 'A' && /^src\/commands\//.test(item.file)) abstractions.push({ kind: 'command', file: item.file });
  if (item.status === 'A' && /^schemas\//.test(item.file)) abstractions.push({ kind: 'schema', file: item.file });
  if (item.status === 'A' && /^docs\/learning\//.test(item.file)) abstractions.push({ kind: 'learning-summary', file: item.file });
  if (item.status === 'A' && /^docs\/superpowers\/(plans|specs)\//.test(item.file)) abstractions.push({ kind: 'plan-or-spec', file: item.file });
  if ((item.status === 'A' || item.status === 'M') && /(^|\/)(claims?|docs\/claims?)\/.+\.json$/.test(item.file)) claims.push(item.file);
}
const packageChanged = status.some(function (item) { return item.file === 'package.json'; });
if (packageChanged) {
  const before = JSON.parse(git(repo, ['show', (staged ? 'HEAD' : range) + ':package.json']));
  const after = JSON.parse(readStagedFile(repo, 'package.json', staged, range));
  const addedScripts = Object.keys(after.scripts || {}).filter(function (name) { return !(before.scripts || {})[name] && !/^(?:test|hooks|gate|check|lint|format|build|ci)(?::|-|$)/i.test(name); });
  if (addedScripts.length) abstractions.push({ kind: 'package-script', file: 'package.json', scripts: addedScripts });
}
const readmeDiff = status.some(function (item) { return item.file === 'README.md'; }) ? git(repo, args.concat(['--unified=0', '--', 'README.md'])) : '';
if (readmeDiff && /(?:control\s*plane|off[-\s]?policy|portfolio|production[-\s]?ready|reliability|verified|conformance)/i.test(added(readmeDiff))) abstractions.push({ kind: 'strong-vocabulary', file: 'README.md' });

const verificationImprovement = (/input_sha256/.test(addedText) && /output_sha256/.test(addedText)) || (/environment_fingerprint/.test(addedText) && /outcome_callback/.test(addedText)) || (/closeCase/.test(addedText) && /exit_code/.test(addedText));
const downgrade = /(?:control\s*plane|off[-\s]?policy|portfolio|capability\s+route)/i.test(removedText) || status.some(function (item) { return (item.status === 'D' || item.status.indexOf('R') === 0) && /^src\/commands\//.test(item.file); });
const claimReports = [];
for (const file of claims) {
  try {
    claimReports.push(Object.assign({ file: file }, claimCheck(readStagedFile(repo, file, staged, range))));
  } catch (error) {
    claimReports.push({ file: file, ok: false, output: error.message });
  }
}

const blockers = [];
const warnings = [];
if (abstractions.length && !downgrade) {
  blockers.push('new abstraction requires removal or replacement of an existing layer');
}
if (abstractions.length && !downgrade) warnings.push('blocked abstractions: ' + abstractions.map(function (item) { return item.kind + ':' + item.file; }).join(', '));
if (!abstractions.length && !claims.length) warnings.push('no new abstraction detected; gate allowed the diff');

const report = {
  schema_version: 'autoarmory/change-gate/v1',
  repo: repo,
  mode: staged ? 'staged' : 'range:' + range,
  abstractions: abstractions,
  claims: claimReports,
  verification_improvement: verificationImprovement,
  downgrade: downgrade,
  blockers: blockers,
  warnings: warnings,
  verdict: blockers.length ? 'BLOCK' : 'PASS',
};
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log('AutoArmory change gate @ ' + repo);
  console.log('  abstractions=' + (abstractions.map(function (item) { return item.kind + ':' + item.file; }).join(', ') || '-'));
  console.log('  verification_improvement=' + verificationImprovement + ' downgrade=' + downgrade + ' claims=' + claims.length);
  for (const item of blockers) console.log('  BLOCK | ' + item);
  for (const item of warnings) console.log('  WARN  | ' + item);
  console.log('  Result: ' + report.verdict);
}
process.exit(blockers.length ? 2 : 0);

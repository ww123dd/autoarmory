'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, writeJson } = require('../lib/util');

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const file = args._[0] || '.skillcanary/advice.jsonl';
  const id = args.id;
  if (!id || !fs.existsSync(file)) {
    process.stderr.write('Usage: skillcanary promote <advice.jsonl> --id <advice-id> [--validated] [--blocking] [--output cases.json]\n');
    return 2;
  }
  const item = readJsonl(file).find(function (x) { return x.id === id; });
  if (!item) {
    process.stderr.write('advice not found: ' + id + '\n');
    return 1;
  }
  const eligible = item.frequency >= 2 || item.determinism === 'deterministic' || ['high', 'critical'].indexOf(item.severity) !== -1;
  if (!eligible) {
    process.stderr.write('not eligible for promotion: frequency=' + item.frequency + ', determinism=' + item.determinism + ', severity=' + item.severity + '\n');
    return 1;
  }
  if (args.blocking) {
    if (item.determinism !== 'deterministic') {
      process.stderr.write('blocking promotion requires determinism=deterministic\n');
      return 1;
    }
    if (!item.canary) {
      process.stderr.write('blocking promotion requires canary\n');
      return 1;
    }
    if (!item.verification || item.verification.result !== 'pass' || !item.verification.verified_by || !item.verification.oracle) {
      process.stderr.write('blocking promotion requires independent verification (verified_by + oracle + result=pass)\n');
      return 1;
    }
  }
  if (!args.validated) {
    process.stdout.write('Eligible as candidate, not yet a case. Re-run with --validated after a stable FAIL baseline.\n');
    return 0;
  }
  const out = path.resolve(args.output || 'cases.json');
  if (fs.existsSync(out) && !args.force) {
    process.stderr.write('output exists: ' + out + ' (use --force)\n');
    return 1;
  }
  writeJson(out, {
    schema_version: 'skillcanary/cases/v1',
    cases: [{ id: item.id, status: 'stable', criteria: item.assertion, source: item.source_sessions }]
  });
  process.stdout.write('Promoted ' + item.id + ' to ' + out + '\n');
  return 0;
};
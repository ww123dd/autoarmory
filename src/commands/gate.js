'use strict';

const path = require('path');
const { parseArgs, readJson, printJson } = require('../lib/util');
const { gateCandidate } = require('../lib/gate');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const file = args._[0];
  if (!file) {
    process.stderr.write('Usage: autoarmory gate <candidate.json> [--skillcanary <repo>] [--cases <cases.json>] [--require-provenance] [--json]\n');
    return 2;
  }
  const candidate = readJson(path.resolve(file));
  const result = gateCandidate(candidate, {
    path: args.skillcanary,
    cwd: process.cwd(),
    cases: args.cases,
    requireProvenance: !!args['require-provenance'],
    candidateFile: path.resolve(file)
  });
  if (args.json) printJson(result);
  else {
    for (const warning of result.warnings) process.stdout.write('  ! ' + warning + '\n');
    for (const error of result.errors) process.stdout.write('  x ' + error + '\n');
    process.stdout.write('  Result: ' + (result.ok ? 'PASS' : 'FAIL') + '\n');
  }
  return result.ok ? 0 : 1;
};

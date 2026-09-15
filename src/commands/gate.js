'use strict';
const path = require('path');
const { parseArgs, readJson, printJson } = require('../lib/util');
const { gate } = require('../lib/gate');
const skillcanary = require('../lib/skillcanary');
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const file = args._[0];
  if (!file) { process.stderr.write('Usage: selfforge gate <candidate.json> [--skillcanary <repo>] [--json]\n'); return 2; }
  const result = gate(readJson(path.resolve(file)));
  const skillcanaryCheck = args.skillcanary || process.env.SKILLCANARY_HOME ? skillcanary.run(['adapter', 'doctor'], { path: args.skillcanary, cwd: process.cwd() }) : null;
  const output = Object.assign({}, result, { skillcanary: skillcanaryCheck ? { code: skillcanaryCheck.code, stdout: skillcanaryCheck.out.trim(), stderr: skillcanaryCheck.err.trim() } : null });
  if (args.json) printJson(output); else {
    for (const warning of result.warnings) process.stdout.write('  ! ' + warning + '\n');
    for (const error of result.errors) process.stdout.write('  x ' + error + '\n');
    process.stdout.write('  Result: ' + (result.ok ? 'PASS' : 'FAIL') + '\n');
  }
  return result.ok ? 0 : 1;
};

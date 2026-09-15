'use strict';

const path = require('path');
const { parseArgs, readJson, printJson, writeJson } = require('../lib/util');
const lib = require('../lib/execution');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0] || 'audit';
  const file = args._[1];
  if (sub !== 'audit' || !file) { process.stderr.write('Usage: skillcanary execution audit <workflow.json> [--output plan.json] [--json]\n'); return 2; }
  const result = lib.auditWorkflow(readJson(path.resolve(file)));
  if (args.output) writeJson(path.resolve(args.output), result); else if (args.json) printJson(result); else {
    process.stdout.write('SkillCanary execution audit\n');
    for (const step of result.steps) process.stdout.write('  ' + step.id + ': ' + step.declared_mode + ' -> ' + step.recommended_mode + (step.issues.length ? ' x ' + step.issues.join('; ') : '') + '\n');
    process.stdout.write('  end_to_end=' + result.cascade_reliability.end_to_end_success.toFixed(3) + '  Result: ' + result.verdict + '\n');
  }
  return result.issues.length ? 1 : 0;
};

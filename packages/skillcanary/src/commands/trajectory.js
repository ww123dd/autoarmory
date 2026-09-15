'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, printJson, writeJson } = require('../lib/util');
const metrics = require('../lib/metrics');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0] || 'analyze';
  const file = args._[1];
  if (sub !== 'analyze' || !file) { process.stderr.write('Usage: skillcanary trajectory analyze <trace.json> [--output metrics.json] [--json]\n'); return 2; }
  const result = metrics.computeMetrics(readJson(path.resolve(file)));
  if (args.output) writeJson(path.resolve(args.output), result);
  else if (args.json) printJson(result);
  else {
    process.stdout.write('SkillCanary trajectory analyze\n');
    process.stdout.write('  tool_selection_f1=' + result.tool_selection.f1.toFixed(3) + '\n');
    process.stdout.write('  parameter_pass=' + result.parameter_extraction.pass_rate.toFixed(3) + '\n');
    process.stdout.write('  result_utilization=' + result.result_utilization.utilization.toFixed(3) + '\n');
    process.stdout.write('  error_recovery=' + result.error_recovery.class + '\n');
    process.stdout.write('  plan_coherence=' + (result.plan_coherence.pass ? 'PASS' : 'FAIL') + '\n');
    process.stdout.write('  task_completion=' + result.task_completion.score.toFixed(3) + '\n');
    process.stdout.write('  Result: ' + (result.pass ? 'PASS' : 'FAIL') + '\n');
  }
  return result.pass ? 0 : 1;
};

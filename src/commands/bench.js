'use strict';

const path = require('path');
const { parseArgs, printJson, writeText } = require('../lib/util');
const { runBench } = require('../lib/bench');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const report = runBench({ seed: Number(args.seed || 11) });
  const markdown = '# Capability Routing Bench\n\n' + report.strategies.map(function (item) { return '## ' + item.id + '\n\n' + JSON.stringify(item.metrics, null, 2); }).join('\n\n') + '\n\n' + report.recommendation + '\n';
  if (args.output) writeText(path.resolve(args.output), markdown);
  if (args.json) printJson(report); else process.stdout.write('Capability Routing Bench\n' + report.strategies.map(function (item) { return '  ' + item.id + ': success=' + item.metrics.success_rate.toFixed(2) + ' safety=' + item.metrics.safety_violations + ' cost=' + item.metrics.average_cost.toFixed(4); }).join('\n') + '\n');
  return 0;
};

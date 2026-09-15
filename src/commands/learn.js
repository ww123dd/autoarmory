'use strict';
const path = require('path');
const { parseArgs, readJsonl, printJson } = require('../lib/util');
const { summarize, recommend } = require('../lib/learn');
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const input = path.resolve(args._[0] || '.selfforge/decisions.jsonl');
  const decisions = readJsonl(input);
  const output = { summary: summarize(decisions), recommendation: recommend(decisions) };
  if (args.json) printJson(output); else { for (const item of output.summary) process.stdout.write('  ' + item.action + '  n=' + item.count + '  mean_reward=' + item.mean_reward + '\n'); process.stdout.write('  Recommendation: ' + (output.recommendation ? output.recommendation.action : 'none') + '\n'); }
  return 0;
};

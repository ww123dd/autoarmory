'use strict';

const path = require('path');
const { parseArgs, readJsonl, printJson } = require('../lib/util');
const { recommend } = require('../lib/policy');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const input = path.resolve(args._[0] || '.selfforge/decisions.jsonl');
  const result = recommend(readJsonl(input), { seed: Number(args.seed || 1) });
  if (args.json) printJson(result);
  else for (const item of result.recommendations) process.stdout.write('  ' + item.action + '  score=' + item.score.toFixed(3) + '  mean=' + item.mean_reward.toFixed(3) + '  n=' + item.count + '  uncertainty=' + item.uncertainty.toFixed(3) + '\n');
  return 0;
};
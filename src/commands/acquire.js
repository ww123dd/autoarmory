'use strict';
const path = require('path');
const { parseArgs, readJsonl, printJson } = require('../lib/util');
const { acquire } = require('../lib/acquire');
const { recommend } = require('../lib/policy');
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const input = path.resolve(args._[0] || '.selfforge/candidates.jsonl');
  const decisions = readJsonl(path.resolve(args.decisions || '.selfforge/decisions.jsonl'));
  const candidates = acquire(readJsonl(input), recommend(decisions, { seed: Number(args.seed || 1) }));
  const top = candidates.slice(0, Number(args.top || 10));
  if (args.json) printJson(top); else for (const item of top) process.stdout.write('  ' + item.acquisition_score.toFixed(2) + '  ' + item.id + '  ' + item.action + '\n');
  return 0;
};

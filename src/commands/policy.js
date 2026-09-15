'use strict';
const path = require('path');
const { parseArgs, readJson, readJsonl, printJson } = require('../lib/util');
const calibration = require('../lib/calibration');
const { recommend } = require('../lib/policy');
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  if (sub === 'calibrate' || sub === 'off-policy') {
    const outcomesFile = path.resolve(args.outcomes || '.selfforge/capability-outcomes.jsonl');
    const outcomes = readJson(outcomesFile);
    const result = sub === 'calibrate' ? calibration.calibrate(outcomes, { min: Number(args.min || 30) }) : calibration.offPolicyEvaluate(outcomes, { min: Number(args.min || 30) });
    if (args.json) printJson(result);
    else if (result.status === 'calibrated') process.stdout.write('  calibrated  n=' + result.samples + '  brier=' + result.brier.toFixed(4) + '  ece=' + result.ece.toFixed(4) + '\n');
    else if (result.status === 'evaluated') process.stdout.write('  off-policy  n=' + result.samples + '  ips=' + result.ips.toFixed(4) + '  ess=' + result.effective_samples.toFixed(2) + '\n');
    else process.stderr.write((result.errors || [result.status]).join('\n') + '\n');
    return result.status === 'calibrated' || result.status === 'evaluated' ? 0 : 1;
  }
  const input = path.resolve(args._[0] || '.selfforge/decisions.jsonl');
  const result = recommend(readJsonl(input), { seed: Number(args.seed || 1) });
  if (args.json) printJson(result); else for (const item of result.recommendations) process.stdout.write('  ' + item.action + '  score=' + item.score.toFixed(3) + '  mean=' + item.mean_reward.toFixed(3) + '  n=' + item.count + '  uncertainty=' + item.uncertainty.toFixed(3) + '\n');
  return 0;
};

'use strict';

const path = require('path');
const { parseArgs, readJson, printJson } = require('../lib/util');
const lib = require('../lib/grader');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  if (sub === 'calibrate') {
    const file = args._[1];
    if (!file) { process.stderr.write('Usage: skillcanary grader calibrate <pairs.json> [--json]\n'); return 2; }
    const data = readJson(path.resolve(file));
    const result = lib.calibrate(Array.isArray(data) ? data : data.pairs);
    if (args.json) printJson(result); else process.stdout.write('Grader calibration: kappa=' + result.kappa + ' quality=' + result.quality + '\n');
    return result.quality === 'unusable' ? 1 : 0;
  }
  if (sub === 'plan') {
    const file = args._[1];
    if (!file) { process.stderr.write('Usage: skillcanary grader plan <step.json> [--json]\n'); return 2; }
    const result = lib.plan(readJson(path.resolve(file)));
    if (args.json) printJson(result); else process.stdout.write('Grader: ' + result.grader + ' (' + result.reason + ')\n');
    return 0;
  }
  process.stderr.write('Usage: skillcanary grader <calibrate|plan> ...\n');
  return 2;
};

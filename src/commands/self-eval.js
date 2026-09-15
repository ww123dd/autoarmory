'use strict';

const path = require('path');
const { parseArgs, printJson, writeJson } = require('../lib/util');
const { runSelfEval } = require('../lib/self-eval');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const report = runSelfEval({ repo: path.resolve(args.repo || '.'), runs: Number(args.runs || 3) });
  if (args.output) writeJson(path.resolve(args.output), report);
  if (args.json) printJson(report);
  else { process.stdout.write('AutoArmory self-evaluation: ' + report.score.total + '/100  verdict=' + report.verdict + '\n'); for (const check of report.checks) process.stdout.write('  ' + (check.ok ? 'o' : 'x') + ' ' + check.id + '\n'); }
  return report.verdict === 'not_ready' ? 1 : 0;
};

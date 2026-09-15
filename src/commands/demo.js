'use strict';

const path = require('path');
const { parseArgs, printJson, writeText } = require('../lib/util');
const { runDemo } = require('../lib/demo');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const demo = runDemo({ seed: Number(args.seed || 7) });
  if (args.output) writeText(path.resolve(args.output), demo.markdown);
  if (args.json) printJson(demo.result); else { process.stdout.write('AutoArmory demo\n'); for (const step of demo.result.steps) process.stdout.write('  ' + step.id + ': ' + step.title + '\n'); process.stdout.write('  ' + demo.result.verdict + '\n'); }
  return 0;
};

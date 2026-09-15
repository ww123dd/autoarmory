'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, printJson, writeJson } = require('../lib/util');
const { compare, shadowPlan, canaryPlan } = require('../lib/experiment');
function trialsFrom(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  if (sub === 'compare') {
    const before = args._[1]; const after = args._[2];
    if (!before || !after) { process.stderr.write('Usage: autoarmory experiment compare <before.json> <after.json>\n'); return 2; }
    const result = compare(trialsFrom(path.resolve(before)), trialsFrom(path.resolve(after)));
    if (args.output) writeJson(path.resolve(args.output), result); else printJson(result);
    return result.verdict === 'regressed' ? 1 : 0;
  }
  if (sub === 'shadow' || sub === 'canary') {
    const file = args._[1];
    if (!file) { process.stderr.write('Usage: autoarmory experiment <shadow|canary> <candidate.json> [--percent 10]\n'); return 2; }
    const candidate = readJson(path.resolve(file));
    const result = sub === 'shadow' ? shadowPlan(candidate) : canaryPlan(candidate, args.percent);
    printJson(result); return 0;
  }
  process.stderr.write('Usage: autoarmory experiment <compare|shadow|canary> ...\n'); return 2;
};

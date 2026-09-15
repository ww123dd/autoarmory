'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, printJson, writeJson } = require('../lib/util');
const lib = require('../lib/reliability');

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  if (sub === 'estimate') {
    const file = args._[1];
    if (!file) { process.stderr.write('Usage: skillcanary reliability estimate <trials.jsonl> [--k 4] [--output estimate.json]\n'); return 2; }
    const result = lib.reliabilityFromTrials(readJsonl(path.resolve(file)), Number(args.k || 4));
    if (args.output) writeJson(path.resolve(args.output), result); else printJson(result);
    return 0;
  }
  if (sub === 'compare') {
    const before = args._[1];
    const after = args._[2];
    if (!before || !after) { process.stderr.write('Usage: skillcanary reliability compare <before.jsonl> <after.jsonl> [--output comparison.json]\n'); return 2; }
    const result = lib.compareReliability(readJsonl(path.resolve(before)), readJsonl(path.resolve(after)));
    if (args.output) writeJson(path.resolve(args.output), result); else printJson(result);
    return result.verdict.indexOf('regressed') !== -1 ? 1 : 0;
  }
  if (sub === 'compose') {
    const file = args._[1];
    if (!file) { process.stderr.write('Usage: skillcanary reliability compose <steps.json> [--output estimate.json]\n'); return 2; }
    const result = lib.compositeReliability(readJson(path.resolve(file)).steps || readJson(path.resolve(file)));
    if (args.output) writeJson(path.resolve(args.output), result); else printJson(result);
    return 0;
  }
  process.stderr.write('Usage: skillcanary reliability <estimate|compare|compose> ...\n');
  return 2;
};

'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson, writeJson } = require('../lib/util');
const lib = require('../lib/golden');

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0] || 'curate';
  const file = args._[1];
  if (sub !== 'curate' || !file) { process.stderr.write('Usage: skillcanary golden curate <candidates.jsonl> [--top 20] [--output golden.json] [--json]\n'); return 2; }
  const items = lib.curate(readJsonl(path.resolve(file)), { top: Number(args.top || 20) });
  if (args.output) writeJson(path.resolve(args.output), { schema_version: 'skillcanary/golden-set/v1', generated_at: new Date().toISOString(), cases: items });
  else if (args.json) printJson(items);
  else for (const item of items) process.stdout.write('  ' + item.acquisition_score.toFixed(2) + '  ' + item.id + '  ' + item.proposed_suite + '\n');
  return 0;
};

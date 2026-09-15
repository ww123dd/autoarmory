'use strict';
const path = require('path');
const { parseArgs, readJsonl, writeJsonl, printJson } = require('../lib/util');
const { propose } = require('../lib/propose');
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const input = path.resolve(args._[0] || '.selfforge/incidents.jsonl');
  const candidates = propose(readJsonl(input));
  if (args.output) writeJsonl(path.resolve(args.output), candidates); else if (args.json) printJson(candidates); else for (const item of candidates) process.stdout.write('  ' + item.id + '  ' + item.action + '  risk=' + item.risk + '\n');
  return 0;
};

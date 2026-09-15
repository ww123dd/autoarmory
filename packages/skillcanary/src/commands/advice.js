'use strict';

const fs = require('fs');
const { parseArgs, printJson } = require('../lib/util');

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const file = args._[0] || '.skillcanary/advice.jsonl';
  if (!fs.existsSync(file)) {
    process.stderr.write('advice file not found: ' + file + '\n');
    return 1;
  }
  const items = readJsonl(file).filter(function (x) { return !args.status || x.status === args.status; });
  if (args.json) printJson(items);
  else {
    process.stdout.write('SkillCanary advice @ ' + file + '\n');
    for (const x of items) process.stdout.write('  ' + x.id + '  ' + x.status + '  ' + x.skill + '  ' + x.observed_failure + '\n');
    process.stdout.write('  Total: ' + items.length + '\n');
  }
  return 0;
};
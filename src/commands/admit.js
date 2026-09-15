'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJsonl, writeJsonl, printJson } = require('../lib/util');
const { admit } = require('../lib/admission');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const input = path.resolve(args._[0] || '.selfforge/candidates.jsonl');
  const result = admit(readJsonl(input));
  const outputFile = args.output ? path.resolve(args.output) : null;
  if (outputFile) writeJsonl(outputFile, result.decisions);
  if (args.json) printJson(result); else { process.stdout.write('Admission summary\n'); for (const key of Object.keys(result.summary).sort()) process.stdout.write('  ' + key + '=' + result.summary[key] + '\n'); }
  return 0;
};

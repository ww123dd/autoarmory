'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, writeJsonl, printJson } = require('../lib/util');
const { observe, observeText } = require('../lib/observe');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const input = args._[0] || args.input;
  if (!input) { process.stderr.write('Usage: autoarmory observe <file|dir|-> [--format auto|article|markdown|otel|junit|github|jsonl|log] [--output incidents.jsonl] [--json]\n'); return 2; }
  const format = args.format || 'auto';
  const incidents = input === '-'
    ? observeText(fs.readFileSync(0, 'utf8'), { format: format, source: 'stdin' })
    : observe(path.resolve(input), { format: format });
  if (args.output) writeJsonl(path.resolve(args.output), incidents); else if (args.json) printJson(incidents); else for (const item of incidents) process.stdout.write('  ' + item.severity + '  ' + item.failure_mode + '  ' + item.id + '  ' + item.evidence + '\n');
  return incidents.length ? 0 : 1;
};

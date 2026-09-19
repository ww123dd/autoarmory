#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const manifest = require('../src/lib/baseline-manifest');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
const state = path.resolve(args.state);
if (args.validate) {
  const report = manifest.entry(state, args.validate);
  if (args.json) printJson(report);
  else process.stdout.write((report.ok ? 'VALID ' : 'INVALID ') + args.validate + ' ' + report.errors.join('; ') + '\n');
  process.exit(report.ok ? 0 : 2);
}
const loaded = manifest.load(state);
if (args.json) printJson({ ok: loaded.ok, file: loaded.file, errors: loaded.errors, count: Object.keys(loaded.entries).length, ids: Object.keys(loaded.entries) });
else process.stdout.write((loaded.ok ? 'baseline manifest loaded ' : 'baseline manifest invalid ') + 'entries=' + Object.keys(loaded.entries).length + ' ' + loaded.errors.join('; ') + '\n');
process.exit(loaded.ok ? 0 : 2);
#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const { linkReuseRecords } = require('../src/lib/reuse-linker');

function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
const stateDir = path.resolve(args.state);
const report = linkReuseRecords(stateDir, { apply: args.apply === true });
if (args.json) printJson(report);
else {
  process.stdout.write('reuse-link examined=' + report.examined + ' already_linked=' + report.already_linked + ' linked=' + report.linked + ' link_lost=' + report.link_lost + (report.apply ? ' (applied)' : ' (dry-run)') + '\n');
  for (const row of report.updates) process.stdout.write(row.status + ' ' + row.change_id + ' ' + (row.session_id || row.reason || '') + '\n');
}
process.exit(0);
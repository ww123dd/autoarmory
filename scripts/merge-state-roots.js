#!/usr/bin/env node
'use strict';
const os = require('os');
const path = require('path');
const { printJson } = require('../src/lib/util');
const merge = require('../src/lib/state-merge');
const argv = process.argv.slice(2);
const sources = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === '--source' && argv[i + 1]) sources.push(path.resolve(argv[++i]));
const target = path.resolve(process.env.AUTOARMORY_STATE || process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow'));
if (!sources.length) { process.stderr.write('Usage: merge-state-roots.js --source <legacy-root> [--source <another>] [--json]\n'); process.exit(2); }
const report = merge.mergeRoots(target, sources);
if (!report.ok) { process.stderr.write('state merge failed: ' + report.reason + '\n'); process.exit(1); }
if (process.argv.indexOf('--json') >= 0) printJson(report);
else {
  process.stdout.write('state merge -> ' + target + '\n');
  for (const ledger of report.ledgers) if (ledger.added) process.stdout.write('  ' + ledger.ledger + ' +' + ledger.added + ' (merged=' + ledger.merged_count + ')\n');
  if (report.reuse_records.added) process.stdout.write('  reuse-records +' + report.reuse_records.added + ' (' + report.reuse_records.change_ids.join(', ') + ')\n');
  process.stdout.write('  added=0 everywhere means the merge is already applied (idempotent)\n');
}

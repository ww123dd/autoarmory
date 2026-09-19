#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const { orchestrate } = require('../src/lib/decision-orchestrator');

function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
if (!args.repo) fail('--repo <repo> is required');
const report = orchestrate(path.resolve(args.state), { repo: path.resolve(args.repo), apply: args.apply === true, changeId: args['change-id'] || null, limit: args.limit === undefined ? null : Number(args.limit) });
if (args.json) printJson(report);
else process.stdout.write('decision-orchestrate ready=' + report.ready_count + ' written=' + report.written + ' already_pending=' + report.already_pending + ' skipped=' + report.skipped + (report.apply ? ' (applied)' : ' (dry-run)') + '\n');
process.exit(0);
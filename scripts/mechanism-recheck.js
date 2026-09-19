#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const recheck = require('../src/lib/mechanism-recheck');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
if (!args.repo) fail('--repo <repo> is required');
const report = args.drain === true
  ? recheck.drain(path.resolve(args.state), { repo: path.resolve(args.repo) })
  : recheck.recheck(path.resolve(args.state), { repo: path.resolve(args.repo), apply: args.apply === true });
if (args.json) printJson(report);
else process.stdout.write('mechanism-recheck mechanisms=' + report.mechanisms + ' pending=' + report.pending_written + ' already=' + report.already_pending + ' blocked=' + report.blocked_by_claim_identity + (args.apply || args.drain ? ' (applied)' : ' (dry-run)') + '\n');
process.exit(0);
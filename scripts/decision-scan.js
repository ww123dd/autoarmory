#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const decisionScan = require('../src/lib/decision-scan');

function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
if (!args.repo) fail('--repo <repo> is required');
const report = decisionScan.scan(path.resolve(args.state), {
  repo: path.resolve(args.repo),
  apply: args.apply === true,
  limit: args.limit === undefined ? 200 : Number(args.limit)
});
if (args.json) printJson(args.full ? report : Object.assign({}, report, { drafts: undefined }));
else {
  process.stdout.write('decision-scan candidates=' + report.candidate_count + ' drafts=' + report.draft_count + ' ready=' + report.ready_for_verifier_count + ' unverifiable=' + report.unverifiable_count + ' blocked_access=' + report.blocked_by_access_count + ' blocked_owner=' + report.blocked_by_owner_count + ' no_capability=' + report.no_capability_count + (report.insufficient_real_stream ? ' insufficient_real_stream' : '') + (args.apply ? ' (applied)' : ' (dry-run)') + '\n');
}
process.exit(0);
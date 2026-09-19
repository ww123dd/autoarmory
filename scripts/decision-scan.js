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
  process.stdout.write('decision-scan inventory=' + report.inventory_draft_count + ' missing_transition=' + report.missing_transition_count + ' transition_present=' + report.transition_present_count + ' ready=' + report.ready_for_verifier_count + ' true_no_capability=' + report.true_no_capability_count + ' blocked_owner=' + report.blocked_by_owner_count + ' blocked_expected=' + report.blocked_by_expected_provenance_count + (report.insufficient_real_stream ? ' insufficient_real_stream' : '') + (args.apply ? ' (applied)' : ' (dry-run)') + '\n');
}
process.exit(0);
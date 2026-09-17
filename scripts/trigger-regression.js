#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, printJson } = require('../src/lib/util');
const { compareTriggerReports } = require('../src/lib/trigger-regression');

const args = parseArgs(process.argv.slice(2));
if (!args.baseline || !args.candidate) {
  process.stderr.write('Usage: node scripts/trigger-regression.js --baseline audit.json --candidate audit.json [--expect positive|zero] [--enforce] [--json]\n');
  process.exit(2);
}
let report;
try {
  report = compareTriggerReports(readJson(path.resolve(args.baseline)), readJson(path.resolve(args.candidate)), { expect: args.expect || 'observed' });
} catch (error) {
  process.stderr.write('trigger regression failed: ' + error.message + '\n');
  process.exit(1);
}
if (args.json) printJson(report);
else {
  process.stdout.write('trigger regression: baseline=' + report.baseline_cases + ' candidate=' + report.candidate_cases + '\n');
  process.stdout.write('  trigger_misfire_delta      ' + report.trigger_misfire_delta + '\n');
  process.stdout.write('  trigger_regression_count   ' + report.trigger_regression_count + '\n');
  process.stdout.write('  observed                   ' + report.observed + '\n');
  for (const error of report.errors) process.stdout.write('  error ' + error + '\n');
}
process.exit(args.enforce && !report.ok ? 1 : 0);
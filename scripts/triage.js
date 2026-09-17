#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, readJsonl, printJson } = require('../src/lib/util');
const { triage } = require('../src/lib/triage');

const args = parseArgs(process.argv.slice(2));
if (!args.input && !args.finding) {
  process.stderr.write('Usage: node scripts/triage.js --input findings.jsonl | --finding finding.json [--json] [--enforce]\n');
  process.exit(2);
}
let findings;
try {
  if (args.finding) findings = [readJson(path.resolve(args.finding))];
  else {
    const text = fs.readFileSync(path.resolve(args.input), 'utf8').trim();
    findings = text ? text.split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); }) : [];
  }
} catch (error) {
  process.stderr.write('triage input is unreadable: ' + error.message + '\n');
  process.exit(2);
}
const report = triage(findings);
if (args.json) printJson(report);
else {
  process.stdout.write('triage: total=' + report.total + '\n');
  for (const [name, count] of Object.entries(report.counts)) process.stdout.write('  ' + name.padEnd(24) + count + '\n');
  process.stdout.write('  blocking_count           ' + report.blocking_count + '\n');
}
process.exit(args.enforce && report.blocking_count ? 1 : 0);
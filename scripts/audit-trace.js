#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, writeJson, printJson } = require('../src/lib/util');
const { auditCase, auditTaskSet } = require('../src/lib/audit-trace');

const args = parseArgs(process.argv.slice(2));
const caseFile = args.case;
const casesFile = args.cases;
if (!caseFile && !casesFile) {
  process.stderr.write('Usage: node scripts/audit-trace.js --case case.json | --cases cases.json [--output report.json] [--enforce] [--json]\n');
  process.exit(2);
}
let report;
try {
  if (casesFile) {
    const cases = readJson(path.resolve(casesFile));
    report = auditTaskSet(Array.isArray(cases) ? cases : (cases.cases || []), { baseline_unwanted_skill_loads: args.baseline || 0 });
  } else {
    const record = auditCase(readJson(path.resolve(caseFile)));
    report = auditTaskSet([record], { baseline_unwanted_skill_loads: args.baseline || 0 });
  }
} catch (error) {
  process.stderr.write('audit trace failed: ' + error.message + '\n');
  process.exit(1);
}
if (args.output) { fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true }); writeJson(path.resolve(args.output), report); }
if (args.json) printJson(report);
else {
  process.stdout.write('audit trace: cases=' + report.cases + '\n');
  for (const [key, value] of Object.entries(report.metrics)) process.stdout.write('  ' + key.padEnd(30) + value + '\n');
  process.stdout.write('  failures=' + (report.failures.length ? report.failures.join(',') : 'none') + '\n');
}
process.exit(args.enforce && report.failures.length ? 1 : 0);
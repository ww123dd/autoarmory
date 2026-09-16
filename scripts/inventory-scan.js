#!/usr/bin/env node
'use strict';

// Read-only inventory scan. Proposes capability candidates; registration stays a separate,
// approved step (scripts/inventory-scan.js --write writes the candidate file only).
//
// usage: node scripts/inventory-scan.js [--home <dir>] [--repo <dir>] [--state .selfforge]
//                                       [--out <file>] [--write] [--json]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, writeJsonl, printJson } = require('../src/lib/util');
const inventory = require('../src/lib/inventory');

const args = parseArgs(process.argv.slice(2));
const repo = path.resolve(args.repo || '.');
const state = path.resolve(args.state || path.join(repo, '.selfforge'));
const report = inventory.scan({ home: args.home || os.homedir(), repo: repo });

if (args.write) {
  const out = args.out ? path.resolve(args.out) : path.join(state, 'inventory-candidates.jsonl');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  writeJsonl(out, report.candidates);
  report.candidate_file = out;
}
if (args.json) printJson(report);
else {
  process.stdout.write('inventory scan: ' + report.summary.scanned + ' candidates (' + JSON.stringify(report.summary.by_kind) + ')\n');
  process.stdout.write('  registerable=' + report.summary.registerable + ' needs_attention=' + report.summary.needs_attention + ' gaps=' + JSON.stringify(report.summary.gaps) + '\n');
  for (const candidate of report.candidates) {
    process.stdout.write('  ' + (candidate.readiness.registerable ? 'READY' : 'GAP  ') + ' ' + candidate.id + (candidate.readiness.gaps.length ? '  ' + candidate.readiness.gaps.join(',') : '') + '\n');
  }
  if (report.candidate_file) process.stdout.write('  wrote ' + report.candidate_file + '\n');
}
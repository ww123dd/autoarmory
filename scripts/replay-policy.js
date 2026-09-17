#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, printJson } = require('../src/lib/util');
const replay = require('../src/lib/replay-policy');

function parseInput(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  if (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{') {
    try {
      const value = JSON.parse(trimmed);
      return Array.isArray(value) ? value : (value.records || []);
    } catch (_) {
      // fall through to JSONL
    }
  }
  return trimmed.split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
}

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  process.stderr.write('Usage: node scripts/replay-policy.js --input <records.jsonl> [--policy mechanism-streak|count-half] [--min-passes 3] [--json] [--enforce]\n');
  process.exit(2);
}
let raw;
try { raw = fs.readFileSync(path.resolve(args.input), 'utf8'); }
catch (error) { process.stderr.write('replay input is unreadable: ' + error.message + '\n'); process.exit(2); }
let records;
try { records = parseInput(raw); }
catch (error) { process.stderr.write('replay input is not valid JSON/JSONL: ' + error.message + '\n'); process.exit(2); }
const report = replay.replay(records, args.policy || 'mechanism-streak', { min_passes: args['min-passes'], ratio: args.ratio });
report.source = path.resolve(args.input);
report.source_sha256 = replay.sourceSha256(raw);
if (args.json) printJson(report);
else {
  process.stdout.write('replay policy: ' + report.policy + '\n');
  process.stdout.write('  records=' + report.record_count + ' eligible=' + (report.eligible_record_count === undefined ? report.record_count : report.eligible_record_count) + '\n');
  process.stdout.write('  replay_escape_count=' + report.replay_escape_count + ' tightening_rejection_count=' + report.tightening_rejection_count + ' replay_mismatch_count=' + report.replay_mismatch_count + '\n');
  process.stdout.write('  insufficient_real_stream=' + report.insufficient_real_stream + '\n');
}
process.exit(args.enforce && (report.insufficient_real_stream || report.errors || report.replay_escape_count !== 0) ? 1 : 0);
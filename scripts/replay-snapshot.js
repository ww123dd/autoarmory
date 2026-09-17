#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, readJsonl, writeJson, printJson, sha256 } = require('../src/lib/util');
const snapshot = require('../src/lib/history-replay-snapshot');

const args = parseArgs(process.argv.slice(2));
if (args.create) {
  const state = path.resolve(args.state || '.selfforge');
  function read(name) { const file = path.join(state, name); return fs.existsSync(file) ? readJsonl(file) : []; }
  const input = {
    mechanism_runs: read('mechanism-runs.jsonl'),
    routing_decisions: read('routing-decisions.jsonl'),
    routing_actuals: read('routing-actual.jsonl'),
    outcomes: read('outcomes.jsonl'),
    transitions: read('transitions.jsonl'),
    usage_records: read('usage-records.jsonl')
  };
  const built = snapshot.historySnapshot(input, { source_sha256: sha256(JSON.stringify(input)) });
  if (!args.output) { process.stderr.write('--create requires --output <snapshot.json>\n'); process.exit(2); }
  writeJson(path.resolve(args.output), built);
  printJson({ schema_version: 'autoarmory/history-replay-snapshot-create/v1', output: path.resolve(args.output), stream_counts: built.stream_counts, source_sha256: built.source_sha256 });
  process.exit(0);
}
if (args.verify) {
  const file = path.resolve(args.verify);
  const report = snapshot.verifySnapshot(readJson(file), { context_budget: args['context-budget-escape'] !== undefined ? { context_budget_escape_count: Number(args['context-budget-escape']) } : null });
  if (args.json) printJson(report); else process.stdout.write('snapshot verify: ' + (report.ok ? 'PASS' : 'FAIL') + ' metrics=' + JSON.stringify(report.metrics) + '\n');
  process.exit(report.ok ? 0 : 1);
}
process.stderr.write('Usage: node scripts/replay-snapshot.js --create --state .selfforge --output snapshot.json | --verify snapshot.json [--json]\n');
process.exit(2);
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson, writeJsonl } = require('../src/lib/util');
const { collectUsageRecords } = require('../src/lib/runner-usage');

const args = parseArgs(process.argv.slice(2));
if (!args.root || !args.output) {
  process.stderr.write('Usage: node scripts/ingest-runner-usage.js --root <dir> --output <usage-records.jsonl> [--json]\n');
  process.exit(2);
}
const root = path.resolve(args.root);
const output = path.resolve(args.output);
const records = collectUsageRecords(root);
if (!records.length) {
  process.stderr.write('no cli.json + grading.json pairs found under ' + root + '\n');
  process.exit(1);
}
fs.mkdirSync(path.dirname(output), { recursive: true });
writeJsonl(output, records);
const report = { schema_version: 'autoarmory/usage-ingest/v1', root: root, output: output, records: records.length, cost_records: records.filter(function (item) { return Number.isFinite(item.cost_usd); }).length, token_records: records.filter(function (item) { return item.tokens && item.tokens.total > 0; }).length };
if (args.json) printJson(report);
else process.stdout.write('ingested ' + records.length + ' runner usage records -> ' + output + '\n');
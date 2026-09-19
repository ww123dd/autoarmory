#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson, writeJsonl } = require('../src/lib/util');
const derived = require('../src/lib/historical-derived');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
const report = derived.fromHistory(path.resolve(args.state));
if (args.apply) writeJsonl(path.join(path.resolve(args.state), 'decision-scan', 'historical-transition-candidates.jsonl'), report.candidates);
if (args.json) printJson(args.full ? report : Object.assign({}, report, { candidates: undefined }));
else process.stdout.write('historical-derived candidates=' + report.count + (args.apply ? ' (written)' : '') + '\n');
process.exit(0);
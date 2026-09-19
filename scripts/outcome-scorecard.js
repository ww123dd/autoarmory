#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const scorecard = require('../src/lib/outcome-scorecard');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
const report = scorecard.scorecard(path.resolve(args.state));
if (args.apply) scorecard.writeScorecard(path.resolve(args.state), report);
if (args.json) printJson(report); else process.stdout.write('outcome-scorecard verifiers=' + report.rows.length + ' outcomes=' + report.outcome_count + (args.apply ? ' (written)' : '') + '\n');
process.exit(0);
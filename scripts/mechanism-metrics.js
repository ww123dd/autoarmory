#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const metrics = require('../src/lib/mechanism-lifecycle-metrics');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
if (!args.mechanism) fail('--mechanism <id> is required');
const report = metrics.read(path.resolve(args.state), args.mechanism);
if (args.json) printJson(report);
else process.stdout.write('mechanism ' + report.mechanism_id + ' state=' + report.lifecycle_state + ' reuse=' + report.reuse_count + ' success=' + report.success_count + ' overturn=' + report.overturn_count + ' reopen=' + report.reopen_count + '\n');
process.exit(0);

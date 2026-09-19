#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const clusters = require('../src/lib/no-capability-clusters');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
const report = clusters.cluster(path.resolve(args.state));
if (args.apply) clusters.writeReport(path.resolve(args.state), report);
if (args.json) printJson(Object.assign({}, report, { clusters: args.full ? report.clusters : report.clusters.slice(0, 10) }));
else process.stdout.write('no-capability clusters total=' + report.total_no_capability + ' clusters=' + report.cluster_count + ' top10_coverage=' + report.top10_coverage + ' no_capability_rate=' + report.no_capability_rate + (args.apply ? ' (written)' : '') + '\n');
process.exit(0);
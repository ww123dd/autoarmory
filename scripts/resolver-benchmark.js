#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const benchmark = require('../src/lib/resolver-benchmark');

function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.repo) fail('--repo <repo> is required');
const labels = path.resolve(args.labels || path.join(args.repo, 'docs', 'evidence', 'resolver-label-set-v1.jsonl'));
const report = benchmark.run(path.resolve(args.repo), labels);
if (args.json) printJson(args.full ? report : Object.assign({}, report, { results: undefined }));
else process.stdout.write('resolver benchmark total=' + report.total + ' false_match_rate=' + report.resolver_false_match_rate + ' miss_rate=' + report.resolver_miss_rate + ' ok=' + report.ok + '\n');
process.exit(report.ok ? 0 : 2);
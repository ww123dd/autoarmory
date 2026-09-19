#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const extractor = require('../src/lib/result-extractor');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
const sessions = args.session ? (Array.isArray(args.session) ? args.session : [args.session]) : [];
const report = extractor.extract(path.resolve(args.state), { sessions: sessions.map(function (item) { return path.resolve(item); }), apply: args.apply === true });
if (args.json) printJson(args.full ? report : Object.assign({}, report, { rows: undefined }));
else process.stdout.write('result-extract count=' + report.count + ' by_source=' + JSON.stringify(report.by_source) + (args.apply ? ' (written)' : '') + '\n');
process.exit(0);
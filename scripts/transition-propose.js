#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const proposer = require('../src/lib/transition-proposer');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
const report = proposer.proposeFile(path.resolve(args.state), { apply: args.apply === true, repo: path.resolve(args.repo || '.') });
if (args.json) printJson(args.full ? report : Object.assign({}, report, { rows: undefined }));
else process.stdout.write('transition-propose proposed=' + report.proposed + ' families=' + JSON.stringify(report.by_family) + (args.apply ? ' (written)' : '') + '\n');
process.exit(0);
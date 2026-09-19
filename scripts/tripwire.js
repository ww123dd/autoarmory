#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const tripwire = require('../src/lib/tripwire');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.repo) fail('--repo <repo> is required');
const report = tripwire.run(path.resolve(args.repo), args.vectors ? path.resolve(args.vectors) : null);
if (args.json) printJson(report); else process.stdout.write('tripwire ok=' + report.ok + ' verifiers=' + report.verifiers.length + '\n');
process.exit(report.ok ? 0 : 2);
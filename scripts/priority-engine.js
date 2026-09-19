#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const priority = require('../src/lib/priority-engine');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
if (!args.repo) fail('--repo <repo> is required');
const report = priority.run(path.resolve(args.state), path.resolve(args.repo));
if (args.json) printJson(report); else process.stdout.write('priority verifiers=' + report.verifiers.length + ' claims=' + report.claims.length + '\n');
process.exit(0);
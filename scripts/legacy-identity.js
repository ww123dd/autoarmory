#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const identity = require('../src/lib/legacy-identity');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
const report = identity.audit(path.resolve(args.state), { apply: args.apply === true });
if (args.json) printJson(report); else process.stdout.write('legacy-identity examined=' + report.examined + ' present=' + report.present + ' missing=' + report.missing + (args.apply ? ' (applied)' : '') + '\n');
process.exit(0);
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const { observeClaim } = require('../src/lib/observation');

function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
if (!args.repo) fail('--repo <repo> is required');
if (!args.claim) fail('--claim <claim.json> is required');
let claim;
try { claim = JSON.parse(fs.readFileSync(path.resolve(args.claim), 'utf8')); }
catch (error) { fail('unreadable claim: ' + error.message); }
const report = observeClaim(path.resolve(args.state), claim, { repo: path.resolve(args.repo) });
if (args.json) printJson(report);
else process.stdout.write('observation ' + report.status + ' verifier=' + (report.record && report.record.verifier_id || 'none') + ' authority=' + report.authority + '\n');
process.exit(0);
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const pep = require('../src/lib/pep-shadow');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.event) fail('--event <stop-event.json> is required');
if (!args.state) fail('--state <state-root> is required');
let event;
try { event = JSON.parse(fs.readFileSync(path.resolve(args.event), 'utf8')); } catch (error) { fail('event is unreadable: ' + error.message); }
let report;
try { report = pep.run(event, { state: path.resolve(args.state), repo: path.resolve(args.repo || process.cwd()), trials: Number(args.trials || 1) }); } catch (error) { fail('PEP shadow failed: ' + error.message); }
if (args.json) printJson(report);
else process.stdout.write('PEP shadow decisions=' + report.decisions.length + ' would_block=' + report.decisions.filter(function (item) { return item.decision === 'would-block'; }).length + '\n');
process.exit(0);

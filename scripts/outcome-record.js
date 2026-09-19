#!/usr/bin/env node
'use strict';
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const ledger = require('../src/lib/outcome-ledger');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.state) fail('--state <state-root> is required');
if (!args.decision) fail('--decision <decision_id> is required');
if (!args.type) fail('--type <accepted|rejected|overturned|reopened|expired|retracted> is required');
if (!args.actor) fail('--actor <actor> is required');
if (!args.source) fail('--source <source> is required');
if (!args.reason) fail('--reason <reason> is required');
try {
  const record = ledger.recordOutcome(path.resolve(args.state), { decision_id: args.decision, type: args.type, actor: args.actor, source: args.source, reason: args.reason, evidence_ref: args['evidence-ref'] || null });
  if (args.json) printJson(record); else process.stdout.write('recorded ' + record.outcome_id + ' ' + record.type + ' ' + record.decision_id + '\n');
} catch (error) { fail(error.message); }
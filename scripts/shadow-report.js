#!/usr/bin/env node
'use strict';

// Shadow evaluation: compare what the router recommended with what was actually used.
//
// The roadmap item is only meaningful with a real stream. So this tool has two modes and
// one rule:
//
//   usage: node scripts/shadow-report.js [--state .selfforge] [--json]
//          node scripts/shadow-report.js --record --decision <request_id> --used <capability_id>
//                                       --outcome success|failure --source operator|agent|service
//                                       [--note text] [--state .selfforge] [--json]
//
// Rule: with no recorded actual usage it reports `insufficient_real_stream` and prints no
// metrics at all. A follow rate invented from an empty stream would be a fabricated number.

const fs = require('fs');
const path = require('path');
const { parseArgs, readJsonl, writeJsonl, printJson, sha256 } = require('../src/lib/util');

const args = parseArgs(process.argv.slice(2));
const stateDir = path.resolve(args.state || '.selfforge');
const decisionsFile = path.join(stateDir, 'routing-decisions.jsonl');
const actualsFile = path.join(stateDir, 'routing-actual.jsonl');
const SOURCES = ['operator', 'agent', 'service'];
const OUTCOMES = ['success', 'failure'];

function fail(message, json) {
  if (json) printJson({ schema_version: 'autoarmory/shadow-report/v1', ok: false, shadow_status: 'blocked', errors: [message] });
  else process.stderr.write(message + '\n');
  process.exit(1);
}

if (args.record) {
  if (!args.decision) fail('--record needs --decision <request_id>', !!args.json);
  if (!args.used) fail('--record needs --used <capability_id>', !!args.json);
  if (OUTCOMES.indexOf(args.outcome) === -1) fail('--record needs --outcome success|failure', !!args.json);
  if (SOURCES.indexOf(args.source) === -1) fail('--record needs --source operator|agent|service; an unattributed observation is not evidence', !!args.json);
  const rows = readJsonl(actualsFile);
  const at = new Date().toISOString();
  const record = {
    schema_version: 'autoarmory/shadow-actual/v1',
    id: 'act-' + sha256(args.decision + ':' + args.used + ':' + at).slice(0, 12),
    decision_id: args.decision,
    used_capability_id: args.used,
    outcome: args.outcome,
    source: args.source,
    note: args.note || null,
    at: at
  };
  rows.push(record);
  fs.mkdirSync(stateDir, { recursive: true });
  writeJsonl(actualsFile, rows);
  if (args.json) printJson({ schema_version: 'autoarmory/shadow-actual/v1', ok: true, actual: record, total: rows.length });
  else process.stdout.write('recorded ' + record.id + ': ' + args.used + ' ' + args.outcome + ' (source ' + args.source + ')\n');
  process.exit(0);
}

const decisions = readJsonl(decisionsFile);
const actuals = readJsonl(actualsFile);
const missing = [];
if (!decisions.length) missing.push(decisionsFile);
if (!actuals.length) missing.push(actualsFile);
if (missing.length) {
  const report = {
    schema_version: 'autoarmory/shadow-report/v1',
    ok: true,
    shadow_status: 'insufficient_real_stream',
    decisions: decisions.length,
    actuals: actuals.length,
    missing: missing,
    metrics: null,
    reason: 'shadow metrics need both a recorded recommendation and a recorded actual usage; nothing is inferred from an empty stream'
  };
  if (args.json) printJson(report);
  else process.stdout.write('shadow: insufficient_real_stream (decisions=' + decisions.length + ', actuals=' + actuals.length + ')\n  missing: ' + missing.join(', ') + '\n  no metrics are reported until both streams carry real records\n');
  process.exit(1);
}

const byRequest = new Map();
for (const decision of decisions) byRequest.set(decision.request_id, decision);
const followed = [];
const diverged = [];
const unlinked = [];
for (const actual of actuals) {
  const decision = byRequest.get(actual.decision_id) || null;
  if (!decision) { unlinked.push(actual); continue; }
  const recommended = decision.selected && decision.selected[0] ? decision.selected[0].id : null;
  const row = { actual: actual.id, decision_id: actual.decision_id, task_id: decision.task_id || null, recommended: recommended, used: actual.used_capability_id, outcome: actual.outcome, source: actual.source };
  if (recommended && recommended === actual.used_capability_id) followed.push(row); else diverged.push(row);
}
const split = function (rows) {
  return { success: rows.filter(function (row) { return row.outcome === 'success'; }).length, failure: rows.filter(function (row) { return row.outcome === 'failure'; }).length };
};
const linked = followed.length + diverged.length;
const report = {
  schema_version: 'autoarmory/shadow-report/v1',
  ok: true,
  generated_at: new Date().toISOString(),
  shadow_status: linked ? 'ok' : 'insufficient_real_stream',
  decisions: decisions.length,
  actuals: actuals.length,
  linked: linked,
  unlinked_actuals: unlinked.length,
  metrics: linked ? {
    follow_rate: Number((followed.length / linked).toFixed(4)),
    followed: followed.length,
    diverged: diverged.length,
    followed_outcomes: split(followed),
    diverged_outcomes: split(diverged)
  } : null,
  divergences: diverged,
  unlinked: unlinked.map(function (row) { return { actual: row.id, decision_id: row.decision_id }; })
};
if (args.json) printJson(report);
else {
  process.stdout.write('shadow (' + report.shadow_status + '): decisions=' + report.decisions + ' actuals=' + report.actuals + ' linked=' + report.linked + ' unlinked=' + report.unlinked_actuals + '\n');
  if (report.metrics) {
    process.stdout.write('  follow_rate=' + report.metrics.follow_rate + ' (followed=' + report.metrics.followed + ', diverged=' + report.metrics.diverged + ')\n');
    process.stdout.write('  followed outcomes: ' + JSON.stringify(report.metrics.followed_outcomes) + '\n');
    process.stdout.write('  diverged outcomes: ' + JSON.stringify(report.metrics.diverged_outcomes) + '\n');
    for (const row of diverged) process.stdout.write('  diverged: ' + row.decision_id + ' recommended=' + row.recommended + ' used=' + row.used + ' outcome=' + row.outcome + '\n');
  }
}
process.exit(report.metrics ? 0 : 1);
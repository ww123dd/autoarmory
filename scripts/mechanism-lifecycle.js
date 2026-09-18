#!/usr/bin/env node
'use strict';

// Mechanical lifecycle actions for a mechanism: promote, roll back when the evidence
// that justified a promotion is gone, or list the current lifecycle.
//
// The rule this encodes: a verdict is not a promotion, and a promotion does not outlive
// the evidence behind it. `--rollback-if-stale` is the agent-side action that closes the
// loop `scripts/mechanism-preflight.js` refuses to let pass.
//
// usage: node scripts/mechanism-lifecycle.js --mechanism <id> --promote [--scope <json>] [--state .selfforge] [--repo .] [--actor codex] [--json]
//        node scripts/mechanism-lifecycle.js --mechanism <id> --rollback-if-stale [...]
//        node scripts/mechanism-lifecycle.js --list [...]

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const mechanism = require('../src/lib/mechanism');

function fail(message, json) {
  if (json) printJson({ schema_version: 'autoarmory/mechanism-lifecycle-action/v1', ok: false, errors: [message] });
  else process.stderr.write(message + '\n');
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const repo = path.resolve(args.repo || '.');
const stateDir = path.resolve(args.state || path.join(repo, '.selfforge'));
let requestedScope = null;
if (args.scope) {
  try { requestedScope = JSON.parse(args.scope); } catch (error) { fail('--scope must be a JSON object: ' + error.message, !!args.json); }
  if (!requestedScope || typeof requestedScope !== 'object' || Array.isArray(requestedScope)) fail('--scope must be a JSON object', !!args.json);
}
const options = { repo: repo, actor: args.actor || 'codex' };
if (requestedScope) options.scope = requestedScope;

if (!fs.existsSync(path.join(stateDir, 'mechanisms.jsonl'))) fail('no mechanism state in ' + stateDir, !!args.json);

if (args.list || (!args.mechanism && !args.promote)) {
  const rows = mechanism.listMechanisms(stateDir).map(function (item) {
    const life = mechanism.lifecycle(stateDir, item.id);
    const status = mechanism.status(stateDir, item.id, options);
    return { id: item.id, lifecycle: life.to, since: life.at, verdict: status.status, reason: status.reason, promotion: life.id || null };
  });
  const report = { schema_version: 'autoarmory/mechanism-lifecycle-action/v1', ok: true, action: 'list', state: stateDir, mechanisms: rows, stale_lifecycle_escape_count: mechanism.staleLifecycleEscapes(stateDir, options) };
  if (args.json) printJson(report);
  else {
    process.stdout.write('mechanism lifecycle in ' + stateDir + '\n');
    for (const row of rows) process.stdout.write('  ' + String(row.lifecycle).padEnd(10) + row.id + '  verdict=' + row.verdict + (row.since ? '  since ' + row.since : '') + '\n');
    process.stdout.write('  stale_lifecycle_escape_count=' + report.stale_lifecycle_escape_count + '\n');
  }
  process.exit(0);
}

const mechanismId = args.mechanism;
if (!mechanismId) fail('--mechanism <id> is required (or use --list)', !!args.json);

let result;
let action;
if (args.promote) { action = 'promote'; result = mechanism.promote(stateDir, mechanismId, options); }
else if (args['rollback-if-stale']) { action = 'rollback-if-stale'; result = mechanism.rollbackIfStale(stateDir, mechanismId, options); }
else fail('choose --promote or --rollback-if-stale (or --list)', !!args.json);

if (!result.ok) fail('lifecycle ' + action + ' failed: ' + (result.errors || []).join('; '), !!args.json);

const status = mechanism.status(stateDir, mechanismId, options);
const life = mechanism.lifecycle(stateDir, mechanismId);
const report = {
  schema_version: 'autoarmory/mechanism-lifecycle-action/v1',
  ok: true,
  action: action,
  performed: result.action,
  reason: result.reason || null,
  mechanism_id: mechanismId,
  lifecycle: life,
  verdict: status.status,
  stale_lifecycle_escape_count: mechanism.staleLifecycleEscapes(stateDir, options)
};
if (args.json) printJson(report);
else process.stdout.write(action + ' ' + mechanismId + ': ' + result.action + (result.reason ? ' (' + result.reason + ')' : '') + ' -> lifecycle=' + life.to + ' verdict=' + status.status + '\n');
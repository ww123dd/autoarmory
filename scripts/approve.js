#!/usr/bin/env node
'use strict';

// Record the operator's approval decision, mechanically.
//
// The one thing an agent must never author is "the operator approved". Everything
// around it is boilerplate: candidate id, scope, requester, timestamp, channel. This
// script keeps the decision with the operator and does the boilerplate:
//
//   - it refuses to record anything without the operator's own words (--quote);
//   - it refuses to approve a candidate that is not in pending_approval;
//   - --dry-run prints exactly what would be recorded, i.e. the approval request.
//
// usage: node scripts/approve.js --candidate <id> --quote "<operator's words>"
//        [--by user] [--scope gated] [--channel codex-chat] [--state .selfforge]
//        [--out <file>] [--dry-run] [--json]

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, readJsonl, writeJson, printJson, sha256 } = require('../src/lib/util');
const state = require('../src/lib/state');

function fail(message, json) {
  if (json) printJson({ schema_version: 'selfforge/approval-record/v1', ok: false, errors: [message] });
  else process.stderr.write(message + '\n');
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const stateDir = path.resolve(args.state || '.selfforge');
const candidateId = args.candidate;
const quote = typeof args.quote === 'string' ? args.quote.trim() : '';
let impact = null;
try { impact = args['impact-file'] ? readJson(path.resolve(args['impact-file'])) : JSON.parse(args.impact || 'null'); } catch (error) { impact = null; }

if (!candidateId) fail('an approval needs --candidate <id>; nothing was recorded', !!args.json);
if (quote.length < 8) fail('an approval needs the operator own words in --quote; without them nothing is recorded', !!args.json);
const impactCheck = state.validateApprovalImpact(impact);
if (!impactCheck.ok) fail('approval impact disclosure is incomplete: ' + impactCheck.errors.join('; '), !!args.json);

const transitions = readJsonl(path.join(stateDir, 'transitions.jsonl'));
const candidates = readJsonl(path.join(stateDir, 'candidates.jsonl'));
const candidate = candidates.find(function (item) { return item.id === candidateId; }) || null;
const current = state.currentState(transitions, candidateId, candidate && candidate.status ? candidate.status : 'candidate');
const scope = args.scope || 'gated';

const request = {
  schema_version: 'selfforge/approval-request/v1',
  candidate_id: candidateId,
  current_state: current,
  requested_by: 'agent',
  requested_action: scope,
  operator_quote: quote
};

if (current !== 'pending_approval') {
  fail('candidate ' + candidateId + ' is in "' + current + '", not pending_approval; an approval cannot be recorded out of order. Request: ' + JSON.stringify(request), !!args.json);
}

const approvedAt = new Date().toISOString();
const approval = {
  schema_version: 'selfforge/approval/v1',
  id: 'appr-' + sha256(candidateId + ':' + scope + ':' + quote + ':' + approvedAt).slice(0, 12),
  candidate_id: candidateId,
  requested_by: 'agent',
  approved_by: args.by || 'user',
  approved_at: approvedAt,
  status: 'approved',
  scope: scope,
  channel: args.channel || 'codex-chat',
  evidence: { quote: quote, recorded_by: 'codex', recorded_at: approvedAt }
};

if (args['dry-run']) {
  const output = { ok: true, dry_run: true, request: request, would_record: approval };
  if (args.json) printJson(output);
  else process.stdout.write('approval request (dry run, nothing recorded):\n  candidate ' + candidateId + '\n  state     ' + current + '\n  action    ' + scope + '\n  quote     "' + quote + '"\n');
  process.exit(0);
}

const out = args.out ? path.resolve(args.out) : path.join(stateDir, 'approvals', candidateId + '.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
writeJson(out, approval);

const report = { schema_version: 'selfforge/approval-record/v1', ok: true, request: request, approval: approval, approval_file: out };
if (args.json) printJson(report);
else process.stdout.write('recorded ' + approval.id + ' for ' + candidateId + ' (approved_by ' + approval.approved_by + ', scope ' + scope + ')\n  file  ' + out + '\n  quote "' + quote + '"\n');
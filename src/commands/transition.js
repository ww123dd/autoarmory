'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, readJsonl, writeJsonl, printJson, sha256 } = require('../lib/util');
const { fingerprint } = require('../lib/environment');
const { isGatePass, hasOutcomeEvidence } = require('../lib/gate');
const state = require('../lib/state');

function fail(message, json) {
  if (json) printJson({ schema_version: 'selfforge/transition/v1', ok: false, errors: [message] });
  else process.stderr.write(message + '\n');
  return 1;
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const stateDir = path.resolve(args.state || '.selfforge');
  const file = args._[0];
  let candidate = null;
  let candidateId = args.candidate;

  if (file) {
    candidate = readJson(path.resolve(file));
    candidateId = candidate.id;
  } else if (candidateId) {
    const candidateFile = path.join(stateDir, 'candidates.jsonl');
    if (fs.existsSync(candidateFile)) {
      candidate = readJsonl(candidateFile).find(function (item) { return item.id === candidateId; }) || null;
    }
  }
  if (!candidateId) return fail('Usage: autoarmory transition <candidate.json> --to <state> [--gate gate.json] [--evidence evidence.json] [--reason text]', !!args.json);
  if (!args.to) return fail('transition requires --to <state>', !!args.json);

  const transitionFile = path.join(stateDir, 'transitions.jsonl');
  const records = readJsonl(transitionFile);
  const fallback = candidate && candidate.status ? candidate.status : 'candidate';
  const from = state.currentState(records, candidateId, fallback);
  const validation = state.validate(from, args.to);
  if (!validation.ok) return fail(validation.errors.join('; '), !!args.json);

  let gate = candidate && candidate.gate;
  if (args.gate) gate = readJson(path.resolve(args.gate));
  if (state.requiresGate(args.to) && !isGatePass(gate, candidateId)) {
    return fail('transition requires a successful SkillCanary gate proof', !!args.json);
  }

  let approval = null;
  if (args.approval) approval = readJson(path.resolve(args.approval));
  if (state.requiresApproval(args.to) && !state.isApprovalPass(approval, candidateId, args.to)) {
    return fail('transition target ' + args.to + ' requires approved_by user approval evidence', !!args.json);
  }

  let evidence = null;
  if (args.evidence) evidence = readJson(path.resolve(args.evidence));
  if (state.requiresEvidence(args.to) && !hasOutcomeEvidence(evidence)) {
    return fail('transition requires outcome evidence with artifacts or before/after observations', !!args.json);
  }
  if (state.requiresReason(args.to) && (!args.reason || !String(args.reason).trim())) {
    return fail('rejected transition requires --reason', !!args.json);
  }

  const consumption = approval && state.requiresApproval(args.to) ? {
    schema_version: 'selfforge/consumption/v1',
    id: 'cons-' + sha256(candidateId + ':' + (approval.id || '') + ':' + args.to).slice(0, 12),
    decision_id: candidateId,
    consumer: { type: 'operator', id: approval.approved_by },
    consumed_at: approval.approved_at,
    action: 'approved',
    downstream_action: args.to,
    channel: approval.channel || null,
    outcome_ref: null
  } : null;
  const actor = (approval && approval.approved_by) || args.actor || 'codex';

  const record = {
    schema_version: 'selfforge/transition/v1',
    id: 'tr-' + sha256(candidateId + ':' + from + ':' + args.to + ':' + Date.now()).slice(0, 12),
    candidate_id: candidateId,
    actor: actor,
    from: from,
    to: args.to,
    reason: args.reason || null,
    gate: gate || null,
    approval: approval || null,
    consumption: consumption,
    evidence: evidence || null,
    environment: fingerprint(args.dir || '.'),
    at: new Date().toISOString()
  };
  fs.mkdirSync(stateDir, { recursive: true });
  records.push(record);
  writeJsonl(transitionFile, records);

  const candidatesFile = path.join(stateDir, 'candidates.jsonl');
  const candidates = fs.existsSync(candidatesFile) ? readJsonl(candidatesFile) : [];
  const hit = candidates.find(function (item) { return item.id === candidateId; });
  if (hit) {
    hit.status = args.to;
    if (gate) hit.gate = gate;
    writeJsonl(candidatesFile, candidates);
  } else if (candidate) {
    const stored = Object.assign({}, candidate, { status: args.to });
    if (gate) stored.gate = gate;
    candidates.push(stored);
    writeJsonl(candidatesFile, candidates);
  }

  if (args.json) printJson(record);
  else process.stdout.write('Transitioned ' + candidateId + ': ' + from + ' -> ' + args.to + '\n');
  return 0;
};

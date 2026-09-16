'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, readJsonl, writeJsonl } = require('../lib/util');
const { fingerprint } = require('../lib/environment');
const { isGatePass, hasOutcomeEvidence } = require('../lib/gate');

function fail(message) {
  process.stderr.write(message + '\n');
  return 1;
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const state = path.resolve(args.state || '.selfforge');
  const dir = path.resolve(args.dir || '.');
  const positional = args._[0];
  let record;

  if (positional && fs.existsSync(path.resolve(positional))) {
    record = readJson(path.resolve(positional));
  } else {
    record = {
      schema_version: 'selfforge/decision/v1',
      id: args.id || 'dec-' + Date.now(),
      candidate_id: args.candidate || 'unknown',
      action: args.action || 'unknown',
      outcome: args.outcome ? JSON.parse(args.outcome) : { fixed: args.fixed === 'true', regressed: args.regressed === 'true' },
      reward: Number(args.reward || 0),
      verified: args.verified === 'true'
    };
  }

  if (!record.schema_version) record.schema_version = 'selfforge/decision/v1';
  if (!record.id) record.id = 'dec-' + Date.now();
  if (typeof record.verified !== 'boolean') record.verified = args.verified === 'true';

  let gate = record.gate;
  if (args.gate) {
    gate = readJson(path.resolve(args.gate));
  } else if (!gate && record.candidate_id) {
    const candidateFile = path.join(state, 'candidates.jsonl');
    if (fs.existsSync(candidateFile)) {
      const candidate = readJsonl(candidateFile).find(function (item) { return item.id === record.candidate_id; });
      if (candidate) gate = candidate.gate;
    }
  }
  if (!isGatePass(gate, record.candidate_id)) {
    return fail('Refusing to record decision: a successful SkillCanary gate proof is required.');
  }

  let evidence = record.outcome_evidence;
  if (args.evidence) evidence = readJson(path.resolve(args.evidence));
  if (record.verified === true && !hasOutcomeEvidence(evidence)) {
    return fail('Refusing to record verified decision: outcome evidence with artifacts or before/after is required.');
  }

  const transitionFile = path.join(state, 'transitions.jsonl');
  const transitions = fs.existsSync(transitionFile) ? readJsonl(transitionFile) : [];
  const consumptions = transitions.map(function (item) { return item.consumption; }).filter(function (item) { return item && item.decision_id === record.candidate_id; });
  let consumptionRef = null;
  if (args.consumption) {
    const hit = consumptions.find(function (item) { return item.id === args.consumption; });
    if (!hit) return fail('Refusing to record decision: consumption event not found: ' + args.consumption);
    consumptionRef = hit;
  } else if (consumptions.length) {
    consumptionRef = consumptions[consumptions.length - 1];
  }
  if (consumptionRef) {
    record.consumption_ref = {
      schema_version: 'selfforge/consumption-ref/v1',
      id: consumptionRef.id,
      consumer: consumptionRef.consumer,
      consumed_at: consumptionRef.consumed_at,
      action: consumptionRef.action,
      downstream_action: consumptionRef.downstream_action
    };
  }
  record.gate = gate;
  record.environment = record.environment || fingerprint(dir);
  record.outcome_evidence = evidence || null;
  record.verified = record.verified === true;
  if (!record.recorded_at) record.recorded_at = new Date().toISOString();

  const file = path.join(state, 'decisions.jsonl');
  const existing = readJsonl(file);
  existing.push(record);
  writeJsonl(file, existing);
  process.stdout.write('Recorded decision ' + record.id + ' -> ' + file + '\n');
  return 0;
};

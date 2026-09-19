'use strict';
const fs = require('fs');
const path = require('path');
const { appendJsonl, readJsonl, sha256 } = require('./util');

const TYPES = ['accepted', 'rejected', 'overturned', 'reopened', 'expired', 'retracted'];
const SOURCES = ['user', 'approval_command', 'reject_command', 'user_correction', 'mechanism_status', 'expires_at', 'runner_freshness', 'artifact_drift'];
function resolveDecision(stateDir, decisionId) {
  const root = path.join(stateDir, 'reuse-records');
  if (!fs.existsSync(root)) throw new Error('reuse-records not found');
  for (const name of fs.readdirSync(root).filter(function (item) { return /\.json$/i.test(item); })) {
    try {
      const record = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
      if (record.decision_id === decisionId || record.change_id === decisionId) return record;
    } catch (_) {}
  }
  throw new Error('decision not found: ' + decisionId);
}
function recordOutcome(stateDir, input) {
  const value = input || {};
  const type = String(value.type || '');
  const source = String(value.source || '');
  if (TYPES.indexOf(type) === -1) throw new Error('unsupported outcome type: ' + type);
  if (SOURCES.indexOf(source) === -1) throw new Error('unsupported outcome source: ' + source);
  if (!value.actor) throw new Error('outcome.actor is required');
  if (!value.reason) throw new Error('outcome.reason is required');
  const decision = resolveDecision(stateDir, value.decision_id);
  const record = {
    schema_version: 'autoarmory/outcome-record/v1',
    type: type,
    outcome_id: 'outcome-' + sha256([decision.decision_id, type, source, value.actor, Date.now()].join(':')).slice(0, 16),
    decision_id: decision.decision_id,
    change_id: decision.change_id,
    verifier_id: decision.verifier || decision.source_verifier_id || null,
    mechanism_id: decision.mechanism_id || (decision.run && decision.run.mechanism_id) || null,
    run_id: decision.run && decision.run.id || null,
    claim_sha256: decision.claim_sha256 || null,
    claim_instance: decision.claim_instance || null,
    expected_provenance: decision.expected_provenance || null,
    actor: String(value.actor),
    source: source,
    observed_at: value.observed_at || new Date().toISOString(),
    reason: String(value.reason),
    evidence_ref: value.evidence_ref || (decision.run && decision.run.id) || decision.decision_id
  };
  appendJsonl(path.join(stateDir, 'outcome-records.jsonl'), [record]);
  return record;
}
function readOutcomes(stateDir) { return readJsonl(path.join(stateDir, 'outcome-records.jsonl')); }
module.exports = { TYPES, SOURCES, resolveDecision, recordOutcome, readOutcomes };
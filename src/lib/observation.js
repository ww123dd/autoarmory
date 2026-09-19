'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonl, writeJsonl, sha256 } = require('./util');
const { resolveClaim } = require('./verifier-resolver');
const verify = require('./verify');

function observeClaim(stateDir, claim, options) {
  const opts = options || {};
  const root = path.resolve(stateDir || opts.state || '.');
  const repo = path.resolve(opts.repo || '.');
  const resolution = resolveClaim(claim, { repo: repo });
  if (resolution.kind !== 'matched') return { schema_version: 'autoarmory/observation/v1', status: 'not_observed', authority: 'none', resolution: resolution, activates_case: false, gate_effect: 'none', wrote: [] };
  const verifier = resolution.verifier;
  if (!verifier || verifier.readonly !== true) return { schema_version: 'autoarmory/observation/v1', status: 'not_observed', authority: 'none', reason: 'matched verifier is not readonly', resolution: resolution, activates_case: false, gate_effect: 'none', wrote: [] };
  const changeId = claim.change_id || 'observation-' + sha256(JSON.stringify(claim)).slice(0, 16);
  const runId = 'obs-' + changeId + '-' + Date.now();
  const captured = verify.captureRefs([{ id: runId + '-ref', verifier: resolution.verifier_id, params: claim.inputs || {} }], {
    repo: repo,
    case_id: changeId,
    mechanism_id: 'observation',
    run_id: runId,
    trials: 1
  });
  const record = {
    schema_version: 'autoarmory/observation-record/v1',
    observation_id: 'obs-' + sha256(changeId + ':' + resolution.verifier_id + ':' + Date.now()).slice(0, 16),
    created_at: new Date().toISOString(),
    change_id: changeId,
    session_id: claim.session_id || null,
    turn_id: claim.turn_id || null,
    source_message_id: claim.source_message_id || null,
    claim_shape: claim,
    resolution_source: 'registry_schema_match',
    verifier_binding_source: 'resolver',
    verifier_id: resolution.verifier_id,
    status: captured.status,
    observed: captured.refs && captured.refs[0] && captured.refs[0].fresh ? captured.refs[0].fresh.observed : null,
    reason: captured.reason || null,
    authority: 'none',
    activates_case: false,
    gate_effect: 'none',
    writes_pending: false,
    writes_run: false,
    writes_closure: false,
    writes_reuse_record: false
  };
  const file = path.join(root, 'observation-records.jsonl');
  const rows = fs.existsSync(file) ? readJsonl(file) : [];
  rows.push(record);
  writeJsonl(file, rows);
  return { schema_version: 'autoarmory/observation/v1', status: captured.status, authority: 'none', activates_case: false, gate_effect: 'none', record: record, wrote: ['observation-records.jsonl'] };
}
module.exports = { observeClaim };
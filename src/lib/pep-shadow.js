'use strict';
const fs = require('fs');
const path = require('path');
const { appendJsonl, readJsonl } = require('./util');
const verify = require('./verify');
const gapInput = require('./verification-gap-input');

function mechanismsFor(stateDir) {
  const file = path.join(stateDir, 'mechanisms.jsonl');
  return fs.existsSync(file) ? readJsonl(file) : [];
}
function run(event, options) {
  const opts = options || {};
  const stateDir = path.resolve(opts.state || '.selfforge');
  const repo = path.resolve(opts.repo || process.cwd());
  const input = gapInput.fromStopEvent(event || {}, { checkPattern: opts.checkPattern });
  const candidates = mechanismsFor(stateDir).filter(function (item) {
    const enforcement = item && item.enforcement || {};
    return enforcement.point === 'stop_hook' && (enforcement.mode === 'observe' || enforcement.mode === 'shadow') && item.scope && item.scope.artifact_type === 'stop-event';
  });
  const decisions = [];
  for (const mechanism of candidates) {
    const captured = verify.captureRefs([{ id: mechanism.id + '-gap', verifier: mechanism.verifier_id, params: { instance: input } }], { repo: repo, trials: opts.trials || 1 });
    const fresh = captured.captured && captured.captured[0] ? captured.captured[0] : null;
    const observed = captured.refs && captured.refs[0] && captured.refs[0].fresh ? captured.refs[0].fresh.observed : null;
    const decision = captured.status === 'captured' && observed && observed.verification_gap_count > 0 ? 'would-block' : 'would-allow';
    decisions.push({
      schema_version: 'autoarmory/pep-shadow-decision/v1',
      at: new Date().toISOString(),
      mechanism_id: mechanism.id,
      session_id: event && event.session_id || null,
      turn_id: event && event.turn_id || null,
      decision: decision,
      verification_status: captured.status,
      verification_gap_count: observed ? observed.verification_gap_count : null,
      independent_check_count: observed ? observed.independent_check_count : null,
      transcript_sha256: input.transcript_sha256,
      evidence_ref: fresh ? { input_sha256: fresh.input_sha256, output_sha256: fresh.output_sha256, exit_code: fresh.exit_code } : null
    });
  }
  if (decisions.length) appendJsonl(path.join(stateDir, 'pep-shadow.jsonl'), decisions);
  return { schema_version: 'autoarmory/pep-shadow-run/v1', ok: true, state: stateDir, repo: repo, decisions: decisions };
}
module.exports = { run };

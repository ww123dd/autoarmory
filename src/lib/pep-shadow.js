'use strict';
const fs = require('fs');
const path = require('path');
const { appendJsonl, readJsonl } = require('./util');
const verify = require('./verify');
const gapInput = require('./verification-gap-input');
const columnInput = require('./column-verify-input');

function mechanismsFor(stateDir) {
  const file = path.join(stateDir, 'mechanisms.jsonl');
  return fs.existsSync(file) ? readJsonl(file) : [];
}
function run(event, options) {
  const opts = options || {};
  const stateDir = path.resolve(opts.state || '.selfforge');
  const repo = path.resolve(opts.repo || process.cwd());
  const candidates = mechanismsFor(stateDir).filter(function (item) {
    const enforcement = item && item.enforcement || {};
    const artifact = item && item.scope && item.scope.artifact_type;
    return enforcement.point === 'stop_hook' && (enforcement.mode === 'observe' || enforcement.mode === 'shadow') && (artifact === 'stop-event' || artifact === 'sql-delivery');
  });
  const decisions = [];
  for (const mechanism of candidates) {
    try {
      if (mechanism.verifier_id === 'verification-gap') {
        const input = gapInput.fromStopEvent(event || {}, { checkPattern: opts.checkPattern });
        const captured = verify.captureRefs([{ id: mechanism.id + '-gap', verifier: mechanism.verifier_id, params: { instance: input } }], { repo: repo, trials: opts.trials || 1 });
        const fresh = captured.captured && captured.captured[0] ? captured.captured[0] : null;
        const observed = captured.refs && captured.refs[0] && captured.refs[0].fresh ? captured.refs[0].fresh.observed : null;
        decisions.push({
          schema_version: 'autoarmory/pep-shadow-decision/v1', at: new Date().toISOString(), mechanism_id: mechanism.id, session_id: event && event.session_id || null, turn_id: event && event.turn_id || null,
          decision: captured.status === 'captured' && observed && observed.verification_gap_count > 0 ? 'would-block' : 'would-allow',
          verification_status: captured.status, verification_gap_count: observed ? observed.verification_gap_count : null, independent_check_count: observed ? observed.independent_check_count : null,
          transcript_sha256: input.transcript_sha256, evidence_ref: fresh ? { input_sha256: fresh.input_sha256, output_sha256: fresh.output_sha256, exit_code: fresh.exit_code } : null
        });
      } else if (mechanism.verifier_id === 'shuzang-column-verify-checker') {
        const input = columnInput.fromStopEvent(event || {}, { checkPattern: opts.checkPattern });
        const captured = verify.captureRefs([{ id: mechanism.id + '-column', verifier: mechanism.verifier_id, params: { instance: input } }], { repo: repo, trials: opts.trials || 1 });
        const fresh = captured.captured && captured.captured[0] ? captured.captured[0] : null;
        const observed = captured.refs && captured.refs[0] && captured.refs[0].fresh ? captured.refs[0].fresh.observed : null;
        decisions.push({
          schema_version: 'autoarmory/pep-shadow-decision/v1', at: new Date().toISOString(), mechanism_id: mechanism.id, session_id: event && event.session_id || null, turn_id: event && event.turn_id || null,
          decision: captured.status === 'captured' && observed && observed.should_block ? 'would-block' : 'would-allow',
          verification_status: captured.status, should_block: observed ? observed.should_block : null, has_delivery: observed ? observed.has_delivery : null, has_column_token: observed ? observed.has_column_token : null,
          has_verification: observed ? observed.has_verification : null, has_hedge: observed ? observed.has_hedge : null, evidence_ref: fresh ? { input_sha256: fresh.input_sha256, output_sha256: fresh.output_sha256, exit_code: fresh.exit_code } : null
        });
      }
    } catch (error) {
      decisions.push({ schema_version: 'autoarmory/pep-shadow-decision/v1', at: new Date().toISOString(), mechanism_id: mechanism.id, session_id: event && event.session_id || null, turn_id: event && event.turn_id || null, decision: 'unverifiable', reason: String(error && error.message || error) });
    }
  }
  if (decisions.length) appendJsonl(path.join(stateDir, 'pep-shadow.jsonl'), decisions);
  return { schema_version: 'autoarmory/pep-shadow-run/v1', ok: true, state: stateDir, repo: repo, decisions: decisions };
}
module.exports = { run };

'use strict';

const { sha256 } = require('./util');
const IMPLEMENTABLE = new Set([
  'add_admission_gate',
  'add_counterexample_replay',
  'update_boundary',
  'add_failure_mode',
  'add_case',
  'add_canary',
  'add_drift_check',
  'add_guard'
]);

function evidenceKey(candidate) {
  const evidence = Array.isArray(candidate.evidence) ? candidate.evidence.join(' ') : String(candidate.evidence || '');
  return String(candidate.failure_mode || '') + '|' + evidence.replace(/\s+/g, ' ').trim();
}

function admit(candidates, options) {
  const opts = options || {};
  const seen = new Set();
  const decisions = [];
  for (const candidate of candidates || []) {
    let status = 'candidate';
    let reason = 'gate proof required before admission';
    if (candidate.action === 'mark_duplicate') {
      status = 'duplicate';
      reason = 'explicit duplicate ingestion marker';
    } else if (!candidate.gate || candidate.gate.ok !== true) {
      status = 'candidate';
    } else if (!candidate.failure_mode) {
      status = 'technical_input';
      reason = 'no failure_mode; retain as technical input';
    } else if (!IMPLEMENTABLE.has(candidate.action) || candidate.action === 'add_evidence') {
      status = 'observed';
      reason = 'no concrete implementable action yet';
    } else {
      const key = evidenceKey(candidate);
      if (seen.has(key)) {
        status = 'duplicate';
        reason = 'same failure_mode and evidence already admitted';
      } else {
        seen.add(key);
        status = 'admitted';
        reason = 'gate passed and action has concrete acceptance criteria';
      }
    }
    decisions.push({ schema_version: 'autoarmory/admission/v1', id: 'adm-' + sha256(candidate.id + ':' + status).slice(0, 12), candidate_id: candidate.id, failure_mode: candidate.failure_mode || null, action: candidate.action || null, status: status, reason: reason, evidence: candidate.evidence || [] });
  }
  return { schema_version: 'autoarmory/admission/v1', decisions: decisions, summary: decisions.reduce(function (acc, item) { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {}) };
}
module.exports = { admit, IMPLEMENTABLE };

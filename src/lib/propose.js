'use strict';

const ACTION_MAP = { test_failure: 'add_case', runtime_error: 'add_canary', dead_reference: 'fix_reference', security_finding: 'add_guard', drift: 'add_drift_check', missing_evidence: 'add_evidence', todo: 'collect_evidence' };
const RISK_MAP = { critical: 'high', high: 'medium', medium: 'medium', low: 'low' };

function propose(incidents) {
  return incidents.map(function (incident) {
    const action = ACTION_MAP[incident.failure_mode] || 'collect_evidence';
    const targetId = incident.id;
    const targetKind = action === 'add_case' ? 'case' : 'deterministic';
    const expected = action === 'add_case' ? 'FAIL->PASS' : 'COUNT->0';
    const reason = 'Observed incident ' + incident.id + ': ' + (incident.evidence || incident.failure_mode || 'failure signal');
    const decision = 'Apply ' + action + ' to ' + targetId + ' and verify the expected ' + expected + ' transition.';
    return {
      schema_version: 'selfforge/candidate/v1',
      id: 'cand-' + incident.id.replace(/^inc-/, ''),
      incident_id: incident.id,
      action: action,
      target: { kind: targetKind, id: targetId, check: targetKind === 'deterministic' ? targetId : undefined },
      expected_transition: expected,
      prediction: { fix: [incident.id], regress_risk: ['existing-behavior'] },
      evidence: [incident.evidence],
      risk: RISK_MAP[incident.severity] || 'medium',
      status: 'candidate',
      change: {
        skill: incident.skill || 'unknown-skill',
        reason: reason,
        decision: decision,
        production_change: incident.production_change === true,
        budget: { repeat: 3, max_runs: 9 }
      },
      created_at: new Date().toISOString()
    };
  });
}

module.exports = { propose, ACTION_MAP };

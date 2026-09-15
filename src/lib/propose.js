'use strict';

const ACTION_MAP = { test_failure: 'add_case', runtime_error: 'add_canary', dead_reference: 'fix_reference', security_finding: 'add_guard', drift: 'add_drift_check', missing_evidence: 'add_evidence', todo: 'collect_evidence' };
const RISK_MAP = { critical: 'high', high: 'medium', medium: 'medium', low: 'low' };

function propose(incidents) {
  return incidents.map(function (incident) {
    const action = ACTION_MAP[incident.failure_mode] || 'collect_evidence';
    return { schema_version: 'selfforge/candidate/v1', id: 'cand-' + incident.id.replace(/^inc-/, ''), incident_id: incident.id, action, target: { kind: action === 'add_case' ? 'case' : 'deterministic', id: incident.id }, expected_transition: action === 'add_case' ? 'FAIL->PASS' : 'COUNT->0', prediction: { fix: [incident.id], regress_risk: ['existing-behavior'] }, evidence: [incident.evidence], risk: RISK_MAP[incident.severity] || 'medium', status: 'candidate', created_at: new Date().toISOString() };
  });
}

module.exports = { propose, ACTION_MAP };

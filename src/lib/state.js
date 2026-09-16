'use strict';

const ALLOWED = {
  candidate: ['pending_approval', 'rejected'],
  pending_approval: ['gated', 'rejected'],
  gated: ['shadow', 'rejected'],
  shadow: ['canary', 'rejected'],
  canary: ['promoted', 'rejected'],
  promoted: ['retired'],
  rejected: [],
  retired: []
};

function currentState(records, candidateId, fallback) {
  const list = (records || []).filter(function (record) { return record.candidate_id === candidateId; });
  return list.length ? list[list.length - 1].to : (fallback || 'candidate');
}

function validate(from, to) {
  const allowed = ALLOWED[from] || [];
  if (allowed.indexOf(to) !== -1) return { ok: true, errors: [] };
  return { ok: false, errors: ['invalid transition: ' + from + ' -> ' + to] };
}

function isApprovalPass(approval, candidateId, scope) {
  return !!approval &&
    approval.schema_version === 'selfforge/approval/v1' &&
    approval.candidate_id === candidateId &&
    approval.status === 'approved' &&
    approval.requested_by === 'agent' &&
    typeof approval.approved_by === 'string' && approval.approved_by.trim() !== '' &&
    typeof approval.approved_at === 'string' && approval.approved_at.trim() !== '' &&
    approval.scope === scope;
}

function requiresApproval(to) {
  return to === 'gated';
}
function requiresGate(to) {
  return to === 'gated' || to === 'shadow';
}

function requiresEvidence(to) {
  return to === 'canary' || to === 'promoted';
}

function requiresReason(to) {
  return to === 'rejected';
}

module.exports = { ALLOWED, currentState, validate, isApprovalPass, requiresGate, requiresApproval, requiresEvidence, requiresReason };

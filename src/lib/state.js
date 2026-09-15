'use strict';

const ALLOWED = {
  candidate: ['gated', 'rejected'],
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

function requiresGate(to) {
  return to === 'gated' || to === 'shadow';
}

function requiresEvidence(to) {
  return to === 'canary' || to === 'promoted';
}

function requiresReason(to) {
  return to === 'rejected';
}

module.exports = { ALLOWED, currentState, validate, requiresGate, requiresEvidence, requiresReason };

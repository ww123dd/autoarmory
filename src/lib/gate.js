'use strict';

const skillcanary = require('./skillcanary');

function gate(candidate) {
  const errors = [];
  const warnings = [];
  if (!candidate) {
    return { ok: false, errors: ['schema_version must be selfforge/candidate/v1'], warnings: warnings, candidate_id: null };
  }
  if (candidate.schema_version !== 'selfforge/candidate/v1') errors.push('schema_version must be selfforge/candidate/v1');
  if (!candidate.id) errors.push('missing id');
  if (!candidate.action) errors.push('missing action');
  if (!candidate.target || !candidate.target.kind || !candidate.target.id) errors.push('missing target');
  if (!candidate.expected_transition) errors.push('missing expected_transition');
  if (!Array.isArray(candidate.evidence) || candidate.evidence.length === 0) errors.push('missing evidence');
  if (!candidate.prediction || !Array.isArray(candidate.prediction.fix) || !Array.isArray(candidate.prediction.regress_risk)) warnings.push('prediction is incomplete');
  if (candidate.risk === 'high') warnings.push('high-risk candidate requires human approval before execution');
  return { ok: errors.length === 0, errors: errors, warnings: warnings, candidate_id: candidate.id };
}

function isGatePass(gate, candidateId) {
  if (!gate || gate.schema_version !== 'selfforge/gate/v1' || gate.ok !== true) return false;
  if (candidateId && gate.candidate_id !== candidateId) return false;
  const remote = gate.skillcanary;
  return !!remote &&
    remote.schema_version === 'selfforge/skillcanary-gate/v1' &&
    remote.command === 'gate' &&
    remote.ok === true &&
    remote.exit_code === 0 &&
    typeof remote.change_sha256 === 'string' &&
    remote.change_sha256.length === 64;
}

function hasOutcomeEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || !evidence.kind) return false;
  if (Array.isArray(evidence.artifacts) && evidence.artifacts.length > 0) return true;
  return !!evidence.before && !!evidence.after;
}

function gateCandidate(candidate, options) {
  const localResult = gate(candidate);
  const skillcanaryResult = skillcanary.gate(candidate, options);
  return {
    schema_version: 'selfforge/gate/v1',
    ok: localResult.ok && skillcanaryResult.ok,
    candidate_id: candidate && candidate.id,
    local: localResult,
    skillcanary: skillcanaryResult,
    errors: localResult.errors.concat(skillcanaryResult.errors || []),
    warnings: localResult.warnings.concat(skillcanaryResult.warnings || [])
  };
}

module.exports = { gate, gateCandidate, isGatePass, hasOutcomeEvidence };

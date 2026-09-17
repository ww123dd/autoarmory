'use strict';

const { sha256Value } = require('./verify');

function valueOf(criteria) {
  if (criteria === undefined || criteria === null) return null;
  if (typeof criteria === 'string') return criteria.trim();
  if (typeof criteria === 'object') return criteria;
  return null;
}
function nonEmpty(criteria) {
  const value = valueOf(criteria);
  if (typeof value === 'string') return value.length > 0;
  return !!value && Object.keys(value).length > 0;
}
function resolveDoneContract(caseRecord, mechanism) {
  const doneCriteria = caseRecord && caseRecord.done_criteria;
  const verifier = caseRecord && caseRecord.verifier;
  if (nonEmpty(doneCriteria) && verifier) {
    return {
      ok: true,
      source: 'case',
      verifier: verifier,
      done_criteria: valueOf(doneCriteria),
      done_criteria_sha256: sha256Value(valueOf(doneCriteria))
    };
  }
  return {
    ok: false,
    source: null,
    verifier: verifier || null,
    done_criteria: valueOf(doneCriteria),
    done_criteria_sha256: nonEmpty(doneCriteria) ? sha256Value(valueOf(doneCriteria)) : null,
    errors: [
      !nonEmpty(doneCriteria) ? 'case.done_criteria is required to close' : null,
      !verifier ? 'case.verifier is required to close' : null
    ].filter(Boolean)
  };
}
function evidenceRef(run) {
  return {
    run_id: run.id,
    verifier: run.evidence_refs && run.evidence_refs[0] ? run.evidence_refs[0].verifier || null : null,
    input_sha256: run.input_sha256 || null,
    output_sha256: run.output_sha256 || null,
    exit_code: Number.isInteger(run.exit_code) ? run.exit_code : null,
    result: run.result || null
  };
}
function evaluateDoneContract(caseRecord, mechanism, run, verification) {
  const contract = resolveDoneContract(caseRecord, mechanism);
  const errors = contract.errors ? contract.errors.slice() : [];
  if (contract.ok && mechanism && contract.verifier !== mechanism.verifier_id) {
    errors.push('case.verifier must equal mechanism.verifier_id: ' + mechanism.verifier_id);
  }
  if (contract.ok && run && !(run.evidence_refs || []).some(function (ref) { return ref && ref.verifier === contract.verifier; })) {
    errors.push('run does not carry the case verifier evidence: ' + contract.verifier);
  }
  if (!verification || verification.status !== 'verified') errors.push('completion is unverified: the external verifier did not re-derive the fact');
  if (!run || run.result !== 'pass') errors.push('completion is unverified: the run did not pass');
  if (run && run.regression === true) errors.push('completion is unverified: the run introduced a regression');
  if (!run || !run.counterexample || typeof run.counterexample !== 'object' || Object.keys(run.counterexample).length === 0) errors.push('completion is unverified: no counterexample was recorded');
  return {
    ok: errors.length === 0,
    source: contract.source,
    verifier: contract.verifier,
    done_criteria: contract.done_criteria,
    done_criteria_sha256: contract.done_criteria_sha256,
    verification_gap_count: errors.length ? 1 : 0,
    evidence_ref: evidenceRef(run),
    errors: errors
  };
}
module.exports = { resolveDoneContract, evaluateDoneContract };
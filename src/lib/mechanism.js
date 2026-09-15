'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonl, writeJsonl } = require('./util');
const verify = require('./verify');

const STATUSES = ['unverified', 'verified', 'expired', 'bypassed', 'closed'];
function files(stateDir) {
  return {
    cases: path.join(stateDir, 'cases.jsonl'),
    mechanisms: path.join(stateDir, 'mechanisms.jsonl'),
    runs: path.join(stateDir, 'mechanism-runs.jsonl'),
    closures: path.join(stateDir, 'closures.jsonl')
  };
}
function read(file) { return fs.existsSync(file) ? readJsonl(file) : []; }
function append(file, value) { const rows = read(file); rows.push(value); writeJsonl(file, rows); return value; }
function requireFields(value, fields, label) {
  const errors = [];
  for (const field of fields) if (value[field] === undefined || value[field] === null || value[field] === '') errors.push(label + '.' + field + ' is required');
  return errors;
}
function recordExists(rows, id, label) { return rows.some(function (item) { return item.id === id; }) ? [label + ' already exists: ' + id] : []; }
function verificationFailure(result) {
  const detail = (result.checks || []).filter(function (item) { return item.status !== 'pass'; }).map(function (item) { return item.id + ': ' + item.detail; }).join('; ');
  return 'mechanism run verification failed: ' + (result.reason || 'not verified') + (detail ? ' [' + detail + ']' : '');
}
function observedValues(result) {
  return (result.refs || []).map(function (item) { return item.fresh && item.fresh.observed; }).filter(function (value) { return value !== undefined && value !== null; });
}
function sameValue(left, right) { return verify.canonicalize(left) === verify.canonicalize(right); }
function usesVerifier(record, verifierId) {
  return !!(record && Array.isArray(record.evidence_refs) && record.evidence_refs.some(function (ref) { return ref && ref.verifier === verifierId; }));
}

function admitCase(stateDir, value) {
  const input = value || {};
  const errors = requireFields(input, ['schema_version', 'id', 'incident_id', 'title', 'expected_transition', 'failure_mode', 'severity', 'evidence', 'reproducible', 'owner'], 'case');
  if (input.schema_version !== 'autoarmory/case/v1') errors.push('schema_version must be autoarmory/case/v1');
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) errors.push('case.evidence must be a non-empty array');
  if (input.reproducible !== true) errors.push('case must be reproducible before admission');
  if (errors.length) return { ok: false, errors: errors };
  const state = files(stateDir);
  const rows = read(state.cases);
  const duplicate = recordExists(rows, input.id, 'case');
  if (duplicate.length) return { ok: false, errors: duplicate };
  const record = Object.assign({}, input, { schema_version: 'autoarmory/case/v1', status: 'admitted', admitted_at: new Date().toISOString() });
  append(state.cases, record);
  return { ok: true, case: record };
}

function registerMechanism(stateDir, value, options) {
  const input = value || {};
  const opts = options || {};
  const errors = requireFields(input, ['schema_version', 'id', 'name', 'covered_failure_modes', 'trigger', 'action', 'verification', 'verifier_id', 'closure_criteria', 'owner', 'version'], 'mechanism');
  if (input.schema_version !== 'autoarmory/mechanism/v1') errors.push('schema_version must be autoarmory/mechanism/v1');
  if (!Array.isArray(input.covered_failure_modes) || input.covered_failure_modes.length === 0) errors.push('mechanism.covered_failure_modes must be a non-empty array');
  const inventory = verify.listVerifiers(opts.repo || stateDir);
  if (!inventory.ok) {
    errors.push('mechanism.verifier_id cannot be checked: ' + inventory.errors.join('; '));
  } else {
    const declared = inventory.verifiers.find(function (item) { return item.id === input.verifier_id; });
    if (!declared) errors.push('mechanism.verifier_id is not registered: ' + input.verifier_id);
    else if (declared.integrity !== true) errors.push('mechanism.verifier_id adapter is missing or modified: ' + input.verifier_id);
  }
  if (errors.length) return { ok: false, errors: errors };
  const state = files(stateDir);
  const rows = read(state.mechanisms);
  const duplicate = recordExists(rows, input.id, 'mechanism');
  if (duplicate.length) return { ok: false, errors: duplicate };
  const record = Object.assign({}, input, { schema_version: 'autoarmory/mechanism/v1', status: input.status || 'proposed', registered_at: new Date().toISOString() });
  append(state.mechanisms, record);
  return { ok: true, mechanism: record };
}

function recordMechanismRun(stateDir, value, options) {
  const input = value || {};
  const opts = options || {};
  const state = files(stateDir);
  const mechanisms = read(state.mechanisms);
  const cases = read(state.cases);
  const mechanism = mechanisms.find(function (item) { return item.id === input.mechanism_id; }) || null;
  const errors = requireFields(input, ['schema_version', 'id', 'mechanism_id', 'case_id', 'actor', 'evidence_refs', 'counterexample', 'environment_fingerprint', 'started_at', 'finished_at'], 'mechanism_run');
  if (input.schema_version !== 'autoarmory/mechanism-run/v1') errors.push('schema_version must be autoarmory/mechanism-run/v1');
  if (!mechanism) errors.push('mechanism not found: ' + input.mechanism_id);
  if (!cases.some(function (item) { return item.id === input.case_id; })) errors.push('case not found: ' + input.case_id);
  if (!Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0) errors.push('mechanism_run.evidence_refs must be a non-empty array');
  else if (mechanism && !usesVerifier(input, mechanism.verifier_id)) errors.push('mechanism_run.evidence_refs must include the mechanism verifier: ' + mechanism.verifier_id);
  if (!input.counterexample || typeof input.counterexample !== 'object' || Array.isArray(input.counterexample) || Object.keys(input.counterexample).length === 0) errors.push('mechanism_run.counterexample must be a non-empty object');
  if (input.regression !== undefined && typeof input.regression !== 'boolean') errors.push('mechanism_run.regression must be boolean when present');

  const verification = verify.verifyRecord(input, {
    repo: opts.repo || stateDir,
    case_id: input.case_id,
    mechanism_id: input.mechanism_id,
    run_id: input.id,
    trials: opts.trials,
    require_record: false
  });
  if (verification.status !== 'verified') errors.push(verificationFailure(verification));
  if (verification.status === 'verified' && input.counterexample && Object.prototype.hasOwnProperty.call(input.counterexample, 'observed')) {
    const observed = observedValues(verification);
    if (observed.length > 0 && !observed.some(function (item) { return sameValue(item, input.counterexample.observed); })) {
      errors.push('mechanism_run.counterexample.observed does not match any re-derived observation');
    }
  }
  if (errors.length) return { ok: false, errors: errors };

  const record = Object.assign({}, input, {
    schema_version: 'autoarmory/mechanism-run/v1',
    input_sha256: verification.input_sha256,
    output_sha256: verification.output_sha256,
    exit_code: verification.exit_code,
    result: verification.result,
    verification_result: verification,
    recorded_at: new Date().toISOString()
  });
  delete record.verification;
  delete record.verified;
  delete record.verified_by;
  append(state.runs, record);
  return { ok: true, run: record };
}

function closeCase(stateDir, caseId, runId, options) {
  const opts = options || {};
  const state = files(stateDir);
  const cases = read(state.cases);
  const runs = read(state.runs);
  const mechanisms = read(state.mechanisms);
  const closures = read(state.closures);
  const item = cases.find(function (entry) { return entry.id === caseId; });
  const run = runs.find(function (entry) { return entry.id === runId; });
  if (!item) return { ok: false, errors: ['case not found: ' + caseId] };
  if (!run) return { ok: false, errors: ['run not found: ' + runId] };
  if (run.case_id !== caseId) return { ok: false, errors: ['run does not belong to case'] };
  const mechanism = mechanisms.find(function (entry) { return entry.id === run.mechanism_id; });
  if (!mechanism) return { ok: false, errors: ['mechanism not found: ' + run.mechanism_id] };
  if (!usesVerifier(run, mechanism.verifier_id)) return { ok: false, errors: ['run does not use mechanism verifier: ' + mechanism.verifier_id] };
  const verification = verify.verifyRecord(run, {
    repo: opts.repo || stateDir,
    case_id: caseId,
    mechanism_id: run.mechanism_id,
    run_id: runId,
    trials: opts.trials,
    require_record: true
  });
  if (verification.status !== 'verified') return { ok: false, errors: [verificationFailure(verification)] };
  if (run.result !== 'pass') return { ok: false, errors: ['run did not pass'] };
  if (run.regression === true) return { ok: false, errors: ['run introduced a regression'] };
  if (!run.counterexample || typeof run.counterexample !== 'object' || Object.keys(run.counterexample).length === 0) return { ok: false, errors: ['run is missing a counterexample'] };
  if (closures.some(function (entry) { return entry.case_id === caseId && entry.run_id === runId; })) return { ok: false, errors: ['case already closed for this run'] };
  const closure = { schema_version: 'autoarmory/closure/v1', id: 'close-' + runId, case_id: caseId, mechanism_id: run.mechanism_id, run_id: runId, status: 'closed', closed_at: new Date().toISOString() };
  append(state.closures, closure);
  return { ok: true, closure: closure };
}

function status(stateDir, mechanismId, options) {
  const opts = options || {};
  const state = files(stateDir);
  const mechanism = read(state.mechanisms).find(function (item) { return item.id === mechanismId; });
  if (!mechanism) return { ok: false, errors: ['mechanism not found: ' + mechanismId] };
  const runs = read(state.runs).filter(function (item) { return item.mechanism_id === mechanismId; });
  const closures = read(state.closures).filter(function (item) { return item.mechanism_id === mechanismId; });
  const latest = runs.slice().sort(function (a, b) { return Date.parse(a.finished_at || a.recorded_at) - Date.parse(b.finished_at || b.recorded_at); }).pop();
  let verdict = 'unverified';
  let reason = 'no mechanism run recorded';
  if (latest && !usesVerifier(latest, mechanism.verifier_id)) {
    reason = 'latest run does not use mechanism verifier: ' + mechanism.verifier_id;
  } else if (latest) {
    const checkResult = verify.verifyRecord(latest, {
      repo: opts.repo || stateDir,
      case_id: latest.case_id,
      mechanism_id: mechanismId,
      run_id: latest.id,
      trials: opts.trials,
      require_record: true
    });
    const ageDays = (Date.now() - Date.parse(latest.finished_at || latest.recorded_at)) / 86400000;
    const staleDays = Number(mechanism.verification_stale_days || 30);
    if (checkResult.status !== 'verified') { verdict = 'unverified'; reason = verificationFailure(checkResult); }
    else if (latest.result !== 'pass' || latest.regression === true) { verdict = 'bypassed'; reason = 'latest run failed or regressed'; }
    else if (ageDays > staleDays) { verdict = 'expired'; reason = 'latest run is older than verification_stale_days'; }
    else if (closures.some(function (item) { return item.case_id === latest.case_id; })) { verdict = 'closed'; reason = 'latest verified run closed the case'; }
    else { verdict = 'verified'; reason = 'latest run verification passed and has not been closed'; }
  }
  return { ok: true, schema_version: 'autoarmory/mechanism-status/v1', mechanism_id: mechanismId, status: verdict, reason: reason, latest_run_id: latest ? latest.id : null, verified_at: latest ? (latest.finished_at || latest.recorded_at) : null };
}
function listMechanisms(stateDir) { return read(files(stateDir).mechanisms); }

module.exports = { STATUSES, files, admitCase, registerMechanism, recordMechanismRun, closeCase, status, listMechanisms };

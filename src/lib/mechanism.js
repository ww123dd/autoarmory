'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonl, writeJsonl } = require('./util');

const RUN_RESULTS = ['pass', 'fail'];
const STATUSES = ['unverified', 'verified', 'expired', 'bypassed', 'closed'];
const HASH = /^[a-f0-9]{64}$/i;

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
function requireHashes(value, label) {
  const errors = [];
  for (const field of ['input_sha256', 'output_sha256']) {
    if (typeof value[field] !== 'string' || !HASH.test(value[field])) errors.push(label + '.' + field + ' must be a sha256 hex string');
  }
  return errors;
}
function recordExists(rows, id, label) { return rows.some(function (item) { return item.id === id; }) ? [label + ' already exists: ' + id] : []; }

function admitCase(stateDir, value) {
  const errors = requireFields(value, ['schema_version', 'id', 'incident_id', 'title', 'expected_transition', 'failure_mode', 'severity', 'evidence', 'reproducible', 'owner'], 'case');
  if (value.schema_version !== 'autoarmory/case/v1') errors.push('schema_version must be autoarmory/case/v1');
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) errors.push('case.evidence must be a non-empty array');
  if (value.reproducible !== true) errors.push('case must be reproducible before admission');
  if (errors.length) return { ok: false, errors: errors };
  const state = files(stateDir);
  const rows = read(state.cases);
  const duplicate = recordExists(rows, value.id, 'case');
  if (duplicate.length) return { ok: false, errors: duplicate };
  const record = Object.assign({}, value, { schema_version: 'autoarmory/case/v1', status: 'admitted', admitted_at: new Date().toISOString() });
  append(state.cases, record);
  return { ok: true, case: record };
}

function registerMechanism(stateDir, value) {
  const errors = requireFields(value, ['schema_version', 'id', 'name', 'covered_failure_modes', 'trigger', 'action', 'verification', 'closure_criteria', 'owner', 'version'], 'mechanism');
  if (value.schema_version !== 'autoarmory/mechanism/v1') errors.push('schema_version must be autoarmory/mechanism/v1');
  if (!Array.isArray(value.covered_failure_modes) || value.covered_failure_modes.length === 0) errors.push('mechanism.covered_failure_modes must be a non-empty array');
  if (errors.length) return { ok: false, errors: errors };
  const state = files(stateDir);
  const rows = read(state.mechanisms);
  const duplicate = recordExists(rows, value.id, 'mechanism');
  if (duplicate.length) return { ok: false, errors: duplicate };
  const record = Object.assign({}, value, { schema_version: 'autoarmory/mechanism/v1', status: value.status || 'proposed', registered_at: new Date().toISOString() });
  append(state.mechanisms, record);
  return { ok: true, mechanism: record };
}

function recordMechanismRun(stateDir, value) {
  const state = files(stateDir);
  const mechanisms = read(state.mechanisms);
  const cases = read(state.cases);
  const errors = requireFields(value, ['schema_version', 'id', 'mechanism_id', 'case_id', 'actor', 'verified_by', 'verified', 'result', 'evidence', 'input_sha256', 'output_sha256', 'environment_fingerprint', 'exit_code', 'started_at', 'finished_at'], 'mechanism_run');
  if (value.schema_version !== 'autoarmory/mechanism-run/v1') errors.push('schema_version must be autoarmory/mechanism-run/v1');
  if (!mechanisms.some(function (item) { return item.id === value.mechanism_id; })) errors.push('mechanism not found: ' + value.mechanism_id);
  if (!cases.some(function (item) { return item.id === value.case_id; })) errors.push('case not found: ' + value.case_id);
  if (!RUN_RESULTS.includes(value.result)) errors.push('mechanism_run.result must be pass or fail');
  if (value.verified !== true) errors.push('mechanism run must be independently verified');
  if (!value.verified_by || value.verified_by === value.actor) errors.push('verification must be independent: verified_by must differ from actor');
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) errors.push('mechanism_run.evidence must be a non-empty array');
  if (!Number.isInteger(value.exit_code)) errors.push('mechanism_run.exit_code must be an integer');
  errors.push.apply(errors, requireHashes(value, 'mechanism_run'));
  if (errors.length) return { ok: false, errors: errors };
  const record = Object.assign({}, value, { schema_version: 'autoarmory/mechanism-run/v1', recorded_at: new Date().toISOString() });
  append(state.runs, record);
  return { ok: true, run: record };
}

function closeCase(stateDir, caseId, runId) {
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
  if (!mechanisms.some(function (entry) { return entry.id === run.mechanism_id; })) return { ok: false, errors: ['mechanism not found: ' + run.mechanism_id] };
  if (run.verified !== true || run.verified_by === run.actor) return { ok: false, errors: ['run is not independently verified'] };
  if (run.result !== 'pass') return { ok: false, errors: ['run did not pass'] };
  if (run.regression === true) return { ok: false, errors: ['run introduced a regression'] };
  const hashErrors = requireHashes(run, 'mechanism_run');
  if (hashErrors.length) return { ok: false, errors: hashErrors };
  if (closures.some(function (entry) { return entry.case_id === caseId && entry.run_id === runId; })) return { ok: false, errors: ['case already closed for this run'] };
  const closure = { schema_version: 'autoarmory/closure/v1', id: 'close-' + runId, case_id: caseId, mechanism_id: run.mechanism_id, run_id: runId, status: 'closed', closed_at: new Date().toISOString() };
  append(state.closures, closure);
  return { ok: true, closure: closure };
}

function status(stateDir, mechanismId) {
  const state = files(stateDir);
  const mechanism = read(state.mechanisms).find(function (item) { return item.id === mechanismId; });
  if (!mechanism) return { ok: false, errors: ['mechanism not found: ' + mechanismId] };
  const runs = read(state.runs).filter(function (item) { return item.mechanism_id === mechanismId; });
  const closures = read(state.closures).filter(function (item) { return item.mechanism_id === mechanismId; });
  const latest = runs.slice().sort(function (a, b) { return Date.parse(a.finished_at || a.recorded_at) - Date.parse(b.finished_at || b.recorded_at); }).pop();
  let verdict = 'unverified';
  let reason = 'no mechanism run recorded';
  if (latest) {
    const invalid = latest.verified !== true || latest.verified_by === latest.actor || latest.result !== 'pass' || latest.regression === true;
    const ageDays = (Date.now() - Date.parse(latest.finished_at || latest.recorded_at)) / 86400000;
    const staleDays = Number(mechanism.verification_stale_days || 30);
    if (invalid) { verdict = 'bypassed'; reason = 'latest run failed, regressed, or lacked independent verification'; }
    else if (ageDays > staleDays) { verdict = 'expired'; reason = 'latest run is older than verification_stale_days'; }
    else if (closures.some(function (item) { return item.case_id === latest.case_id; })) { verdict = 'closed'; reason = 'latest verified run closed the case'; }
    else { verdict = 'verified'; reason = 'latest run is independently verified and has not been closed'; }
  }
  return { ok: true, schema_version: 'autoarmory/mechanism-status/v1', mechanism_id: mechanismId, status: verdict, reason: reason, latest_run_id: latest ? latest.id : null, verified_at: latest ? (latest.finished_at || latest.recorded_at) : null };
}

function listMechanisms(stateDir) { return read(files(stateDir).mechanisms); }

module.exports = { STATUSES, files, admitCase, registerMechanism, recordMechanismRun, closeCase, status, listMechanisms };

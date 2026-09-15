'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonl, writeJsonl } = require('./util');

function files(stateDir) {
  return {
    usage: path.join(stateDir, 'usage-contracts.jsonl'),
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
function registerUsageContract(stateDir, value) {
  const errors = requireFields(value, ['schema_version', 'id', 'capability_id', 'workflow_id', 'task_type', 'caller', 'owner'], 'usage_contract');
  if (value.schema_version !== 'autoarmory/usage-contract/v1') errors.push('schema_version must be autoarmory/usage-contract/v1');
  if (!Array.isArray(value.success_criteria) || value.success_criteria.length === 0) errors.push('success_criteria must be a non-empty array');
  if (!Array.isArray(value.failure_modes) || value.failure_modes.length === 0) errors.push('failure_modes must be a non-empty array');
  if (errors.length) return { ok: false, errors: errors };
  const usage = files(stateDir);
  const rows = read(usage.usage);
  if (rows.some(function (item) { return item.id === value.id; })) return { ok: false, errors: ['usage contract already exists: ' + value.id] };
  append(usage.usage, value);
  return { ok: true, usage_contract: value };
}
function listUsageContracts(stateDir) { return read(files(stateDir).usage); }
function admitCase(stateDir, value) {
  const usage = files(stateDir);
  const contracts = read(usage.usage);
  const errors = requireFields(value, ['schema_version', 'id', 'usage_contract_id', 'title', 'expected', 'actual', 'failure_mode', 'severity'], 'case');
  if (value.schema_version !== 'autoarmory/case/v1') errors.push('schema_version must be autoarmory/case/v1');
  if (!contracts.some(function (item) { return item.id === value.usage_contract_id; })) errors.push('usage contract not found: ' + value.usage_contract_id);
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) errors.push('evidence must be a non-empty array');
  if (value.reproducible !== true) errors.push('case must be reproducible before admission');
  if (errors.length) return { ok: false, errors: errors };
  const rows = read(usage.cases);
  if (rows.some(function (item) { return item.id === value.id; })) return { ok: false, errors: ['case already exists: ' + value.id] };
  const record = Object.assign({}, value, { status: 'admitted', admitted_at: new Date().toISOString() });
  append(usage.cases, record);
  return { ok: true, case: record };
}
function listCases(stateDir) { return read(files(stateDir).cases); }
function registerMechanism(stateDir, value) {
  const errors = requireFields(value, ['schema_version', 'id', 'name', 'trigger', 'action', 'verification', 'closure_criteria', 'owner', 'version'], 'mechanism');
  if (value.schema_version !== 'autoarmory/mechanism/v1') errors.push('schema_version must be autoarmory/mechanism/v1');
  if (!Array.isArray(value.covered_failure_modes) || value.covered_failure_modes.length === 0) errors.push('covered_failure_modes must be a non-empty array');
  if (errors.length) return { ok: false, errors: errors };
  const state = files(stateDir);
  const rows = read(state.mechanisms);
  if (rows.some(function (item) { return item.id === value.id; })) return { ok: false, errors: ['mechanism already exists: ' + value.id] };
  const record = Object.assign({}, value, { status: value.status || 'proposed', registered_at: new Date().toISOString() });
  append(state.mechanisms, record);
  return { ok: true, mechanism: record };
}
function listMechanisms(stateDir) { return read(files(stateDir).mechanisms); }
function recordMechanismRun(stateDir, value) {
  const state = files(stateDir);
  const mechanisms = read(state.mechanisms);
  const cases = read(state.cases);
  const errors = requireFields(value, ['schema_version', 'id', 'mechanism_id', 'case_id', 'actor', 'verified_by', 'result', 'started_at', 'finished_at'], 'mechanism_run');
  if (value.schema_version !== 'autoarmory/mechanism-run/v1') errors.push('schema_version must be autoarmory/mechanism-run/v1');
  if (!mechanisms.some(function (item) { return item.id === value.mechanism_id; })) errors.push('mechanism not found: ' + value.mechanism_id);
  if (!cases.some(function (item) { return item.id === value.case_id; })) errors.push('case not found: ' + value.case_id);
  if (value.verified !== true) errors.push('mechanism run must be independently verified');
  if (!value.verified_by || value.verified_by === value.actor) errors.push('verification must be independent: verified_by must differ from actor');
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) errors.push('evidence must be a non-empty array');
  if (errors.length) return { ok: false, errors: errors };
  const record = Object.assign({}, value, { recorded_at: new Date().toISOString() });
  append(state.runs, record);
  return { ok: true, run: record };
}
function closeCase(stateDir, caseId, runId) {
  const state = files(stateDir);
  const cases = read(state.cases);
  const runs = read(state.runs);
  const mechanisms = read(state.mechanisms);
  const item = cases.find(function (entry) { return entry.id === caseId; });
  const run = runs.find(function (entry) { return entry.id === runId; });
  if (!item) return { ok: false, errors: ['case not found: ' + caseId] };
  if (!run) return { ok: false, errors: ['run not found: ' + runId] };
  if (run.case_id !== caseId) return { ok: false, errors: ['run does not belong to case'] };
  if (!mechanisms.some(function (entry) { return entry.id === run.mechanism_id; })) return { ok: false, errors: ['mechanism not found: ' + run.mechanism_id] };
  if (run.verified !== true || run.verified_by === run.actor) return { ok: false, errors: ['run is not independently verified'] };
  if (run.result !== 'pass') return { ok: false, errors: ['run did not pass'] };
  if (run.regression === true) return { ok: false, errors: ['run introduced a regression'] };
  const closure = { schema_version: 'autoarmory/closure/v1', id: 'close-' + runId, case_id: caseId, mechanism_id: run.mechanism_id, run_id: runId, status: 'closed', closed_at: new Date().toISOString() };
  append(state.closures, closure);
  return { ok: true, closure: closure };
}
function effectiveness(stateDir, mechanismId) {
  const state = files(stateDir);
  const runs = read(state.runs).filter(function (item) { return !mechanismId || item.mechanism_id === mechanismId; });
  const closures = read(state.closures).filter(function (item) { return !mechanismId || item.mechanism_id === mechanismId; });
  const successful = runs.filter(function (item) { return item.result === 'pass' && item.verified === true && item.regression !== true; }).length;
  return {
    schema_version: 'autoarmory/mechanism-effectiveness/v1',
    mechanism_id: mechanismId || null,
    status: runs.length ? 'measured' : 'insufficient_data',
    runs: runs.length,
    verified_passes: successful,
    closures: closures.length,
    closure_rate: runs.length ? closures.length / runs.length : null,
    pass_rate: runs.length ? successful / runs.length : null,
    recurrence_rate: runs.length ? runs.filter(function (item) { return item.result !== 'pass'; }).length / runs.length : null
  };
}

module.exports = { files, registerUsageContract, listUsageContracts, admitCase, listCases, registerMechanism, listMechanisms, recordMechanismRun, closeCase, effectiveness };
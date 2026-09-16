'use strict';

const path = require('path');
const { readJsonl, writeJsonl } = require('./util');
const verify = require('./verify');

const SCHEMA_VERSION = 'autoarmory/execution-trace/v1';
const OBSERVED_STATUSES = ['completed', 'skipped', 'failed', 'out_of_order'];
const HASH = /^[a-fA-F0-9]{64}$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isIsoTimestamp(value) {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function requireFields(value, fields, label, errors) {
  for (const field of fields) if (value[field] === undefined || value[field] === null || value[field] === '') errors.push(label + '.' + field + ' is required');
}

function validateExecutionTrace(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['execution trace must be an object'];
  if (value.schema_version !== SCHEMA_VERSION) errors.push('schema_version must be ' + SCHEMA_VERSION);
  requireFields(value, ['id', 'decision_id', 'task_id', 'skill_id', 'environment_fingerprint', 'started_at', 'finished_at'], 'trace', errors);
  if (!Array.isArray(value.steps_expected) || value.steps_expected.length === 0) errors.push('trace.steps_expected must be a non-empty array');
  if (!Array.isArray(value.steps_observed) || value.steps_observed.length === 0) errors.push('trace.steps_observed must be a non-empty array');
  if (typeof value.order_ok !== 'boolean') errors.push('trace.order_ok must be a boolean');
  if (typeof value.stop_conditions_ok !== 'boolean') errors.push('trace.stop_conditions_ok must be a boolean');
  if (!Array.isArray(value.artifact_refs)) errors.push('trace.artifact_refs must be an array');
  if (!isIsoTimestamp(value.started_at)) errors.push('trace.started_at must be an ISO timestamp');
  if (!isIsoTimestamp(value.finished_at)) errors.push('trace.finished_at must be an ISO timestamp');
  if (isIsoTimestamp(value.started_at) && isIsoTimestamp(value.finished_at) && Date.parse(value.finished_at) < Date.parse(value.started_at)) errors.push('trace.finished_at must not precede started_at');
  if (!value.plan && !value.plan_sha256) errors.push('trace requires plan or plan_sha256');
  if (value.plan_sha256 !== undefined && !HASH.test(String(value.plan_sha256 || ''))) errors.push('trace.plan_sha256 must be a 64-character hex digest');

  const expectedIds = new Set();
  if (Array.isArray(value.steps_expected)) {
    value.steps_expected.forEach(function (step, index) {
      const label = 'trace.steps_expected[' + index + ']';
      if (!step || typeof step !== 'object') { errors.push(label + ' must be an object'); return; }
      if (!isNonEmptyString(step.id)) errors.push(label + '.id is required');
      else if (expectedIds.has(step.id)) errors.push(label + '.id is duplicated');
      else expectedIds.add(step.id);
      if (!isNonEmptyString(step.description)) errors.push(label + '.description is required');
      if (step.required !== undefined && typeof step.required !== 'boolean') errors.push(label + '.required must be a boolean');
    });
  }
  if (Array.isArray(value.steps_observed)) {
    value.steps_observed.forEach(function (step, index) {
      const label = 'trace.steps_observed[' + index + ']';
      if (!step || typeof step !== 'object') { errors.push(label + ' must be an object'); return; }
      if (!isNonEmptyString(step.id)) errors.push(label + '.id is required');
      if (!isNonEmptyString(step.expected_step_id)) errors.push(label + '.expected_step_id is required');
      else if (expectedIds.size && !expectedIds.has(step.expected_step_id)) errors.push(label + '.expected_step_id is not declared in steps_expected');
      if (OBSERVED_STATUSES.indexOf(step.status) === -1) errors.push(label + '.status must be one of ' + OBSERVED_STATUSES.join(', '));
    });
  }

  const isolation = value.isolation;
  if (!isolation || typeof isolation !== 'object') errors.push('trace.isolation is required');
  else {
    if (typeof isolation.independent_process !== 'boolean') errors.push('trace.isolation.independent_process must be a boolean');
    if (typeof isolation.temp_workspace !== 'boolean') errors.push('trace.isolation.temp_workspace must be a boolean');
    if (isolation.namespace !== null && typeof isolation.namespace !== 'string') errors.push('trace.isolation.namespace must be a string or null');
    if (!isolation.dependency_versions || typeof isolation.dependency_versions !== 'object' || Array.isArray(isolation.dependency_versions)) errors.push('trace.isolation.dependency_versions must be an object');
    if (!Array.isArray(isolation.evidence_refs)) errors.push('trace.isolation.evidence_refs must be an array');
  }
  return errors;
}

function deriveStatus(trace) {
  const requiredIds = trace.steps_expected.filter(function (step) { return step.required !== false; }).map(function (step) { return step.id; });
  const completed = new Set(trace.steps_observed.filter(function (step) { return step.status === 'completed'; }).map(function (step) { return step.expected_step_id; }));
  const missing = requiredIds.filter(function (id) { return !completed.has(id); });
  const badStep = trace.steps_observed.some(function (step) { return step.status !== 'completed'; });
  const isolated = trace.isolation.independent_process === true && trace.isolation.temp_workspace === true;
  return !missing.length && !badStep && trace.order_ok === true && trace.stop_conditions_ok === true && isolated ? 'conformant' : 'nonconformant';
}

function normalizeExecutionTrace(value) {
  const errors = validateExecutionTrace(value);
  let planSha = value && value.plan_sha256 ? String(value.plan_sha256).toLowerCase() : null;
  if (value && value.plan && typeof value.plan === 'object') {
    const computed = verify.sha256Value(value.plan);
    if (planSha && planSha !== computed) errors.push('trace.plan_sha256 does not match trace.plan');
    planSha = computed;
  }
  if (errors.length) return { ok: false, errors: errors };
  const trace = Object.assign({}, value, {
    schema_version: SCHEMA_VERSION,
    plan_sha256: planSha,
    status: deriveStatus(value),
    observed_at: value.observed_at || new Date().toISOString()
  });
  return { ok: true, trace: trace, errors: [] };
}

function decisionFile(stateDir) { return path.join(stateDir, 'routing-decisions.jsonl'); }
function traceFile(stateDir) { return path.join(stateDir, 'execution-traces.jsonl'); }

function readExecutionTraces(stateDir) {
  return readJsonl(traceFile(stateDir));
}

function recordExecutionTrace(stateDir, value) {
  const normalized = normalizeExecutionTrace(value);
  if (!normalized.ok) return normalized;
  const decisions = readJsonl(decisionFile(stateDir));
  const decision = decisions.find(function (item) { return item.request_id === value.decision_id; });
  if (!decision) return { ok: false, errors: ['routing decision not found: ' + value.decision_id] };
  if (decision.task_id && decision.task_id !== value.task_id) return { ok: false, errors: ['trace.task_id does not match routing decision'] };
  const selected = Array.isArray(decision.selected) && decision.selected[0] ? decision.selected[0].id : null;
  if (selected !== value.skill_id) return { ok: false, errors: ['trace.skill_id does not match routing decision selected skill'] };
  const traces = readExecutionTraces(stateDir);
  if (traces.some(function (item) { return item.id === value.id; })) return { ok: false, errors: ['execution trace already exists: ' + value.id] };
  traces.push(normalized.trace);
  writeJsonl(traceFile(stateDir), traces);
  return { ok: true, trace: normalized.trace };
}

module.exports = {
  SCHEMA_VERSION,
  validateExecutionTrace,
  normalizeExecutionTrace,
  readExecutionTraces,
  recordExecutionTrace,
  deriveStatus
};
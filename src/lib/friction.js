'use strict';

const path = require('path');
const { readJsonl, writeJsonl } = require('./util');

const SCHEMA_VERSION = 'autoarmory/friction/v1';
const BLAST = ['local', 'workspace', 'external'];

function isNonEmptyString(value) { return typeof value === 'string' && value.trim() !== ''; }

function validateFrictionEvent(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['friction event must be an object'];
  if (value.schema_version !== SCHEMA_VERSION) errors.push('schema_version must be ' + SCHEMA_VERSION);
  for (const field of ['id', 'signal', 'intent']) if (!isNonEmptyString(value[field])) errors.push('friction.' + field + ' is required');
  if (typeof value.reversible !== 'boolean') errors.push('friction.reversible must be a boolean');
  if (BLAST.indexOf(value.blast_radius) === -1) errors.push('friction.blast_radius must be local, workspace or external');
  if (value.high_risk !== undefined && typeof value.high_risk !== 'boolean') errors.push('friction.high_risk must be a boolean');
  if (value.target !== undefined && value.target !== null && typeof value.target !== 'string') errors.push('friction.target must be a string or null');
  return errors;
}

function decideFriction(value) {
  const explicit = /(不要让我|只需要审批|别问了|直接做|每次都|很烦|太麻烦)/i.test(value.signal);
  const hasTarget = isNonEmptyString(value.target);
  const high = value.high_risk === true || value.reversible !== true || value.blast_radius !== 'local';
  if (!explicit || !hasTarget) return { decision: 'record_only', approval_required: false, user_actions_required: 0 };
  if (high) return { decision: 'approval_required', approval_required: true, user_actions_required: 1 };
  return { decision: 'auto_execute', approval_required: true, user_actions_required: 1 };
}

function normalizeFrictionEvent(value) {
  const errors = validateFrictionEvent(value);
  if (errors.length) return { ok: false, errors: errors };
  const policy = decideFriction(value);
  const autoActions = policy.decision === 'record_only' ? [] : [
    'agent_prepares_change',
    'agent_executes_after_approval',
    'agent_runs_verification',
    'agent_records_evidence'
  ];
  const event = Object.assign({}, value, {
    schema_version: SCHEMA_VERSION,
    decision: policy.decision,
    approval_required: policy.approval_required,
    user_actions_required: policy.user_actions_required,
    manual_steps: [],
    auto_actions: autoActions,
    observed_at: value.observed_at || new Date().toISOString()
  });
  return { ok: true, event: event, errors: [] };
}

function frictionFile(stateDir) { return path.join(stateDir, 'friction-events.jsonl'); }

function readFrictionEvents(stateDir) {
  return readJsonl(frictionFile(stateDir));
}

function recordFrictionEvent(stateDir, value) {
  const normalized = normalizeFrictionEvent(value);
  if (!normalized.ok) return normalized;
  const events = readFrictionEvents(stateDir);
  if (events.some(function (item) { return item.id === value.id; })) return { ok: false, errors: ['friction event already exists: ' + value.id] };
  events.push(normalized.event);
  writeJsonl(frictionFile(stateDir), events);
  return { ok: true, event: normalized.event };
}

module.exports = { SCHEMA_VERSION, validateFrictionEvent, decideFriction, normalizeFrictionEvent, readFrictionEvents, recordFrictionEvent };
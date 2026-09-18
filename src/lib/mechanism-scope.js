'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sha256 } = require('./util');
const verify = require('./verify');
const environment = require('./environment');

const TRIGGER_KINDS = ['runner_changed','case_changed','scope_changed','file_changed','evidence_expired','environment_changed'];
const HASH = /^[a-f0-9]{64}$/i;

function scopeSha256(scope) { return scope && typeof scope === 'object' && Object.keys(scope).length ? verify.sha256Value(scope) : null; }
function validDate(value) { return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value)); }
function insideRepo(repo, target) {
  const full = path.resolve(repo, String(target || ''));
  const relative = path.relative(repo, full);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? full : null;
}
function validateReopenTriggers(triggers) {
  const errors = [];
  if (triggers === undefined || triggers === null) return { ok: true, errors: errors };
  if (!Array.isArray(triggers)) return { ok: false, errors: ['mechanism.reopen_trigger must be an array'] };
  for (let index = 0; index < triggers.length; index++) {
    const trigger = triggers[index];
    if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) { errors.push('mechanism.reopen_trigger[' + index + '] must be an object predicate'); continue; }
    if (TRIGGER_KINDS.indexOf(trigger.kind) === -1) errors.push('mechanism.reopen_trigger[' + index + '].kind is not computable: ' + String(trigger.kind || ''));
    if (trigger.text || trigger.description || trigger.trigger) errors.push('mechanism.reopen_trigger[' + index + '] must not be free text');
    if (trigger.kind === 'file_changed') {
      if (!trigger.target) errors.push('mechanism.reopen_trigger[' + index + '].target is required for file_changed');
      if (!HASH.test(String(trigger.expected_sha256 || ''))) errors.push('mechanism.reopen_trigger[' + index + '].expected_sha256 is required for file_changed');
    }
  }
  return { ok: errors.length === 0, errors: errors };
}
function validateScopeFields(input) {
  const value = input || {};
  const errors = [];
  const patch = {};
  if (value.scope !== undefined) {
    if (!value.scope || typeof value.scope !== 'object' || Array.isArray(value.scope) || Object.keys(value.scope).length === 0) errors.push('mechanism.scope must be a non-empty object when present');
    else {
      const computed = scopeSha256(value.scope);
      if (value.scope_sha256 !== undefined && value.scope_sha256 !== null && value.scope_sha256 !== computed) errors.push('mechanism.scope_sha256 does not match mechanism.scope');
      patch.scope_sha256 = computed;
    }
  } else if (value.scope_sha256) {
    errors.push('mechanism.scope_sha256 requires mechanism.scope');
  }
  if (value.expires_at !== undefined && value.expires_at !== null && !validDate(value.expires_at)) errors.push('mechanism.expires_at must be a valid date string');
  const triggerCheck = validateReopenTriggers(value.reopen_trigger);
  errors.push.apply(errors, triggerCheck.errors);
  return { ok: errors.length === 0, errors: errors, patch: patch };
}
function latestRun(state, mechanismId) {
  const file = path.join(state, 'mechanism-runs.jsonl');
  if (!fs.existsSync(file)) return null;
  const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); }).filter(function (item) { return item.mechanism_id === mechanismId; });
  return rows.sort(function (a, b) { return Date.parse(a.finished_at || a.recorded_at || 0) - Date.parse(b.finished_at || b.recorded_at || 0); }).pop() || null;
}
function currentCase(state, caseId) {
  const file = path.join(state, 'cases.jsonl');
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); }).find(function (item) { return item.id === caseId; }) || null;
}
function evaluateTrigger(trigger, mechanism, state, options) {
  const opts = options || {};
  const repo = path.resolve(opts.repo || '.');
  const run = latestRun(state, mechanism.id);
  if (trigger.kind === 'scope_changed') {
    const current = scopeSha256(mechanism.scope);
    return { kind: trigger.kind, hit: !mechanism.scope_sha256 || current !== mechanism.scope_sha256, evaluable: !!mechanism.scope, observed: current, expected: mechanism.scope_sha256 || null };
  }
  if (trigger.kind === 'evidence_expired') {
    if (!mechanism.expires_at && !mechanism.verification_stale_days) return { kind: trigger.kind, hit: true, evaluable: false, reason: 'no expiry fact declared' };
    const expires = mechanism.expires_at ? Date.parse(mechanism.expires_at) : null;
    const ageDays = run ? (Date.now() - Date.parse(run.finished_at || run.recorded_at)) / 86400000 : Infinity;
    const staleDays = Number(mechanism.verification_stale_days || 30);
    return { kind: trigger.kind, hit: (expires !== null && Date.now() >= expires) || ageDays > staleDays, evaluable: !!run };
  }
  if (trigger.kind === 'runner_changed') {
    if (!run) return { kind: trigger.kind, hit: false, evaluable: false, reason: 'no run to compare' };
    const fresh = verify.runnerFreshness(run, { repo: repo, verifier: mechanism.verifier_id });
    return { kind: trigger.kind, hit: fresh.ok !== true, evaluable: true, reason: fresh.reason };
  }
  if (trigger.kind === 'case_changed') {
    if (!run || !run.case_sha256) return { kind: trigger.kind, hit: false, evaluable: false, reason: 'no case-bound run' };
    const current = currentCase(state, run.case_id);
    const observed = current ? verify.sha256Value(current) : null;
    return { kind: trigger.kind, hit: observed !== run.case_sha256, evaluable: !!current, observed: observed, expected: run.case_sha256 };
  }
  if (trigger.kind === 'file_changed') {
    const full = insideRepo(repo, trigger.target);
    if (!full) return { kind: trigger.kind, hit: true, evaluable: false, reason: 'target escapes repository' };
    if (!fs.existsSync(full)) return { kind: trigger.kind, hit: true, evaluable: true, observed: null, expected: trigger.expected_sha256, reason: 'target is missing' };
    const observed = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    return { kind: trigger.kind, hit: observed !== trigger.expected_sha256, evaluable: true, observed: observed, expected: trigger.expected_sha256 };
  }
  if (trigger.kind === 'environment_changed') {
    if (!run || !run.environment_fingerprint) return { kind: trigger.kind, hit: false, evaluable: false, reason: 'no run environment fingerprint' };
    const current = opts.environment_fingerprint || environment.fingerprint(opts.dir || repo).fingerprint;
    return { kind: trigger.kind, hit: current !== run.environment_fingerprint, evaluable: true, observed: current, expected: run.environment_fingerprint };
  }
  return { kind: trigger.kind, hit: true, evaluable: false, reason: 'unsupported trigger kind' };
}
function evaluateReopenTriggers(mechanism, stateDir, options) {
  const list = Array.isArray(mechanism.reopen_trigger) ? mechanism.reopen_trigger : [];
  const hits = [];
  const nonEvaluable = [];
  for (const trigger of list) {
    const result = evaluateTrigger(trigger, mechanism, stateDir, options);
    if (result.hit) hits.push(result);
    else if (result.evaluable === false) nonEvaluable.push(result);
  }
  return { required: hits.length > 0, hits: hits, non_evaluable: nonEvaluable, trigger_count: list.length };
}
function canReuse(mechanism, requestedScope, stateDir, options) {
  if (!mechanism.scope || !mechanism.scope_sha256) return { ok: false, status: 'legacy_unscoped', reason: 'mechanism has no scope' };
  const computed = scopeSha256(mechanism.scope);
  if (computed !== mechanism.scope_sha256) return { ok: false, status: 'scope_changed', reason: 'mechanism scope hash drift' };
  const requested = scopeSha256(requestedScope);
  if (!requested || requested !== mechanism.scope_sha256) return { ok: false, status: 'out_of_scope', reason: 'requested scope differs from mechanism scope' };
  const reopen = evaluateReopenTriggers(mechanism, stateDir, options || {});
  if (reopen.required) return { ok: false, status: 'reopen_required', reason: 'reopen trigger hit', reopen: reopen };
  return { ok: true, status: 'reusable', scope_sha256: mechanism.scope_sha256 };
}
module.exports = { TRIGGER_KINDS, scopeSha256, validateScopeFields, validateReopenTriggers, evaluateTrigger, evaluateReopenTriggers, canReuse };
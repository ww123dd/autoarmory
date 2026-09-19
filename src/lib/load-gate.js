'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonl, readJson, appendJsonl, writeJson } = require('./util');
const stateLock = require('./state-lock');
const verdictView = require('./verdict-view');

function gateContextError(stateDir, opts) {
  if (!stateDir) return 'stateDir is required';
  if (!opts || !opts.repo) return 'repo is required';
  return null;
}

// Legacy risk-based consult kept for backward compatibility: callers that only
// know a change_id and a low/high risk hint. The context is still mandatory:
// effective verdicts are computed from the mechanism state in `repo` + `stateDir`.
function consult(stateDir, changeId, options) {
  const opts = typeof options === 'string' ? { risk: options } : (options || {});
  const risk = opts.risk || 'low';
  const contextError = gateContextError(stateDir, opts);
  if (contextError) {
    return { decision: 'block', change_id: changeId, verdict: 'invalid_request', reason: contextError };
  }
  const effective = verdictView.verdictFor(changeId, verdictView.readReuseIndex(stateDir), {
    stateDir: stateDir,
    repo: opts.repo,
    decisionId: opts.decisionId
  });
  const state = effective.effective_state;
  if (state === 'fresh' || state === 'closed') {
    return { decision: 'allow', change_id: changeId, verdict: 'closed', verifier: effective.verifier || null, run: effective.run || null, mechanism_status: effective.mechanism_status || null, stale_verification: effective.stale_verification === true };
  }
  if (state === 'verdict_missing' || state === 'missing' || state === 'unverified') {
    return { decision: risk === 'high' ? 'block' : 'degrade', change_id: changeId, verdict: state === 'unverified' ? 'unverified' : 'verdict_missing', reason: effective.reason || 'no closed verdict', warning: 'capability has no closed verdict' };
  }
  if (state === 'expired') {
    return { decision: risk === 'high' ? 'block' : 'degrade', change_id: changeId, verdict: state, reason: effective.reason || state, warning: 'historical verdict retained but expired' };
  }
  return { decision: 'block', change_id: changeId, verdict: state, reason: effective.reason || 'verdict is not current' };
}

// Decision interface v1 (docs/contracts/decision-interface-v1.md).
// Verifier runs produce facts; a verdict is a decision's claim bound to a run;
// the gate maps action_class x verdict_state -> allow/degrade/block through a
// versioned policy table. Policy is data, not a field on the record.
const POLICY_V1 = {
  schema_version: 'autoarmory/decision-policy/v1',
  version: 1,
  classes: ['publish', 'deploy', 'ddl', 'external-write', 'load', 'exploration'],
  mode: { publish: 'enforce', deploy: 'enforce', ddl: 'enforce', 'external-write': 'enforce', load: 'observe', exploration: 'observe' },
  rules: {
    publish: { 'no-verdict': 'block', 'valid-pass': 'allow', 'valid-fail': 'block', expired: 'block', retired: 'block', reopened: 'block', unverifiable: 'block' },
    deploy: { 'no-verdict': 'block', 'valid-pass': 'allow', 'valid-fail': 'block', expired: 'block', retired: 'block', reopened: 'block', unverifiable: 'block' },
    ddl: { 'no-verdict': 'block', 'valid-pass': 'allow', 'valid-fail': 'block', expired: 'block', retired: 'block', reopened: 'block', unverifiable: 'block' },
    'external-write': { 'no-verdict': 'block', 'valid-pass': 'allow', 'valid-fail': 'block', expired: 'block', retired: 'block', reopened: 'block', unverifiable: 'block' },
    load: { 'no-verdict': 'degrade', 'valid-pass': 'allow', 'valid-fail': 'degrade', expired: 'degrade', retired: 'block', reopened: 'block', unverifiable: 'degrade' },
    exploration: { 'no-verdict': 'degrade', 'valid-pass': 'allow', 'valid-fail': 'degrade', expired: 'degrade', retired: 'block', reopened: 'block', unverifiable: 'degrade' }
  }
};

function loadPolicy(stateDir) {
  const file = stateDir ? path.join(stateDir, 'decision-policy.json') : null;
  if (file && fs.existsSync(file)) {
    const custom = readJson(file);
    if (!custom || custom.schema_version !== 'autoarmory/decision-policy/v1' || !Array.isArray(custom.classes) || !custom.mode || !custom.rules) throw new Error('decision-policy.json must be autoarmory/decision-policy/v1 with classes, mode and rules');
    return custom;
  }
  return POLICY_V1;
}

// Compatibility wrapper for callers that already have one reuse-record. It does
// not implement a second state machine: it delegates to verdictFor(), which in
// turn delegates to mechanism.status().
function effectiveVerdict(record, now, options) {
  if (!record) return { state: 'no-verdict' };
  const opts = options || {};
  if (!opts.stateDir || !opts.repo) return { state: 'unverifiable', reason: 'stateDir and repo required' };
  const changeId = record.change_id || record.id || '';
  const index = {};
  index[changeId] = record;
  Object.defineProperty(index, '__by_decision', { value: {}, enumerable: false, configurable: true });
  const value = verdictView.verdictFor(changeId, index, { stateDir: opts.stateDir, repo: opts.repo, decisionId: record.decision_id });
  return Object.assign({ state: value.effective_state, reason: value.reason }, value);
}

// Consumption log is an audit trail: best-effort append under the state lock,
// falling back to an unlocked append. The consult verdict above stands
// regardless of the log write outcome.
function appendConsumption(stateDir, row) {
  if (!stateDir) return;
  const release = stateLock.acquire(stateDir);
  try { appendJsonl(path.join(stateDir, 'consumption.jsonl'), row); }
  catch (_) {}
  finally { if (release && release.ok) release.release(); }
}

function consultAction(stateDir, options) {
  const opts = options || {};
  const now = opts.at || new Date().toISOString();
  const policy = loadPolicy(stateDir);
  const actionClass = String(opts.actionClass || '');
  const row = { schema_version: 'autoarmory/consumption/v1', at: now, action_class: actionClass, change_id: opts.changeId || null, consumer_ref: opts.consumerRef || null, artifact_ref: opts.artifactRef || null, policy_version: policy.version };
  const decide = function (verdictState, mode, rules, reasonCode) {
    const wouldBehavior = Object.prototype.hasOwnProperty.call(rules, verdictState) ? rules[verdictState] : (rules['*'] || 'block');
    const behavior = mode === 'observe' ? 'observe' : wouldBehavior;
    const result = { behavior: behavior, would_behavior: wouldBehavior, mode: mode, reason_code: reasonCode || verdictState, verdict_state: verdictState, action_class: actionClass, change_id: opts.changeId || null, consumer_ref: opts.consumerRef || null, artifact_ref: opts.artifactRef || null, policy_version: policy.version, at: now };
    appendConsumption(stateDir, Object.assign({}, row, { verdict_state: verdictState, mode: mode, behavior: behavior, would_behavior: wouldBehavior }));
    return result;
  };
  const contextError = gateContextError(stateDir, opts);
  if (contextError) return decide('invalid-request', 'enforce', { '*': 'block' }, 'repo_and_state_required');
  if (policy.classes.indexOf(actionClass) === -1) return decide('unknown-action-class', 'enforce', {}, 'unknown_action_class');
  const mode = policy.mode[actionClass];
  const effective = verdictView.verdictFor(opts.changeId, verdictView.readReuseIndex(stateDir), { stateDir: stateDir, repo: opts.repo, decisionId: opts.decisionId });
  const state = (effective.effective_state === 'fresh' || effective.effective_state === 'closed') ? 'valid-pass' : (effective.effective_state === 'missing' ? 'no-verdict' : effective.effective_state);
  if (mode !== 'observe' && mode !== 'enforce') return decide(state, 'enforce', { '*': 'block' });
  return decide(state, mode, policy.rules[actionClass] || {});
}

// Scheduled fact refresh: recompute effective states for every reuse-record,
// append one transition event per state change, materialise a snapshot.
// It never creates a verdict; re-runs stay the job of the verifier schedule.
function refresh(stateDir, now, options) {
  if (!stateDir) throw new Error('stateDir required');
  const opts = options || {};
  if (!opts.repo) throw new Error('repo required');
  const ts = now || new Date().toISOString();
  const release = stateLock.acquire(stateDir);
  if (!release.ok) throw new Error('state root locked: ' + (release.reason || ''));
  try {
    const root = path.join(stateDir, 'reuse-records');
    const files = fs.existsSync(root) ? fs.readdirSync(root).filter(function (x) { return /\.json$/i.test(x); }).sort() : [];
    const index = verdictView.readReuseIndex(stateDir);
    const eventsFile = path.join(stateDir, 'verdict-events.jsonl');
    const lastState = {};
    for (const row of readJsonl(eventsFile)) if (row && row.change_id) lastState[row.change_id] = row.to;
    const snapshot = [];
    const pendingEvents = [];
    let expired = 0, reopened = 0, validPass = 0, validFail = 0, retired = 0, superseded = 0, unverifiable = 0, transitions = 0;
    for (const name of files) {
      let record = null;
      try { record = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); }
      catch (_) { continue; }
      const changeId = record.change_id || name.replace(/\.json$/i, '');
      const effective = verdictView.verdictFor(changeId, index, { stateDir: stateDir, repo: opts.repo, decisionId: record.decision_id });
      const state = effective.effective_state;
      snapshot.push({ change_id: changeId, state: state, mechanism_status: effective.mechanism_status || null, verifier: effective.verifier || null, expires_at: effective.expires_at || null, reason: effective.reason || null });
      if (state === 'expired') expired += 1;
      else if (state === 'reopened') reopened += 1;
      else if (state === 'fresh' || state === 'closed') validPass += 1;
      else if (state === 'valid-fail') validFail += 1;
      else if (state === 'retired') retired += 1;
      else if (state === 'superseded') superseded += 1;
      else unverifiable += 1;
      if (lastState[changeId] !== state) {
        pendingEvents.push({ schema_version: 'autoarmory/verdict-event/v1', at: ts, change_id: changeId, from: lastState[changeId] || null, to: state });
        transitions += 1;
      }
    }
    if (pendingEvents.length) appendJsonl(eventsFile, pendingEvents);
    writeJson(path.join(stateDir, 'decision-state.json'), { schema_version: 'autoarmory/decision-state/v1', generated_at: ts, decisions: snapshot });
    return { schema_version: 'autoarmory/decision-refresh/v1', at: ts, decisions: snapshot.length, transitions: transitions, valid_pass: validPass, valid_fail: validFail, expired: expired, reopened: reopened, retired: retired, superseded: superseded, unverifiable: unverifiable };
  } finally { if (release && release.ok) release.release(); }
}

// Scoped invariants: the gate hole (an enforce-mode allow with no verdict)
// must stay 0 by construction; observe-class would-blocks are the growth
// signal that justifies flipping a class to enforce.
function violations(stateDir) {
  const policy = loadPolicy(stateDir);
  const rows = readJsonl(path.join(stateDir, 'consumption.jsonl'));
  let enforceGateHoles = 0, observeWouldBlock = 0, total = 0;
  for (const row of rows) {
    if (!row || row.schema_version !== 'autoarmory/consumption/v1') continue;
    total += 1;
    if (row.mode === 'enforce' && row.behavior === 'allow' && row.verdict_state === 'no-verdict') enforceGateHoles += 1;
    if (row.mode === 'observe' && row.would_behavior === 'block') observeWouldBlock += 1;
  }
  return { schema_version: 'autoarmory/consumption-violations/v1', policy_version: policy.version, total: total, enforce_gate_hole_count: enforceGateHoles, observe_would_block_count: observeWouldBlock };
}

module.exports = { consult, consultAction, loadPolicy, effectiveVerdict, refresh, violations, POLICY_V1 };
'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonl, writeJsonl, sha256 } = require('./util');
const verify = require('./verify');
const doneContract = require('./done-contract');
const mechanismScope = require('./mechanism-scope');

const STATUSES = ['unverified', 'verified', 'expired', 'bypassed', 'closed', 'reopen_required'];
function files(stateDir) {
  return {
    cases: path.join(stateDir, 'cases.jsonl'),
    mechanisms: path.join(stateDir, 'mechanisms.jsonl'),
    runs: path.join(stateDir, 'mechanism-runs.jsonl'),
    closures: path.join(stateDir, 'closures.jsonl'),
    lifecycle: path.join(stateDir, 'lifecycle.jsonl')
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
  const scopeCheck = mechanismScope.validateScopeFields(input);
  errors.push.apply(errors, scopeCheck.errors);
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
  const record = Object.assign({}, input, { schema_version: 'autoarmory/mechanism/v1', status: input.status || 'proposed', registered_at: new Date().toISOString() }, scopeCheck.patch);
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
  const caseRecord = cases.find(function (item) { return item.id === input.case_id; }) || null;
  const errors = requireFields(input, ['schema_version', 'id', 'mechanism_id', 'case_id', 'actor', 'evidence_refs', 'counterexample', 'environment_fingerprint', 'started_at', 'finished_at'], 'mechanism_run');
  if (input.schema_version !== 'autoarmory/mechanism-run/v1') errors.push('schema_version must be autoarmory/mechanism-run/v1');
  if (!mechanism) errors.push('mechanism not found: ' + input.mechanism_id);
  if (!cases.some(function (item) { return item.id === input.case_id; })) errors.push('case not found: ' + input.case_id);
  if (!Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0) errors.push('mechanism_run.evidence_refs must be a non-empty array');
  else if (mechanism && !usesVerifier(input, mechanism.verifier_id)) errors.push('mechanism_run.evidence_refs must include the mechanism verifier: ' + mechanism.verifier_id);
  if (!input.counterexample || typeof input.counterexample !== 'object' || Array.isArray(input.counterexample) || Object.keys(input.counterexample).length === 0) errors.push('mechanism_run.counterexample must be a non-empty object');
  if (input.regression !== undefined && typeof input.regression !== 'boolean') errors.push('mechanism_run.regression must be boolean when present');

  // Bind the record to the runner the active profile declares. Explicit values
  // supplied by the caller are kept, so a forged identity is judged, not patched.
  const candidate = Object.assign({}, input);
  if (caseRecord && (candidate.case_sha256 === undefined || candidate.case_sha256 === null)) candidate.case_sha256 = verify.sha256Value(caseRecord);
  if (mechanism) {
    const runner = verify.runnerFor(opts.repo || stateDir, mechanism.verifier_id);
    if (runner) {
      for (const key of ['runner_id', 'runner_sha256', 'invocation_contract_version', 'verifier_version']) {
        if (candidate[key] === undefined || candidate[key] === null) candidate[key] = runner[key];
      }
    }
  }

  const verification = verify.verifyRecord(candidate, {
    repo: opts.repo || stateDir,
    verifier: mechanism ? mechanism.verifier_id : null,
    case_record: caseRecord,
    case_id: candidate.case_id,
    mechanism_id: candidate.mechanism_id,
    run_id: candidate.id,
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

  const record = Object.assign({}, candidate, {
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
    verifier: mechanism.verifier_id,
    case_record: item,
    case_id: caseId,
    mechanism_id: run.mechanism_id,
    run_id: runId,
    trials: opts.trials,
    require_record: true
  });
  if (verification.status !== 'verified') return { ok: false, errors: [verificationFailure(verification)] };
  const completion = doneContract.evaluateDoneContract(item, mechanism, run, verification);
  if (!completion.ok) return { ok: false, errors: completion.errors };
  const scopeDrift = mechanism.scope && mechanism.scope_sha256 && mechanism.scope_sha256 !== mechanismScope.scopeSha256(mechanism.scope);
  const expiredNow = mechanism.expires_at && Date.now() >= Date.parse(mechanism.expires_at);
  const reopen = mechanismScope.evaluateReopenTriggers(mechanism, stateDir, opts);
  if (scopeDrift) return { ok: false, errors: ['mechanism scope has changed; reopen is required before close'] };
  if (expiredNow) return { ok: false, errors: ['mechanism expires_at has passed; cannot close'] };
  if (reopen.required) return { ok: false, errors: ['mechanism reopen trigger hit before close: ' + JSON.stringify(reopen.hits)] };
  if (closures.some(function (entry) { return entry.case_id === caseId && entry.run_id === runId; })) return { ok: false, errors: ['case already closed for this run'] };
  const closure = {
    schema_version: 'autoarmory/closure/v1',
    id: 'close-' + runId,
    case_id: caseId,
    mechanism_id: run.mechanism_id,
    run_id: runId,
    status: 'closed',
    runner_id: run.runner_id || null,
    runner_sha256: run.runner_sha256 || null,
    invocation_contract_version: run.invocation_contract_version || null,
    verifier_version: run.verifier_version || null,
    done_contract: {
      verifier: completion.verifier,
      done_criteria: completion.done_criteria,
      done_criteria_sha256: completion.done_criteria_sha256,
      contract_source: completion.source,
      verification_gap_count: completion.verification_gap_count,
      evidence_ref: completion.evidence_ref
    },
    closed_at: new Date().toISOString()
  };
  append(state.closures, closure);
  return { ok: true, closure: closure };
}

function status(stateDir, mechanismId, options) {
  const opts = options || {};
  const state = files(stateDir);
  const mechanism = read(state.mechanisms).find(function (item) { return item.id === mechanismId; });
  if (!mechanism) return { ok: false, errors: ['mechanism not found: ' + mechanismId] };
  const cases = read(state.cases);
  const runs = read(state.runs).filter(function (item) { return item.mechanism_id === mechanismId; });
  const closures = read(state.closures).filter(function (item) { return item.mechanism_id === mechanismId; });
  const latest = runs.slice().sort(function (a, b) { return Date.parse(a.finished_at || a.recorded_at) - Date.parse(b.finished_at || b.recorded_at); }).pop();
  let verdict = 'unverified';
  let reason = 'no mechanism run recorded';
  if (latest && !usesVerifier(latest, mechanism.verifier_id)) {
    reason = 'latest run does not use mechanism verifier: ' + mechanism.verifier_id;
  } else if (latest) {
    const latestCase = cases.find(function (item) { return item.id === latest.case_id; }) || null;
    const checkResult = verify.verifyRecord(latest, {
      repo: opts.repo || stateDir,
      verifier: mechanism.verifier_id,
      case_record: latestCase,
      case_id: latest.case_id,
      mechanism_id: mechanismId,
      run_id: latest.id,
      trials: opts.trials,
      require_record: true
    });
    // A closure is only valid while the run that produced it is still fresh, so a
    // runner change cannot leave a case closed on evidence that no longer holds.
    const closure = closures.filter(function (item) { return item.case_id === latest.case_id; }).sort(function (a, b) { return Date.parse(a.closed_at || 0) - Date.parse(b.closed_at || 0); }).pop() || null;
    const closureRun = closure ? runs.find(function (item) { return item.id === closure.run_id; }) || null : null;
    const closureCheck = closureRun ? verify.verifyRecord(closureRun, {
      repo: opts.repo || stateDir,
      verifier: mechanism.verifier_id,
      case_record: cases.find(function (item) { return item.id === closureRun.case_id; }) || null,
      case_id: closureRun.case_id,
      mechanism_id: mechanismId,
      run_id: closureRun.id,
      trials: opts.trials,
      require_record: true
    }) : null;
    if (checkResult.status !== 'verified') { verdict = 'unverified'; reason = verificationFailure(checkResult); }
    else if (latest.result !== 'pass' || latest.regression === true) { verdict = 'bypassed'; reason = 'latest run failed or regressed'; }
    else if (closure && (!closureCheck || closureCheck.status !== 'verified')) {
      verdict = 'unverified';
      reason = 'closure run is no longer fresh: ' + (closureCheck ? verificationFailure(closureCheck) : ('closure run missing: ' + closure.run_id));
    } else if (closure) { verdict = 'closed'; reason = 'latest verified run closed the case'; }
    else { verdict = 'verified'; reason = 'latest run verification passed and has not been closed'; }
  }
  const currentScopeSha = mechanismScope.scopeSha256(mechanism.scope);
  const scopeDrift = !!(mechanism.scope && mechanism.scope_sha256 && mechanism.scope_sha256 !== currentScopeSha);
  const expiredNow = !!(mechanism.expires_at && Date.now() >= Date.parse(mechanism.expires_at));
  const staleDays = Number(mechanism.verification_stale_days || 30);
  const staleVerification = !!(latest && !expiredNow && (Date.now() - Date.parse(latest.finished_at || latest.recorded_at)) / 86400000 > staleDays);
  const reopen = mechanismScope.evaluateReopenTriggers(mechanism, stateDir, opts);
  if ((verdict === 'verified' || verdict === 'closed') && scopeDrift) { verdict = 'reopen_required'; reason = 'mechanism scope hash drift (scope_changed)'; }
  else if ((verdict === 'verified' || verdict === 'closed') && expiredNow) { verdict = 'expired'; reason = 'mechanism expires_at has passed'; }
  else if ((verdict === 'verified' || verdict === 'closed') && reopen.required) { verdict = 'reopen_required'; reason = 'mechanism reopen trigger hit: ' + reopen.hits.map(function (x) { return x.kind; }).join(', '); }
  if ((verdict === 'verified' || verdict === 'closed') && staleVerification) reason = reason + '; verification is stale (older than verification_stale_days)';
  const scopeStatus = !mechanism.scope ? 'legacy_unscoped' : (scopeDrift ? 'scope_changed' : 'scoped');
  const expiryStatus = expiredNow ? 'expired' : (staleVerification ? 'stale_verification' : 'fresh');
  return {
    ok: true,
    schema_version: 'autoarmory/mechanism-status/v1',
    mechanism_id: mechanismId,
    status: verdict,
    scope_status: scopeStatus,
    scope_sha256: currentScopeSha,
    expires_at: mechanism.expires_at || null,
    expiry_status: expiryStatus,
    stale_verification: staleVerification,
    reopen_required: reopen.required,
    reopen_hits: reopen.hits,
    reason: reason,
    latest_run_id: latest ? latest.id : null,
    runner_id: latest ? latest.runner_id || null : null,
    runner_sha256: latest ? latest.runner_sha256 || null : null,
    invocation_contract_version: latest ? latest.invocation_contract_version || null : null,
    verified_at: latest ? (latest.finished_at || latest.recorded_at) : null
  };
}
function listMechanisms(stateDir) { return read(files(stateDir).mechanisms); }

// Lifecycle: a verdict is not a promotion. 'promoted' is a separate, evidence-backed
// decision, and it only holds while the verdict that justified it still holds. When the
// evidence goes stale the mechanism is retired by a rollback record that carries the fact
// which forced it - otherwise a stale verdict would keep a capability promoted forever.
function lifecycleHistory(stateDir, mechanismId) {
  return read(files(stateDir).lifecycle).filter(function (item) { return item.mechanism_id === mechanismId; });
}
function lifecycle(stateDir, mechanismId) {
  const rows = lifecycleHistory(stateDir, mechanismId);
  const latest = rows.length ? rows[rows.length - 1] : null;
  return latest || { schema_version: 'autoarmory/mechanism-lifecycle/v1', id: null, mechanism_id: mechanismId, from: null, to: 'proposed', at: null };
}
function latestRun(stateDir, mechanismId) {
  const runs = read(files(stateDir).runs).filter(function (item) { return item.mechanism_id === mechanismId; });
  return runs.slice().sort(function (a, b) { return Date.parse(a.finished_at || a.recorded_at) - Date.parse(b.finished_at || b.recorded_at); }).pop() || null;
}
function evidencePointer(run) {
  if (!run) return null;
  return {
    run_id: run.id,
    result: run.result || null,
    exit_code: Number.isInteger(run.exit_code) ? run.exit_code : null,
    input_sha256: run.input_sha256 || null,
    output_sha256: run.output_sha256 || null,
    runner_sha256: run.runner_sha256 || null,
    case_sha256: run.case_sha256 || null
  };
}
function appendLifecycle(stateDir, record) {
  const state = files(stateDir);
  const rows = read(state.lifecycle);
  rows.push(record);
  writeJsonl(state.lifecycle, rows);
  return record;
}
function promote(stateDir, mechanismId, options) {
  const opts = options || {};
  const mechanismRecord = read(files(stateDir).mechanisms).find(function (item) { return item.id === mechanismId; });
  if (!mechanismRecord) return { ok: false, errors: ['mechanism not found: ' + mechanismId] };
  if (!mechanismRecord.scope || !mechanismRecord.scope_sha256) return { ok: false, errors: ['cannot promote legacy_unscoped mechanism: ' + mechanismId] };
  if (mechanismRecord.scope_sha256 !== mechanismScope.scopeSha256(mechanismRecord.scope)) return { ok: false, errors: ['cannot promote mechanism with scope_changed: ' + mechanismId] };
  const requestedScope = opts.scope || mechanismRecord.scope;
  const reuse = mechanismScope.canReuse(mechanismRecord, requestedScope, stateDir, opts);
  if (!reuse.ok) return { ok: false, errors: ['cannot promote ' + mechanismId + ': ' + reuse.status + ' - ' + reuse.reason] };
  const current = status(stateDir, mechanismId, opts);
  if (!current.ok) return { ok: false, errors: ['mechanism status unavailable: ' + (current.errors || []).join('; ')] };
  if (current.status !== 'verified' && current.status !== 'closed') {
    return { ok: false, errors: ['cannot promote ' + mechanismId + ': verdict is ' + current.status + ' - ' + current.reason] };
  }
  const previous = lifecycle(stateDir, mechanismId);
  if (previous.to === 'promoted') return { ok: true, action: 'none', lifecycle: previous };
  const run = latestRun(stateDir, mechanismId);
  const at = new Date().toISOString();
  const record = {
    schema_version: 'autoarmory/mechanism-lifecycle/v1',
    id: 'lc-' + sha256(mechanismId + ':promoted:' + at).slice(0, 12),
    mechanism_id: mechanismId,
    case_id: run ? run.case_id : null,
    from: previous.to,
    to: 'promoted',
    verdict: current.status,
    reason: current.reason,
    evidence_refs: [evidencePointer(run)].filter(Boolean),
    actor: opts.actor || 'codex',
    at: at
  };
  appendLifecycle(stateDir, record);
  return { ok: true, action: 'promoted', lifecycle: record };
}
function rollbackIfStale(stateDir, mechanismId, options) {
  const opts = options || {};
  const previous = lifecycle(stateDir, mechanismId);
  if (previous.to !== 'promoted') return { ok: true, action: 'none', reason: 'mechanism is not promoted', lifecycle: previous };
  const current = status(stateDir, mechanismId, opts);
  if (!current.ok) return { ok: false, errors: ['mechanism status unavailable: ' + (current.errors || []).join('; ')] };
  if (current.status === 'verified' || current.status === 'closed') {
    return { ok: true, action: 'none', reason: 'evidence still holds: ' + current.status, lifecycle: previous };
  }
  const run = latestRun(stateDir, mechanismId);
  const pointer = evidencePointer(run) || {};
  const already = read(files(stateDir).lifecycle).some(function (item) {
    return item.mechanism_id === mechanismId && item.to === 'retired' && item.forced_by && item.forced_by.latest_run_id === pointer.run_id && item.forced_by.status === current.status;
  });
  if (already) return { ok: true, action: 'none', reason: 'already rolled back for this evidence', lifecycle: previous };
  const at = new Date().toISOString();
  const record = {
    schema_version: 'autoarmory/mechanism-lifecycle/v1',
    id: 'rb-' + sha256(mechanismId + ':' + String(pointer.run_id) + ':' + current.status).slice(0, 12),
    mechanism_id: mechanismId,
    case_id: run ? run.case_id : previous.case_id || null,
    from: 'promoted',
    to: 'retired',
    verdict: current.status,
    reason: 'promoted mechanism lost its evidence: ' + current.status + ' - ' + current.reason,
    forced_by: {
      status: current.status,
      reason: current.reason,
      latest_run_id: pointer.run_id || null,
      runner_sha256: pointer.runner_sha256 || null,
      case_sha256: pointer.case_sha256 || null,
      promoted_by: previous.id || null
    },
    actor: opts.actor || 'codex',
    at: at
  };
  appendLifecycle(stateDir, record);
  return { ok: true, action: 'rolled_back', lifecycle: record };
}
function staleLifecycleEscapes(stateDir, options) {
  const opts = options || {};
  const mechanisms = read(files(stateDir).mechanisms);
  let escapes = 0;
  for (const item of mechanisms) {
    if (lifecycle(stateDir, item.id).to !== 'promoted') continue;
    const current = status(stateDir, item.id, opts);
    if (!current.ok || (current.status !== 'verified' && current.status !== 'closed')) escapes += 1;
  }
  return escapes;
}

module.exports = { STATUSES, files, admitCase, registerMechanism, recordMechanismRun, closeCase, status, listMechanisms, lifecycle, lifecycleHistory, promote, rollbackIfStale, staleLifecycleEscapes, canReuse: mechanismScope.canReuse };

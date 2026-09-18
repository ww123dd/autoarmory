#!/usr/bin/env node
'use strict';

// Mechanism preflight: if a repository has mechanism state, an unverified,
// expired, or bypassed mechanism blocks the commit. A verdict without a
// consumer is decoration; this is the first real consumer of mechanism status.

const fs = require('fs');
const path = require('path');
const mechanism = require('../src/lib/mechanism');
const verify = require('../src/lib/verify');
const mechanismScope = require('../src/lib/mechanism-scope');

const repo = process.cwd();
const state = path.resolve(process.env.AUTOARMORY_STATE || path.join(repo, '.selfforge'));
const mechanismsFile = path.join(state, 'mechanisms.jsonl');
const transitionsFile = path.join(state, 'transitions.jsonl');
if (!fs.existsSync(mechanismsFile) && !fs.existsSync(transitionsFile)) {
  process.stdout.write('mechanism preflight: no mechanism state\n');
  process.exit(0);
}
let records = [];
if (fs.existsSync(mechanismsFile)) {
  try {
    records = fs.readFileSync(mechanismsFile, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
  } catch (error) {
    process.stderr.write('MECHANISM_PREFLIGHT_BLOCK\nstate unreadable: ' + error.message + '\n');
    process.exit(2);
  }
}
function readJsonl(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); }) : [];
}
function byTime(a, b) { return Date.parse(a.finished_at || a.recorded_at || 0) - Date.parse(b.finished_at || b.recorded_at || 0); }
function byClosedAt(a, b) { return Date.parse(a.closed_at || 0) - Date.parse(b.closed_at || 0); }

const runs = readJsonl(path.join(state, 'mechanism-runs.jsonl'));
const closures = readJsonl(path.join(state, 'closures.jsonl'));
const cases = readJsonl(path.join(state, 'cases.jsonl'));
const blockers = [];
let staleVerdictEscapes = 0;
let staleLifecycleEscapes = 0;
let unscopedPromotionCount = 0;
let legacyUnscopedPromotionCount = 0;
let outOfScopeReuseCount = 0;
let expiredMechanismReuseCount = 0;
let reopenTriggerInvalidCount = 0;
let reopenRequiredEscapeCount = 0;
for (const record of records) {
  const status = mechanism.status(state, record.id, { repo: repo });
  const life = mechanism.lifecycle(state, record.id);
  const promoted = life.to === 'promoted';
  const retired = life.to === 'retired';
  const healthy = status.ok && (status.status === 'verified' || status.status === 'closed');
  const triggerCheck = mechanismScope.validateReopenTriggers(record.reopen_trigger);
  if (!triggerCheck.ok) { reopenTriggerInvalidCount += triggerCheck.errors.length; blockers.push(record.id + ': invalid reopen trigger - ' + triggerCheck.errors.join('; ')); }
  const scopeDrift = record.scope && record.scope_sha256 && record.scope_sha256 !== mechanismScope.scopeSha256(record.scope);
  const expired = record.expires_at && Date.now() >= Date.parse(record.expires_at);
  if (promoted && (!record.scope || !record.scope_sha256)) { unscopedPromotionCount += 1; legacyUnscopedPromotionCount += 1; blockers.push(record.id + ': promoted legacy_unscoped mechanism'); }
  if (promoted && scopeDrift) { outOfScopeReuseCount += 1; blockers.push(record.id + ': promoted mechanism has scope_changed'); }
  if (promoted && expired) { expiredMechanismReuseCount += 1; blockers.push(record.id + ': promoted mechanism is past expires_at'); }
  if (promoted && status.status === 'reopen_required') reopenRequiredEscapeCount += 1;
  // A promotion outliving its evidence is the escape this loop exists to prevent:
  // the verdict is already gone, yet the capability would stay promoted.
  if (promoted && !healthy) {
    staleLifecycleEscapes += 1;
    blockers.push(record.id + ': promoted but ' + (status.status || 'error') + ' - ' + (status.reason || (status.errors || []).join('; '))
      + '; run: node scripts/mechanism-lifecycle.js --mechanism ' + record.id + ' --rollback-if-stale');
    continue;
  }
  if (!healthy) {
    // A retired mechanism carries the record that explains why its verdict is gone:
    // that is a closed loop, not an unhandled failure.
    if (retired) continue;
    blockers.push(record.id + ': ' + (status.status || 'error') + ' - ' + (status.reason || (status.errors || []).join('; ')));
    continue;
  }
  // Independent audit of the reported verdict: the run that supports it has to
  // still name the runner the active profile declares.
  const own = runs.filter(function (item) { return item.mechanism_id === record.id; });
  const latest = own.slice().sort(byTime).pop() || null;
  const closure = closures.filter(function (item) { return item.mechanism_id === record.id; }).sort(byClosedAt).pop() || null;
  const supporting = status.status === 'closed' && closure ? own.filter(function (item) { return item.id === closure.run_id; })[0] || null : latest;
  const freshness = supporting ? verify.runnerFreshness(supporting, { repo: repo, verifier: record.verifier_id }) : { ok: false, reason: 'no supporting run' };
  const supportingCase = supporting ? cases.filter(function (item) { return item.id === supporting.case_id; })[0] || null : null;
  const caseState = supporting ? verify.caseFreshness(supporting, { case_record: supportingCase }) : { ok: false, reason: 'no supporting run' };
  if (caseState && caseState.status === 'unchecked') caseState.ok = true;
  if (!caseState.ok) {
    staleVerdictEscapes += 1;
    blockers.push(record.id + ': ' + status.status + ' but the supporting case is not fresh - ' + caseState.reason);
  }
  if (!freshness.ok) {
    staleVerdictEscapes += 1;
    blockers.push(record.id + ': ' + status.status + ' but the supporting run is not fresh - ' + freshness.reason);
  }
}
// Candidate-side lifecycle: a promoted candidate whose hashed outcome evidence no longer
// reproduces has to be retired with the fact that forced it, exactly like a mechanism.
let staleCandidateEscapes = 0;
let uncoveredCandidateEvidence = 0;
try {
  if (fs.existsSync(transitionsFile)) {
    const candidateLifecycle = require('../src/lib/candidate-lifecycle');
    const candidateState = candidateLifecycle.staleEscapes(readJsonl(transitionsFile), { repo: repo });
    staleCandidateEscapes = candidateState.escapes;
    uncoveredCandidateEvidence = candidateState.uncovered;
    for (const detail of candidateState.details) {
      if (!detail.freshness || !detail.freshness.covered || detail.freshness.ok) continue;
      blockers.push(detail.candidate_id + ': promoted but its outcome evidence no longer reproduces ('
        + detail.freshness.mismatches.map(function (item) { return item.path; }).join(', ')
        + '); run: node scripts/candidate-lifecycle.js --rollback-if-stale');
    }
  }
} catch (error) {
  blockers.push('candidate lifecycle check failed: ' + error.message);
}

if (blockers.length) {
  process.stderr.write('MECHANISM_PREFLIGHT_BLOCK\n' + blockers.join('\n') + '\n' + 'stale_verdict_escape_count=' + staleVerdictEscapes + ', stale_lifecycle_escape_count=' + staleLifecycleEscapes + ', stale_candidate_escape_count=' + staleCandidateEscapes + ', uncovered_candidate_evidence=' + uncoveredCandidateEvidence + ', unscoped_promotion_count=' + unscopedPromotionCount + ', legacy_unscoped_promotion_count=' + legacyUnscopedPromotionCount + ', out_of_scope_reuse_count=' + outOfScopeReuseCount + ', expired_mechanism_reuse_count=' + expiredMechanismReuseCount + ', reopen_trigger_invalid_count=' + reopenTriggerInvalidCount + ', reopen_required_escape_count=' + reopenRequiredEscapeCount + '\n');
  process.exit(2);
}
process.stdout.write('mechanism preflight passed: ' + records.length + ' mechanism(s) verified/closed, stale_verdict_escape_count=' + staleVerdictEscapes + ', stale_lifecycle_escape_count=' + staleLifecycleEscapes + ', stale_candidate_escape_count=' + staleCandidateEscapes + ', uncovered_candidate_evidence=' + uncoveredCandidateEvidence + ', unscoped_promotion_count=' + unscopedPromotionCount + ', legacy_unscoped_promotion_count=' + legacyUnscopedPromotionCount + ', out_of_scope_reuse_count=' + outOfScopeReuseCount + ', expired_mechanism_reuse_count=' + expiredMechanismReuseCount + ', reopen_trigger_invalid_count=' + reopenTriggerInvalidCount + ', reopen_required_escape_count=' + reopenRequiredEscapeCount + '\n');

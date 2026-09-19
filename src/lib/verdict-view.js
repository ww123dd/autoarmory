'use strict';
const fs = require('fs');
const path = require('path');
const { sha256 } = require('./util');

function readReuseIndex(dir) {
  const root = path.join(dir, 'reuse-records');
  const index = {};
  const byDecision = {};
  if (fs.existsSync(root)) {
    for (const name of fs.readdirSync(root).filter(function (item) { return /\.json$/i.test(item); })) {
      try {
        const record = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
        if (record && record.change_id) {
          if (name === record.change_id + '.json') index[record.change_id] = record;
          if (record.decision_id) byDecision[record.decision_id] = record;
        }
      } catch (_) {}
    }
  }
  Object.defineProperty(index, '__by_decision', { value: byDecision, enumerable: false, configurable: true });
  return index;
}

function lockSha(repo) {
  try { return sha256(fs.readFileSync(path.join(repo, 'verifiers.lock.json'), 'utf8')); }
  catch (_) { return null; }
}

function hasText(value) { return typeof value === 'string' && value.length > 0; }

function hasClaimIdentity(record) {
  return hasText(record.mechanism_id)
    && hasText(record.decision_id)
    && hasText(record.claim_sha256)
    && hasText(record.expected_sha256)
    && hasText(record.source_verifier_id)
    && hasText(record.verifier_lock_sha256);
}

function result(record, state, reason, extra) {
  const value = Object.assign({
    verification_state: state,
    effective_state: state,
    lifecycle_state: state,
    verdict: state,
    verifier: record && (record.verifier || record.source_verifier_id) || null,
    run: record && record.run || null,
    closure: record && record.closure || null,
    reason: reason || null,
    link_status: state === 'fresh' || state === 'closed' ? 'linked' : (record ? 'linked_non_fresh' : 'verdict_missing')
  }, extra || {});
  return value;
}

function mapMechanismStatus(status) {
  if (status === 'closed') return 'closed';
  if (status === 'verified') return 'fresh';
  if (status === 'expired') return 'expired';
  if (status === 'reopen_required') return 'reopened';
  if (status === 'bypassed') return 'valid-fail';
  if (status === 'retired') return 'retired';
  return 'unverified';
}

// Effective state is deliberately not read from reuse-record.status. The
// immutable reuse-record contributes claim identity and historical provenance;
// mechanism.status() is the single source of the currently valid state.
function verdictFor(changeId, index, options) {
  const opts = options || {};
  const record = (index && index[changeId])
    || (index && index.__by_decision && index.__by_decision[opts.decisionId])
    || null;
  if (!record) {
    return result(null, 'missing', 'no reuse-record for change_id', { verification_state: 'verdict_missing', verdict: null });
  }

  const historical = String(record.status || '');
  if (historical === 'retired') return result(record, 'retired', record.reason || 'verdict was retired');
  if (historical === 'failed') return result(record, 'valid-fail', record.reason || 'recorded run failed');
  if (historical === 'unverifiable') return result(record, 'unverified', record.reason || 'recorded evidence was unverifiable');
  if (historical !== 'closed' && historical !== 'verified') {
    return result(record, 'unverified', record.reason || 'reuse-record is not a closed verdict');
  }

  if (record.expires_at && Number.isFinite(Date.parse(record.expires_at)) && Date.now() >= Date.parse(record.expires_at)) {
    return result(record, 'expired', 'evidence window expired');
  }

  if (!hasClaimIdentity(record)) {
    return result(record, 'superseded', 'reuse-record is missing claim identity; it is historical provenance only');
  }

  if (!opts.stateDir || !opts.repo) {
    return result(record, 'unverified', 'stateDir and repo are required to recompute mechanism status');
  }

  let current = null;
  try {
    current = require('./mechanism').status(opts.stateDir, record.mechanism_id, { repo: opts.repo });
  } catch (error) {
    return result(record, 'unverified', 'mechanism status failed: ' + error.message);
  }
  if (!current || !current.ok) {
    return result(record, 'superseded', current && current.errors ? current.errors.join('; ') : 'mechanism not found for reuse-record');
  }

  const state = mapMechanismStatus(current.status);
  return result(record, state, current.reason, {
    mechanism_status: current.status,
    mechanism_reason: current.reason,
    stale_verification: current.stale_verification === true,
    expiry_status: current.expiry_status || null,
    reopen_required: current.reopen_required === true,
    reopen_hits: current.reopen_hits || [],
    expires_at: current.expires_at || record.expires_at || null,
    lock_sha256: lockSha(opts.repo)
  });
}

function joinDraft(draft, index, options) {
  const copy = Object.assign({}, draft);
  const verdict = verdictFor(copy.change_id || copy.id, index, options);
  copy.verification_state = verdict.verification_state;
  copy.lifecycle_state = verdict.lifecycle_state;
  copy.verdict = verdict.verdict;
  copy.verifier = verdict.verifier;
  copy.run = verdict.run;
  copy.closure = verdict.closure !== undefined && verdict.closure !== null ? verdict.closure : (Object.prototype.hasOwnProperty.call(copy, 'closure') ? copy.closure : null);
  copy.verdict_reason = verdict.reason;
  copy.link_status = verdict.link_status;
  if (verdict.mechanism_status) copy.mechanism_status = verdict.mechanism_status;
  if (verdict.stale_verification !== undefined) copy.stale_verification = verdict.stale_verification;
  return copy;
}

module.exports = { readReuseIndex, verdictFor, joinDraft };
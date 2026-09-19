'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonl, writeJson } = require('./util');
const scorecard = require('./outcome-scorecard');
const tripwire = require('./tripwire');

function prioritize(input) {
  const value = input || {};
  const scoreRows = value.scorecard && value.scorecard.rows || [];
  const trip = value.tripwire || { ok: false, verifiers: [] };
  const claims = value.claims || [];
  const tripById = {};
  for (const row of trip.verifiers || []) tripById[row.verifier_id] = row;
  const verifiers = scoreRows.map(function (row) {
    const tripRow = tripById[row.verifier_id] || null;
    const tripPass = !!(tripRow && tripRow.passed);
    let action = 'observe';
    const reasons = [];
    if (row.false_close_count > 0 || row.overturned_count > 0) { action = 'manual'; reasons.push('overturned_or_false_close'); }
    else if (row.reopen_count > 0) { action = 'manual'; reasons.push('reopened'); }
    else if (!tripPass) { action = 'manual'; reasons.push('tripwire_missing_or_failed'); }
    else if (row.sample_size >= 3 && row.correct_count >= 3 && row.earned_candidate === true) { action = 'earned'; reasons.push('sample_and_tripwire_pass'); }
    else { reasons.push('insufficient_sample'); }
    const priority = action === 'earned' ? 30 : (action === 'manual' ? 10 : 5);
    return Object.assign({}, row, { tripwire_passed: tripPass, action: action, priority: priority, reasons: reasons });
  });
  const claimRows = claims.map(function (claim) {
    const verifier = claim.verifier_candidate && claim.verifier_candidate.ref || null;
    const verifierRow = verifiers.find(function (row) { return row.verifier_id === verifier; });
    const priority = (claim.disposition === 'ready_for_verifier' ? 20 : 0) + (verifierRow ? verifierRow.priority : 0);
    return { change_id: claim.change_id || null, verifier_id: verifier, disposition: claim.disposition || null, priority: priority, reason: verifierRow ? verifierRow.action : 'no_verifier_outcome' };
  }).sort(function (a, b) { return b.priority - a.priority || String(a.change_id).localeCompare(String(b.change_id)); });
  return { schema_version: 'autoarmory/priority-engine/v1', generated_at: new Date().toISOString(), verifiers: verifiers.sort(function (a, b) { return b.priority - a.priority; }), claims: claimRows, next_claims: claimRows.slice(0, 20) };
}
function run(stateDir, repo) {
  const outcomes = scorecard.scorecard(stateDir);
  const trip = tripwire.run(repo);
  const claimsFile = path.join(stateDir, 'decision-scan', 'decision-drafts.jsonl');
  const claims = fs.existsSync(claimsFile) ? readJsonl(claimsFile) : [];
  const report = prioritize({ scorecard: outcomes, tripwire: trip, claims: claims });
  writeJson(path.join(stateDir, 'priority-state.json'), report);
  return report;
}
module.exports = { prioritize, run };
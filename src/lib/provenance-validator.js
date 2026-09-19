'use strict';
const baselineManifest = require('./baseline-manifest');

function classify(error) {
  const text = String(error || '');
  if (/baseline_manifest_missing|ref_unreadable|manifest_unreadable/.test(text)) return 'unreadable_ref';
  if (/baseline_id_missing|commit_id_missing|owner_missing|verifier_id_missing/.test(text)) return 'missing_ref';
  if (/baseline\.source_invalid|expected_provenance_invalid/.test(text)) return 'unsupported_kind';
  if (/sha256_mismatch/.test(text)) return 'hash_mismatch';
  if (/owner_approval_not_found/.test(text)) return 'approval_missing';
  if (/commit_not_found/.test(text)) return 'commit_missing';
  if (/pinned_verifier_not_registered/.test(text)) return 'pinned_verifier_missing';
  return 'unknown';
}
function validate(stateDir, claim, options) {
  const validation = baselineManifest.validateProvenance(stateDir, claim, options);
  const categories = Array.from(new Set((validation.errors || []).map(classify)));
  return Object.assign({}, validation, { categories: categories });
}
module.exports = { validate, classify };
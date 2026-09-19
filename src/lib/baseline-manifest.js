'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJson } = require('./util');
const verify = require('./verify');

function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function load(stateDir) {
  const file = path.join(stateDir, 'baseline-manifest.json');
  if (!fs.existsSync(file)) return { ok: false, file: file, errors: ['baseline_manifest_missing'], entries: {} };
  try {
    const value = readJson(file);
    if (value.schema_version !== 'autoarmory/baseline-manifest/v1' || !value.entries || typeof value.entries !== 'object') return { ok: false, file: file, errors: ['baseline_manifest_schema_invalid'], entries: {} };
    return { ok: true, file: file, errors: [], entries: value.entries };
  } catch (error) {
    return { ok: false, file: file, errors: ['baseline_manifest_unreadable: ' + error.message], entries: {} };
  }
}
function entry(stateDir, baselineId) {
  const manifest = load(stateDir);
  if (!manifest.ok) return { ok: false, errors: manifest.errors, entry: null };
  const value = manifest.entries[baselineId];
  if (!value) return { ok: false, errors: ['baseline_id_not_found:' + baselineId], entry: null };
  const errors = [];
  for (const field of ['id', 'kind', 'ref', 'sha256', 'source', 'owner', 'approved_at', 'evidence_ref']) if (!value[field]) errors.push('baseline.' + field + '_missing');
  if (['incident', 'owner_approval', 'commit'].indexOf(value.source) === -1) errors.push('baseline.source_invalid:' + value.source);
  let computed = null;
  try { computed = sha256File(value.ref); } catch (error) { errors.push('baseline.ref_unreadable:' + error.message); }
  if (computed && computed !== String(value.sha256).toLowerCase()) errors.push('baseline.sha256_mismatch');
  return { ok: errors.length === 0, errors: errors, entry: value, computed_sha256: computed };
}
function approvals(stateDir) {
  const dir = path.join(stateDir, 'approvals');
  if (!fs.existsSync(dir)) return [];
  const rows = [];
  for (const name of fs.readdirSync(dir).filter(function (item) { return /\.json$/i.test(item); })) {
    try { rows.push(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))); } catch (_) {}
  }
  return rows;
}
function validateProvenance(stateDir, claim, options) {
  const opts = options || {};
  const provenance = claim && claim.expected_provenance;
  if (!provenance) return { ok: false, provenance: null, errors: ['expected_provenance_missing'] };
  if (provenance === 'pinned_verifier') {
    const verifierId = opts.verifier_id || claim.verifier_id;
    const runner = verifierId ? verify.runnerFor(opts.repo, verifierId) : null;
    return runner ? { ok: true, provenance: provenance, verifier_id: verifierId, errors: [] } : { ok: false, provenance: provenance, errors: ['pinned_verifier_not_registered'] };
  }
  if (provenance === 'baseline_manifest') {
    if (!claim.baseline_id) return { ok: false, provenance: provenance, errors: ['baseline_id_missing'] };
    const checked = entry(stateDir, claim.baseline_id);
    return { ok: checked.ok, provenance: provenance, baseline_id: claim.baseline_id, errors: checked.errors, entry: checked.entry, computed_sha256: checked.computed_sha256 };
  }
  if (provenance === 'commit') {
    const commit = claim.inputs && claim.inputs.commit;
    if (!commit) return { ok: false, provenance: provenance, errors: ['commit_id_missing'] };
    const result = require('child_process').spawnSync('git', ['rev-parse', '--verify', commit + '^{commit}'], { cwd: opts.repo || process.cwd(), encoding: 'utf8', windowsHide: true });
    return result.status === 0 ? { ok: true, provenance: provenance, commit: String(result.stdout || '').trim(), errors: [] } : { ok: false, provenance: provenance, errors: ['commit_not_found:' + commit] };
  }
  if (provenance === 'owner_approval') {
    const owner = claim.owner;
    if (!owner) return { ok: false, provenance: provenance, errors: ['owner_missing'] };
    const hit = approvals(stateDir).find(function (item) { return item && item.status === 'approved' && item.approved_by === owner && (!item.candidate_id || item.candidate_id === claim.change_id); });
    return hit ? { ok: true, provenance: provenance, approval: hit, errors: [] } : { ok: false, provenance: provenance, errors: ['owner_approval_not_found'] };
  }
  return { ok: false, provenance: provenance, errors: ['expected_provenance_invalid:' + provenance] };
}
module.exports = { load, entry, validateProvenance, sha256File };
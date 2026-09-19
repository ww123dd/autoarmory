'use strict';
const fs = require('fs');
const path = require('path');
const verify = require('./verify');

const DEFAULT_ENTRIES = {
  stop_hook: 'src/lib/hook-gate.js',
  pre_commit: '.githooks/pre-commit',
  skill_update: 'scripts/change-gate.js'
};
function list(value) { return Array.isArray(value) ? value : []; }
function audit(candidate, options) {
  const opts = options || {};
  const value = candidate || {};
  const repo = path.resolve(opts.repo || process.cwd());
  const blockers = [];
  const enforcement = value.enforcement && typeof value.enforcement === 'object' ? value.enforcement : {};
  const point = enforcement.point || null;
  const coverage = enforcement.coverage || 'none';
  const entry = enforcement.entry || DEFAULT_ENTRIES[point] || null;
  let verifierRegistered = false;
  const inventory = verify.listVerifiers(repo);
  if (!value.verifier_id) blockers.push('verifier_missing');
  else if (!inventory.ok) blockers.push('verifier_inventory_unavailable');
  else {
    verifierRegistered = inventory.verifiers.some(function (item) { return item.id === value.verifier_id && item.integrity === true; });
    if (!verifierRegistered) blockers.push('verifier_not_registered');
  }
  if (!point) blockers.push('enforcement_point_missing');
  const entryPath = entry ? path.resolve(repo, entry) : null;
  if (!entryPath || !fs.existsSync(entryPath)) blockers.push('enforcement_entry_missing');
  else {
    try {
      delete require.cache[require.resolve(entryPath)];
      const loaded = require(entryPath);
      if (!loaded || typeof loaded.enforceMechanism !== 'function') blockers.push('enforcement_entry_contract_missing');
    } catch (_) { blockers.push('enforcement_entry_contract_missing'); }
  }
  if (enforcement.mode !== 'block') blockers.push('enforcement_mode_not_block');
  if (coverage !== 'complete') blockers.push('enforcement_coverage_incomplete');
  if (!list(value.evidence_refs).length) blockers.push('evidence_missing');
  if (!value.precheck || value.precheck.ok !== true) blockers.push('mechanism_precheck_failed');
  if (!value.scope || typeof value.scope !== 'object' || Array.isArray(value.scope) || Object.keys(value.scope).length === 0) blockers.push('scope_missing');
  return {
    schema_version: 'autoarmory/mechanism-activation/v1',
    mechanism_id: value.mechanism_id || null,
    verifier_id: value.verifier_id || null,
    enforcement_point: point,
    enforcement_entry: entry,
    coverage: coverage,
    verifier_registered: verifierRegistered,
    status: blockers.length ? 'candidate' : 'active',
    blockers: blockers
  };
}
module.exports = { DEFAULT_ENTRIES, audit };




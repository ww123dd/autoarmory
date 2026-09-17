'use strict';

const fs = require('fs');
const path = require('path');

const TIERS = ['read_only', 'local_write', 'irreversible_write', 'external_side_effect'];
const DEFAULT_POLICY = path.join(__dirname, '..', '..', 'examples', 'boundary-policy.json');

function loadPolicy(file) {
  const target = path.resolve(file || DEFAULT_POLICY);
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}
function globMatch(pattern, value) {
  const escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$').test(String(value || ''));
}
function classifyAction(policy, action) {
  const rules = (policy && policy.action_rules) || [];
  const name = String(action || '');
  for (const rule of rules) {
    if (!rule || !globMatch(rule.match, name)) continue;
    const tier = rule.tier;
    return { action: name || null, tier: TIERS.indexOf(tier) === -1 ? 'unclassified' : tier, rule: rule.match, conflict: TIERS.indexOf(tier) === -1 };
  }
  return { action: name || null, tier: 'unclassified', rule: null, conflict: true };
}
function validatePolicy(policy) {
  const errors = [];
  const actionTiers = policy && policy.action_tiers || {};
  for (const tier of TIERS) if (!actionTiers[tier] || typeof actionTiers[tier] !== 'object') errors.push('action_tiers.' + tier + ' is required');
  const rules = policy && policy.action_rules;
  if (!Array.isArray(rules) || rules.length === 0) errors.push('action_rules must be a non-empty array');
  let action_classification_conflict_count = 0;
  const seen = {};
  for (const rule of rules || []) {
    if (!rule || !rule.match || TIERS.indexOf(rule.tier) === -1) {
      errors.push('every action rule must have match and a valid tier');
      action_classification_conflict_count += 1;
      continue;
    }
    if (seen[rule.match] && seen[rule.match] !== rule.tier) action_classification_conflict_count += 1;
    seen[rule.match] = rule.tier;
  }
  const classes = policy && policy.task_classes;
  let missing_stop_condition_count = 0;
  if (!classes || typeof classes !== 'object') {
    errors.push('task_classes must be an object');
  } else {
    for (const [id, item] of Object.entries(classes)) {
      if (!item || !Array.isArray(item.stop_conditions) || item.stop_conditions.length === 0) {
        missing_stop_condition_count += 1;
        errors.push('task_classes.' + id + '.stop_conditions must be a non-empty array');
      }
      const allowed = item && item.allowed_action_tiers;
      if (!Array.isArray(allowed) || allowed.length === 0 || allowed.some(function (tier) { return TIERS.indexOf(tier) === -1; })) {
        errors.push('task_classes.' + id + '.allowed_action_tiers must name valid tiers');
      }
    }
  }
  return { ok: errors.length === 0, errors: errors, action_classification_conflict_count: action_classification_conflict_count, missing_stop_condition_count: missing_stop_condition_count };
}
function requiresApproval(policy, tier) {
  const values = policy && policy.approval_required_tiers || [];
  return values.indexOf(tier) !== -1;
}
function auditTransitions(candidates, transitions, policy) {
  const candidateById = {};
  for (const item of candidates || []) if (item && item.id) candidateById[item.id] = item;
  const ordered = (transitions || []).slice().sort(function (a, b) { return Date.parse(a.at || 0) - Date.parse(b.at || 0); });
  const approved = {};
  let authorizedActionWithoutApprovalCount = 0;
  let conflictCount = 0;
  const actionTargets = policy && policy.approval_required_transitions || ['gated', 'shadow', 'canary', 'promoted'];
  for (const record of ordered) {
    const candidate = candidateById[record.candidate_id] || {};
    const action = record.action || candidate.action || null;
    const classified = classifyAction(policy, action);
    const explicitTier = record.action_tier || candidate.action_tier || null;
    if (explicitTier && explicitTier !== classified.tier) conflictCount += 1;
    if (!explicitTier && classified.conflict) conflictCount += 1;
    const currentApproval = record.approval && record.approval.status === 'approved';
    if (currentApproval) approved[record.candidate_id] = true;
    if (actionTargets.indexOf(record.to) !== -1 && requiresApproval(policy, classified.tier) && !approved[record.candidate_id]) {
      authorizedActionWithoutApprovalCount += 1;
    }
  }
  return {
    schema_version: 'autoarmory/boundary-audit/v1',
    actions: ordered.length,
    authorized_action_without_approval_count: authorizedActionWithoutApprovalCount,
    action_classification_conflict_count: conflictCount,
    ok: authorizedActionWithoutApprovalCount === 0 && conflictCount === 0
  };
}
module.exports = { TIERS, DEFAULT_POLICY, loadPolicy, classifyAction, validatePolicy, requiresApproval, auditTransitions };
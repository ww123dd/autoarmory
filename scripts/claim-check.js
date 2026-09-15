#!/usr/bin/env node
'use strict';

// Evidence/claim gate for decisions that use strong product or enforcement vocabulary.
// Usage: node claim-check.js <claim.json> [--json]
//        node claim-check.js --stdin [--json]
// Exit: 0 PASS / 1 WARN / 2 BLOCK
const fs = require('fs');

const VOCAB_LEVELS = [
  { id: 'control-plane', min: 6, pattern: /(?:control\s*plane|off[-\s]?policy|portfolio|控制面|离线策略|组合优化)/i },
  { id: 'enforcement', min: 5, pattern: /(?:production[-\s]?ready|verified|reliable|reliability|gate|enforcement|prevents|blocks|blocked|生产可用|已验证|可靠|门禁|阻断|拦住)/i },
  { id: 'external-trust', min: 4, pattern: /(?:conformance|portability|trust|一致性|可移植|信任)/i },
  { id: 'mechanism', min: 3, pattern: /(?:mechanism|verification|evidence|机制|验证|证据)/i },
  { id: 'scanner-ledger', min: 1, pattern: /(?:scanner|linter|ledger|扫描器|台账)/i },
];
const EVIDENCE_TYPES = new Set(['fixture', 'self_authored', 'vendor', 'marketing', 'first_hand', 'public_corpus', 'independent', 'external_reproduction', 'production_outcome', 'multi_environment_outcome']);
const STATUSES = new Set(['observation', 'advisory', 'enforced', 'adaptive']);
const ACTIONS = new Set(['record', 'warn', 'select', 'allow', 'deny', 'fallback', 'block', 'rollback']);

function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : ''; }
function jsonInput() {
  const fileIndex = process.argv.indexOf('--file');
  if (fileIndex !== -1 && process.argv[fileIndex + 1]) return fs.readFileSync(process.argv[fileIndex + 1], 'utf8');
  if (process.argv.includes('--stdin')) return fs.readFileSync(0, 'utf8');
  const positional = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
  if (positional) return fs.readFileSync(positional, 'utf8');
  return fs.readFileSync(0, 'utf8');
}
function requiredLevel(claim) {
  const found = VOCAB_LEVELS.filter((item) => item.pattern.test(claim));
  return found.length ? found.reduce((level, item) => Math.max(level, item.min), 0) : 0;
}
function hasEvidence(types, allowed) { return types.some((type) => allowed.includes(type)); }
function reproducibleEvidence(evidence, types, allowed) { return evidence.some((item, index) => allowed.includes(types[index]) && item && item.reproducible === true); }

let record;
try {
  record = JSON.parse(jsonInput());
} catch (error) {
  console.error('claim-check: invalid JSON input: ' + error.message);
  process.exit(2);
}

const blockers = [];
const warnings = [];
const claim = text(record.claim);
const consumer = text(record.consumer);
const consumptionMoment = text(record.consumption_moment);
const decision = text(record.decision);
const status = text(record.status);
const action = text(record.action);
const enforcementPoint = text(record.enforcement_point);
const outcomeCallback = text(record.outcome_callback);
const fallback = text(record.fallback);
const policyVersion = text(record.policy_version);
const expiresAt = text(record.expires_at);
const evidence = Array.isArray(record.evidence) ? record.evidence : [];
const required = requiredLevel(claim);
const claimedLevel = record.claim_level ? Number(String(record.claim_level).replace(/^L/i, '')) : null;

for (const [field, value] of [['claim', claim], ['consumer', consumer], ['consumption_moment', consumptionMoment], ['decision', decision]]) {
  if (!value) blockers.push('missing required field: ' + field);
}
if (!STATUSES.has(status)) blockers.push('status must be one of: ' + Array.from(STATUSES).join(', '));
if (!ACTIONS.has(action)) blockers.push('action must be one of: ' + Array.from(ACTIONS).join(', '));
if (typeof record.can_block !== 'boolean') blockers.push('can_block must be boolean');
if (required && claimedLevel === null) blockers.push('claim_level is required for strong vocabulary; minimum supported level is L' + required);
if (claimedLevel !== null && (!Number.isInteger(claimedLevel) || claimedLevel < 0 || claimedLevel > 6)) blockers.push('claim_level must be L0 through L6');
if (required && Number.isInteger(claimedLevel) && claimedLevel < required) blockers.push('claim vocabulary requires at least L' + required + ', got L' + claimedLevel);

if (!evidence.length && status !== 'observation') blockers.push('evidence is required unless status is observation');
const evidenceLevels = [];
for (let i = 0; i < evidence.length; i++) {
  const item = evidence[i] || {};
  const type = text(item.type);
  if (!EVIDENCE_TYPES.has(type)) blockers.push('evidence[' + i + '].type is invalid');
  if (!text(item.ref)) blockers.push('evidence[' + i + '].ref is required');
  if (typeof item.reproducible !== 'boolean') blockers.push('evidence[' + i + '].reproducible must be boolean');
  evidenceLevels.push(type || 'invalid');
}

if (['enforced', 'adaptive'].includes(status)) {
  if (record.can_block !== true) blockers.push(status + ' status requires can_block=true');
  if (!enforcementPoint) blockers.push(status + ' status requires enforcement_point');
  if (!['select', 'allow', 'deny', 'fallback', 'block', 'rollback'].includes(action)) blockers.push(status + ' status requires an enforcing action');
  if (!text(record.counterexample)) blockers.push(status + ' status requires a counterexample');
  if (!text(record.reproduction)) blockers.push(status + ' status requires a reproduction command');
  if (!hasEvidence(evidenceLevels, ['first_hand', 'public_corpus', 'external_reproduction', 'production_outcome', 'multi_environment_outcome', 'independent'])) blockers.push(status + ' status requires first_hand or stronger evidence');
  if (['select', 'allow', 'deny', 'fallback'].includes(action) && !fallback) blockers.push('action ' + action + ' requires fallback');
  if (!outcomeCallback) warnings.push('no outcome_callback; this cannot learn from the action result');
  if (!fallback) warnings.push('no fallback declared for the enforcement decision');
  if (!policyVersion) warnings.push('no policy_version declared');
  if (!expiresAt) warnings.push('no expires_at declared');
}
if (status === 'advisory') {
  if (record.can_block !== false) blockers.push('advisory status requires can_block=false');
  if (!['record', 'warn'].includes(action)) blockers.push('advisory status requires action=record or warn');
  if (!hasEvidence(evidenceLevels, ['first_hand', 'public_corpus', 'external_reproduction', 'production_outcome', 'multi_environment_outcome', 'independent'])) warnings.push('advisory claim has no first_hand or stronger evidence');
}
if (status === 'observation') {
  if (record.can_block !== false) blockers.push('observation status requires can_block=false');
  if (action !== 'record') blockers.push('observation status requires action=record');
  if (!evidence.length) warnings.push('observation has no evidence; keep it as an open question, not a conclusion');
}

function ladderCheck(level) {
  if (level === 0) {
    if (status !== 'observation' || record.can_block !== false) blockers.push('L0 requires observation and can_block=false');
  }
  if (level === 1) {
    if (!['observation', 'advisory'].includes(status) || record.can_block !== false) blockers.push('L1 requires observation/advisory and can_block=false');
    if (!hasEvidence(evidenceLevels, ['fixture', 'self_authored'])) blockers.push('L1 requires fixture or self_authored evidence');
  }
  if (level === 2) {
    if (!reproducibleEvidence(evidence, evidenceLevels, ['public_corpus'])) blockers.push('L2 requires reproducible public_corpus evidence');
  }
  if (level === 3) {
    if (!reproducibleEvidence(evidence, evidenceLevels, ['first_hand'])) blockers.push('L3 requires reproducible first_hand evidence');
  }
  if (level === 4) {
    if (!reproducibleEvidence(evidence, evidenceLevels, ['external_reproduction'])) blockers.push('L4 requires reproducible external_reproduction evidence');
  }
  if (level === 5) {
    if (!['enforced', 'adaptive'].includes(status) || record.can_block !== true) blockers.push('L5 requires enforced/adaptive status and can_block=true');
    if (!enforcementPoint) blockers.push('L5 requires enforcement_point');
    if (!outcomeCallback) blockers.push('L5 requires outcome_callback');
    if (!hasEvidence(evidenceLevels, ['production_outcome'])) blockers.push('L5 requires production_outcome evidence');
  }
  if (level === 6) {
    if (status !== 'adaptive' || record.can_block !== true) blockers.push('L6 requires adaptive status and can_block=true');
    if (!enforcementPoint) blockers.push('L6 requires enforcement_point');
    if (!outcomeCallback) blockers.push('L6 requires outcome_callback');
    if (!hasEvidence(evidenceLevels, ['external_reproduction'])) blockers.push('L6 requires external_reproduction evidence');
    if (!hasEvidence(evidenceLevels, ['multi_environment_outcome'])) blockers.push('L6 requires multi_environment_outcome evidence');
  }
}
if (Number.isInteger(claimedLevel) && claimedLevel >= 0 && claimedLevel <= 6) ladderCheck(claimedLevel);

const verdict = blockers.length ? 'BLOCK' : (warnings.length ? 'WARN' : 'PASS');
const report = {
  schema_version: 'vibe-coding/claim-check/v2',
  claim,
  consumer,
  consumption_moment: consumptionMoment,
  decision,
  action,
  can_block: record.can_block,
  status,
  claim_level: claimedLevel === null ? null : 'L' + claimedLevel,
  required_level: 'L' + required,
  enforcement_point: enforcementPoint,
  outcome_callback: outcomeCallback,
  evidence_levels: evidenceLevels,
  blockers,
  warnings,
  verdict,
};

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log('Vibe Coding claim check: ' + (claim || '(missing claim)'));
  console.log('  consumer=' + (consumer || '-') + ' moment=' + (consumptionMoment || '-') + ' action=' + (action || '-') + ' status=' + (status || '-'));
  console.log('  claim_level=' + (report.claim_level || '-') + ' required=' + report.required_level + ' enforcement_point=' + (enforcementPoint || '-'));
  for (const item of blockers) console.log('  BLOCK | ' + item);
  for (const item of warnings) console.log('  WARN  | ' + item);
  console.log('  Result: ' + verdict);
}
process.exit(verdict === 'BLOCK' ? 2 : (verdict === 'WARN' ? 1 : 0));

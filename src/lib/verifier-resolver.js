'use strict';

const fs = require('fs');
const path = require('path');

const MECHANICAL = ['registered', 'project_test', 'file_hash', 'git_status'];
const CANDIDATE = 'verifier_candidate';
const MISSING = 'verifier_missing';

// Legacy command-shape resolver. It answers "is there an obviously replayable
// command here?", not "can a pinned verifier judge this claim?". New claim
// resolution uses matchClaim()/resolveClaim() below.
function resolveVerifier(input, options) {
  const value = input || {};
  const opts = options || {};
  const command = String(value.command || '');
  const text = [command, value.source_text, value.title, value.target_skill_ref].join(' ');
  const files = Array.isArray(value.files) ? value.files : [];
  for (const id of opts.verifier_ids || []) if (id && text.indexOf(id) !== -1) return { kind: 'registered', ref: id, reason: 'verifier id is present in the recorded change' };
  if (/(pytest|npm test|node tests|verify_all|tsc|npm run build)/i.test(command)) return { kind: 'project_test', ref: command, reason: 'project test/check command was observed' };
  if (files.some(function (item) { return item && (item.sha256 || item.hash); }) || /(sha256|hash)/i.test(command)) return { kind: 'file_hash', ref: command || null, reason: 'file hash or hash command was observed' };
  if (/(git status|git diff|git commit|git rev-parse)/i.test(command)) return { kind: 'git_status', ref: command, reason: 'git state command was observed' };
  if (/(curl|invoke-webrequest|https?:\/\/)/i.test(command)) return { kind: CANDIDATE, ref: command, inferred_kind: 'http', reason: 'HTTP success is not mechanically parsed in this version' };
  if (/(select\s|explain\s|show\s|desc\s|describe\s|sql|doris)/i.test(command)) return { kind: CANDIDATE, ref: command, inferred_kind: 'sql', reason: 'SQL success is not mechanically parsed in this version' };
  if (/(process|pid|tasklist|get-process|service)/i.test(command)) return { kind: CANDIDATE, ref: command, inferred_kind: 'process', reason: 'process state is not mechanically parsed in this version' };
  if (/(dom|selector|playwright|puppeteer|browser)/i.test(command)) return { kind: CANDIDATE, ref: command, inferred_kind: 'dom', reason: 'DOM success is not mechanically parsed in this version' };
  if (/(build|dist|bundle|artifact|package)/i.test(command)) return { kind: CANDIDATE, ref: command, inferred_kind: 'build_artifact', reason: 'build artifact semantics are not mechanically parsed in this version' };
  return { kind: MISSING, ref: null, reason: 'no registered verifier or known project check was observed' };
}

function loadRegistry(repo) {
  const file = path.join(path.resolve(repo || '.'), 'verifiers.lock.json');
  if (!fs.existsSync(file)) return { ok: false, repo: path.resolve(repo || '.'), verifiers: [], errors: ['verifiers.lock.json not found'] };
  try {
    const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ok: true, repo: path.resolve(repo || '.'), verifiers: Array.isArray(lock.verifiers) ? lock.verifiers : [], errors: [] };
  } catch (error) {
    return { ok: false, repo: path.resolve(repo || '.'), verifiers: [], errors: ['verifiers.lock.json unreadable: ' + error.message] };
  }
}

function includes(value, expected) {
  if (expected === '*' || expected === undefined || expected === null) return true;
  const list = Array.isArray(expected) ? expected : [expected];
  return list.indexOf(value) !== -1;
}

function matchClaim(claim, verifier) {
  const caps = verifier && verifier.capabilities;
  if (!caps) return { ok: false, verifier_id: verifier && verifier.id || null, errors: ['capabilities missing'] };
  const errors = [];
  if (!includes(claim.transition, caps.transition_types)) errors.push('transition:' + String(claim.transition));
  if (!includes(claim.artifact_type, caps.artifact_type)) errors.push('artifact_type:' + String(claim.artifact_type));
  for (const input of caps.required_inputs || []) if (claim.inputs === undefined || claim.inputs[input] === undefined || claim.inputs[input] === null) errors.push('input:' + input);
  if (claim.expected_provenance && !includes(claim.expected_provenance, caps.expected_provenance)) errors.push('expected_provenance:' + claim.expected_provenance);
  if (claim.action_class && !includes(claim.action_class, caps.action_class)) errors.push('action_class:' + claim.action_class);
  if (claim.assertion && caps.assertion_schema && Array.isArray(caps.assertion_schema.ops) && caps.assertion_schema.ops.indexOf(claim.assertion.op) === -1) errors.push('assertion_op:' + claim.assertion.op);
  if (claim.scope && caps.scope_schema && caps.scope_schema.required) {
    for (const key of caps.scope_schema.required) if (claim.scope[key] === undefined || claim.scope[key] === null) errors.push('scope:' + key);
  }
  return { ok: errors.length === 0, verifier_id: verifier.id, verifier: verifier, errors: errors };
}

function resolveClaim(claim, options) {
  const opts = options || {};
  const registry = Array.isArray(opts.verifiers) ? { ok: true, verifiers: opts.verifiers } : loadRegistry(opts.repo || '.');
  if (!registry.ok) return { kind: 'blocked_by_access', reason: registry.errors.join('; '), claim_shape: claim };
  const matches = registry.verifiers.map(function (verifier) { return matchClaim(claim, verifier); }).filter(function (item) { return item.ok; });
  if (matches.length === 1) return { kind: 'matched', verifier_id: matches[0].verifier_id, verifier: matches[0].verifier, reason: 'capability schema fully satisfied' };
  if (matches.length > 1) return { kind: 'ambiguous_capability', candidates: matches.map(function (item) { return item.verifier_id; }), reason: 'more than one verifier matches the claim schema' };
  if (claim.access_required === true) return { kind: 'blocked_by_access', reason: 'claim shape is known but no pinned capability has access to its fact source', claim_shape: claim };
  const nearest = registry.verifiers.map(function (verifier) { return matchClaim(claim, verifier); }).sort(function (a, b) { return a.errors.length - b.errors.length; })[0] || { errors: ['no verifiers registered'] };
  return {
    kind: 'no_capability',
    reason: 'no registered verifier satisfies the claim schema',
    claim_shape: claim,
    observed_facts: claim.inputs || null,
    missing_verifier_kind: claim.transition || null,
    missing_input_schema: nearest.errors,
    source_change_ids: claim.source_change_ids || [],
    session_id: claim.session_id || null
  };
}

module.exports = { MECHANICAL, CANDIDATE, MISSING, resolveVerifier, loadRegistry, matchClaim, resolveClaim };
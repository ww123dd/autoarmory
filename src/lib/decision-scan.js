'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonl, writeJsonl, writeJson } = require('./util');
const { resolveClaim } = require('./verifier-resolver');
const changeInspector = require('./change-inspector');
const baselineManifest = require('./baseline-manifest');

function readRows(file) {
  if (!fs.existsSync(file)) return [];
  try { return readJsonl(file); }
  catch (_) { return []; }
}
function readJsonFile(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}
function registeredIds(repo) {
  const lock = readJsonFile(path.join(repo, 'verifiers.lock.json'));
  return lock && Array.isArray(lock.verifiers) ? lock.verifiers.map(function (item) { return item.id; }).filter(Boolean) : [];
}
function transitionIndex(stateDir) {
  const file = path.join(stateDir, 'decision-scan', 'transition-candidates.jsonl');
  const index = {};
  for (const row of readRows(file)) if (row && row.change_id) index[row.change_id] = row;
  return index;
}
function declarationFor(changeId, stateDir) {
  if (!changeId) return null;
  const manifest = readJsonFile(path.join(stateDir, 'claims.manifest.json'));
  if (!manifest) return null;
  const claims = manifest.claims && typeof manifest.claims === 'object' ? manifest.claims : manifest;
  return claims[changeId] || null;
}
function ownerFor(draft, stateDir) {
  if (draft && draft.owner) return { owner: draft.owner, source: 'explicit' };
  const registry = readJsonFile(path.join(stateDir, 'owners.json')) || {};
  const owners = registry.owners && typeof registry.owners === 'object' ? registry.owners : registry;
  for (const key of [draft && draft.change_id, draft && draft.session_id, draft && draft.project, draft && draft.task_type, draft && draft.action_class]) {
    if (key && owners[key]) return { owner: owners[key], source: 'owner_registry' };
  }
  if (owners.default) return { owner: owners.default, source: 'owner_registry' };
  return { owner: null, source: 'missing' };
}
function inferArtifactType(draft) {
  if (draft && draft.artifact_type) return draft.artifact_type;
  const text = ((draft && draft.commands || []).join(' ') + ' ' + (draft && draft.changed_files || []).join(' ')).toLowerCase();
  if (/transcript|session|rollout/.test(text)) return 'transcript-window';
  if (/(pytest|npm test|node(?:\.exe)?\s+tests|tsc|npm run build)/i.test(text)) return 'test-command';
  if (/examples[\\/]adapters|bridge\.js|enumeration/.test(text)) return 'repo-enumeration';
  if (/sha256|hash/.test(text)) return 'file';
  if (/\bgit\b/.test(text)) return 'git-commit';
  if (/doris|\bselect\b|\bshow\b|\bdesc\b/.test(text)) return 'doris-table';
  if (/https?:\/\/|curl|invoke-webrequest/.test(text)) return 'http-endpoint';
  if (/pid|process/.test(text)) return 'pid-file';
  if (/service/.test(text)) return 'windows-service';
  if (/registry/.test(text)) return 'windows-registry';
  if (/tls|cert/.test(text)) return 'tls-peer';
  return 'file';
}
function claimShapeFor(draft) {
  if (draft && draft.claim_shape && typeof draft.claim_shape === 'object') return Object.assign({}, draft.claim_shape, { access_required: draft.claim_shape.access_required === true || draft.access_required === true });
  const commands = draft && Array.isArray(draft.commands) ? draft.commands : [];
  const files = draft && Array.isArray(draft.changed_files) ? draft.changed_files : [];
  const commandText = commands.join(' ');
  const inputs = Object.assign({}, draft && draft.claim_instance || {});
  if (!inputs.path && files.length) inputs.path = typeof files[0] === 'string' ? files[0] : files[0] && files[0].path;
  if (!inputs.sha256) { const match = commandText.match(/\b[a-f0-9]{64}\b/i); if (match) inputs.sha256 = match[0]; }
  if (!inputs.url) { const match = commandText.match(/https?:\/\/[^\s'"]+/i); if (match) inputs.url = match[0]; }
  if (!inputs.commit) { const match = commandText.match(/\b[a-f0-9]{7,40}\b/i); if (match && /\bgit\b/i.test(commandText)) inputs.commit = match[0]; }
  if (inferArtifactType(draft) === 'test-command') {
    if (!inputs.command && commands.length) inputs.command = commands[0];
    if (!inputs.cwd) inputs.cwd = draft.cwd || '.';
  }
  return {
    transition: draft.expected_transition || null,
    artifact_type: inferArtifactType(draft),
    inputs: inputs,
    expected_provenance: draft.expected_provenance || null,
    baseline_id: draft.baseline_id || null,
    owner: draft.owner || null,
    verifier_id: draft.verifier_id || null,
    action_class: draft.action_class || null,
    scope: draft.scope || null,
    assertion: draft.assertion || null,
    access_required: draft.access_required === true,
    source_change_ids: Array.isArray(draft.change_record_ids) ? draft.change_record_ids : [],
    session_id: draft.session_id || null
  };
}
function resolverFor(draft, context) {
  const claim = claimShapeFor(draft);
  const capability = resolveClaim(claim, { repo: context && context.repo });
  if (capability.kind === 'matched') return { kind: 'registered', ref: capability.verifier_id, reason: capability.reason, capability: capability.verifier.capabilities };
  if (capability.kind === 'blocked_by_access') return { kind: 'blocked_by_access', ref: null, reason: capability.reason, claim_shape: claim };
  if (capability.kind === 'no_capability') return { kind: 'no_capability', ref: null, reason: capability.reason, missing: capability };
  if (capability.kind === 'ambiguous_capability') return { kind: 'ambiguous_capability', ref: null, reason: capability.reason, candidates: capability.candidates };
  return { kind: 'verifier_missing', ref: null, reason: capability.reason, claim_shape: claim };
}
function classifyDraft(draft, context) {
  const ctx = context || {};
  const changeId = draft.change_id || draft.id || null;
  const declaration = declarationFor(changeId, ctx.stateDir);
  const candidate = ctx.transitionIndex && changeId ? ctx.transitionIndex[changeId] : null;
  const effectiveDraft = Object.assign({}, draft, declaration || {});
  if (declaration && declaration.expected_transition) effectiveDraft.transition_source_strength = 'declared';
  if (!effectiveDraft.expected_transition && candidate) {
    effectiveDraft.expected_transition = candidate.candidate_transition || null;
    effectiveDraft.transition_source = candidate.transition_source || null;
    effectiveDraft.transition_source_strength = candidate.source_strength || null;
  }
  const owner = ownerFor(effectiveDraft, ctx.stateDir);
  const claim = claimShapeFor(effectiveDraft);
  const resolution = resolverFor(effectiveDraft, ctx);
  if (!claim.expected_provenance && effectiveDraft.transition_source_strength === 'derived' && resolution.kind === 'registered' && resolution.capability && Array.isArray(resolution.capability.expected_provenance) && resolution.capability.expected_provenance.indexOf('pinned_verifier') !== -1) {
    claim.expected_provenance = 'pinned_verifier';
    effectiveDraft.expected_provenance = 'pinned_verifier';
    effectiveDraft.provenance_source = 'derived_pinned_verifier';
  }
  const transitionPresent = !!effectiveDraft.expected_transition;
  const reasonCodes = [];
  let disposition = 'unverifiable';
  if (!transitionPresent) {
    disposition = 'missing_transition';
    reasonCodes.push('missing_transition');
  } else if (resolution.kind === 'registered') {
    if (!owner.owner) { disposition = 'blocked'; reasonCodes.push('blocked_by_owner'); }
    else if (!claim.expected_provenance) { disposition = 'blocked'; reasonCodes.push('blocked_by_expected_provenance'); }
    else if (effectiveDraft.transition_source_strength && ['declared', 'derived'].indexOf(effectiveDraft.transition_source_strength) === -1) { disposition = 'unverifiable'; reasonCodes.push('transition_source_candidate_only'); }
    else {
      const provenanceCheck = baselineManifest.validateProvenance(ctx.stateDir, Object.assign({}, claim, { change_id: changeId, owner: owner.owner }), { repo: ctx.repo, verifier_id: resolution.ref });
      if (!provenanceCheck.ok) { disposition = 'blocked'; reasonCodes.push('blocked_by_expected_provenance'); }
      else disposition = 'ready_for_verifier';
      effectiveDraft.provenance_validation = provenanceCheck;
    }
  } else if (resolution.kind === 'blocked_by_access') {
    disposition = 'blocked'; reasonCodes.push('blocked_by_access');
  } else if (resolution.kind === 'no_capability' || resolution.kind === 'verifier_missing') {
    disposition = 'true_no_capability'; reasonCodes.push('true_no_capability');
  } else if (resolution.kind === 'ambiguous_capability') {
    disposition = 'unverifiable'; reasonCodes.push('ambiguous_capability');
  } else {
    disposition = 'unverifiable'; reasonCodes.push('verifier_missing');
  }
  const uniqueReasonCodes = Array.from(new Set(reasonCodes));
  return {
    schema_version: 'autoarmory/decision-draft/v1',
    change_id: changeId,
    session_id: draft.session_id || null,
    turn_id: draft.turn_id || null,
    source_message_id: draft.source_message_id || null,
    source_refs: Array.isArray(draft.change_record_ids) ? draft.change_record_ids : [],
    signal_score: draft.signal_score || 0,
    high_signal: draft.high_signal === true,
    signals: Array.isArray(draft.signals) ? draft.signals : [],
    commands: Array.isArray(draft.commands) ? draft.commands : [],
    changed_files: Array.isArray(draft.changed_files) ? draft.changed_files : [],
    expected_transition: effectiveDraft.expected_transition || null,
    transition_present: transitionPresent,
    transition_source: effectiveDraft.transition_source || (declaration && declaration.expected_transition ? 'owner_declared' : null),
    transition_source_strength: effectiveDraft.transition_source_strength || (declaration && declaration.expected_transition ? 'declared' : null),
    transition_candidate: candidate || null,
    expected_provenance: claim.expected_provenance,
    expected_value: Object.prototype.hasOwnProperty.call(effectiveDraft, 'expected_value') ? effectiveDraft.expected_value : null,
    claim_instance: claim.inputs || null,
    claim_shape: claim,
    owner: owner.owner,
    owner_source: owner.source,
    verifier_candidate: resolution,
    disposition: disposition,
    reason_codes: uniqueReasonCodes,
    no_capability: resolution.kind === 'no_capability' ? resolution.missing : null,
    provenance_source: effectiveDraft.provenance_source || null,
    provenance_validation: effectiveDraft.provenance_validation || null,
    claim_declaration_source: declaration ? 'claims_manifest' : null,
    pipeline_stage: 'nomination_only'
  };
}
function scanDrafts(draftRows, options) {
  const opts = options || {};
  const context = { stateDir: opts.stateDir || opts.state || '.', repo: opts.repo || '.', transitionIndex: opts.transitionIndex || {} };
  return (Array.isArray(draftRows) ? draftRows : []).map(function (draft) { return classifyDraft(draft, context); });
}
function scan(stateDir, options) {
  const opts = options || {};
  const root = path.resolve(stateDir || opts.state || '.');
  const repo = path.resolve(opts.repo || '.');
  const engineDir = path.join(root, 'change-inspector');
  const recordsFile = path.join(engineDir, 'change-records.jsonl');
  const records = readRows(recordsFile);
  const insufficient = records.length === 0;
  let candidates = [];
  if (!insufficient) {
    const raw = changeInspector.candidateCases(records, { verifier_ids: registeredIds(repo) });
    candidates = raw.filter(function (item) { return item.candidate === true; });
  }
  const limit = opts.limit === undefined ? 200 : Number(opts.limit);
  candidates = candidates.sort(function (a, b) {
    if ((b.high_signal === true ? 1 : 0) !== (a.high_signal === true ? 1 : 0)) return (b.high_signal === true ? 1 : 0) - (a.high_signal === true ? 1 : 0);
    return (Number(b.signal_score) || 0) - (Number(a.signal_score) || 0) || String(a.change_id).localeCompare(String(b.change_id));
  });
  if (Number.isFinite(limit) && limit > 0) candidates = candidates.slice(0, limit);
  const drafts = scanDrafts(candidates, { stateDir: root, repo: repo, transitionIndex: transitionIndex(root) });
  const missingTransition = drafts.filter(function (item) { return item.disposition === 'missing_transition'; });
  const trueNoCapability = drafts.filter(function (item) { return item.disposition === 'true_no_capability'; });
  const ready = drafts.filter(function (item) { return item.disposition === 'ready_for_verifier'; });
  const unverifiable = drafts.filter(function (item) { return item.disposition === 'unverifiable'; });
  const blockedAccess = drafts.filter(function (item) { return item.reason_codes.indexOf('blocked_by_access') !== -1; });
  const blockedOwner = drafts.filter(function (item) { return item.reason_codes.indexOf('blocked_by_owner') !== -1; });
  const blockedExpected = drafts.filter(function (item) { return item.reason_codes.indexOf('blocked_by_expected_provenance') !== -1; });
  const transitionPresent = drafts.filter(function (item) { return item.transition_present === true; });
  const transitionTrusted = transitionPresent.filter(function (item) { return item.transition_source_strength === 'declared' || item.transition_source_strength === 'derived'; });
  const report = {
    schema_version: 'autoarmory/decision-scan/v1',
    state_root: root,
    repo: repo,
    source_file: recordsFile,
    source_records: records.length,
    candidate_count: candidates.length,
    inventory_draft_count: drafts.length,
    draft_count: drafts.length,
    missing_transition_count: missingTransition.length,
    transition_present_count: transitionPresent.length,
    transition_present_rate: drafts.length ? Number((transitionPresent.length / drafts.length).toFixed(6)) : 0,
    transition_declared_count: transitionPresent.filter(function (item) { return item.transition_source_strength === 'declared'; }).length,
    transition_derived_count: transitionPresent.filter(function (item) { return item.transition_source_strength === 'derived'; }).length,
    transition_candidate_count: transitionPresent.filter(function (item) { return item.transition_source_strength === 'candidate'; }).length,
    transition_source_rate: transitionPresent.length ? Number((transitionTrusted.length / transitionPresent.length).toFixed(6)) : 0,
    transition_derived_rate: transitionPresent.length ? Number((transitionPresent.filter(function (item) { return item.transition_source_strength === 'derived'; }).length / transitionPresent.length).toFixed(6)) : 0,
    ready_for_verifier_count: ready.length,
    true_no_capability_count: trueNoCapability.length,
    no_capability_count: trueNoCapability.length,
    blocked_by_owner_count: blockedOwner.length,
    blocked_by_expected_provenance_count: blockedExpected.length,
    blocked_by_access_count: blockedAccess.length,
    unverifiable_count: unverifiable.length,
    insufficient_real_stream: insufficient,
    pipeline_stage: 'nomination_only',
    drafts: drafts
  };
  if (opts.apply === true && !insufficient) {
    const out = path.join(root, 'decision-scan');
    fs.mkdirSync(out, { recursive: true });
    writeJsonl(path.join(out, 'decision-drafts.jsonl'), drafts);
    writeJsonl(path.join(out, 'ready-for-verifier.jsonl'), ready);
    writeJsonl(path.join(out, 'missing-transition.jsonl'), missingTransition);
    writeJsonl(path.join(out, 'true-no-capability.jsonl'), trueNoCapability);
    writeJsonl(path.join(out, 'no-capability.jsonl'), trueNoCapability);
    writeJsonl(path.join(out, 'unverifiable.jsonl'), unverifiable);
    writeJsonl(path.join(out, 'blocked-by-access.jsonl'), blockedAccess);
    writeJsonl(path.join(out, 'blocked-by-owner.jsonl'), blockedOwner);
    writeJsonl(path.join(out, 'blocked-by-expected-provenance.jsonl'), blockedExpected);
    writeJson(path.join(out, 'summary.json'), Object.assign({}, report, { drafts: undefined, generated_at: new Date().toISOString() }));
  }
  return report;
}
module.exports = { scan, scanDrafts, classifyDraft, ownerFor, resolverFor };
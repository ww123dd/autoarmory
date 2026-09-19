'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonl, writeJsonl, writeJson } = require('./util');
const { resolveVerifier, resolveClaim } = require('./verifier-resolver');
const changeInspector = require('./change-inspector');

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
  return {
    transition: draft.expected_transition || null,
    artifact_type: inferArtifactType(draft),
    inputs: inputs,
    expected_provenance: draft.expected_provenance || null,
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
  const owner = ownerFor(draft, ctx.stateDir);
  const claim = claimShapeFor(draft);
  const resolution = resolverFor(draft, ctx);
  const reasonCodes = [];
  if (!owner.owner) reasonCodes.push('blocked_by_owner');
  if (!draft.expected_transition) reasonCodes.push('expected_transition_missing');
  if (!claim.expected_provenance) reasonCodes.push('expected_provenance_missing');
  if (resolution.kind === 'blocked_by_access') reasonCodes.push('blocked_by_access');
  if (resolution.kind === 'no_capability') reasonCodes.push('no_capability');
  if (resolution.kind === 'ambiguous_capability') reasonCodes.push('ambiguous_capability');
  if (resolution.kind === 'verifier_missing') reasonCodes.push('verifier_missing');
  let disposition = 'unverifiable';
  if (reasonCodes.indexOf('blocked_by_owner') !== -1 || reasonCodes.indexOf('blocked_by_access') !== -1) disposition = 'blocked';
  else if (resolution.kind === 'registered' && reasonCodes.length === 0) disposition = 'ready_for_verifier';
  else if (reasonCodes.indexOf('no_capability') !== -1) disposition = 'no_capability';
  const uniqueReasonCodes = Array.from(new Set(reasonCodes));
  return {
    schema_version: 'autoarmory/decision-draft/v1',
    change_id: draft.change_id || draft.id || null,
    session_id: draft.session_id || null,
    turn_id: draft.turn_id || null,
    source_message_id: draft.source_message_id || null,
    source_refs: Array.isArray(draft.change_record_ids) ? draft.change_record_ids : [],
    signal_score: draft.signal_score || 0,
    high_signal: draft.high_signal === true,
    signals: Array.isArray(draft.signals) ? draft.signals : [],
    commands: Array.isArray(draft.commands) ? draft.commands : [],
    changed_files: Array.isArray(draft.changed_files) ? draft.changed_files : [],
    expected_transition: draft.expected_transition || null,
    expected_provenance: claim.expected_provenance,
    expected_value: Object.prototype.hasOwnProperty.call(draft, 'expected_value') ? draft.expected_value : null,
    claim_instance: claim.inputs || null,
    claim_shape: claim,
    owner: owner.owner,
    owner_source: owner.source,
    verifier_candidate: resolution,
    disposition: disposition,
    reason_codes: uniqueReasonCodes,
    no_capability: resolution.kind === 'no_capability' ? resolution.missing : null,
    pipeline_stage: 'nomination_only'
  };
}
function scanDrafts(draftRows, options) {
  const opts = options || {};
  const context = { stateDir: opts.stateDir || opts.state || '.', repo: opts.repo || '.' };
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
  const drafts = scanDrafts(candidates, { stateDir: root, repo: repo });
  const ready = drafts.filter(function (item) { return item.disposition === 'ready_for_verifier'; });
  const unverifiable = drafts.filter(function (item) { return item.disposition === 'unverifiable'; });
  const blockedAccess = drafts.filter(function (item) { return item.reason_codes.indexOf('blocked_by_access') !== -1; });
  const blockedOwner = drafts.filter(function (item) { return item.reason_codes.indexOf('blocked_by_owner') !== -1; });
  const noCapability = drafts.filter(function (item) { return item.reason_codes.indexOf('no_capability') !== -1; });
  const report = {
    schema_version: 'autoarmory/decision-scan/v1',
    state_root: root,
    repo: repo,
    source_file: recordsFile,
    source_records: records.length,
    candidate_count: candidates.length,
    draft_count: drafts.length,
    ready_for_verifier_count: ready.length,
    unverifiable_count: unverifiable.length,
    blocked_by_access_count: blockedAccess.length,
    blocked_by_owner_count: blockedOwner.length,
    no_capability_count: noCapability.length,
    insufficient_real_stream: insufficient,
    pipeline_stage: 'nomination_only',
    drafts: drafts
  };
  if (opts.apply === true && !insufficient) {
    const out = path.join(root, 'decision-scan');
    fs.mkdirSync(out, { recursive: true });
    writeJsonl(path.join(out, 'decision-drafts.jsonl'), drafts);
    writeJsonl(path.join(out, 'ready-for-verifier.jsonl'), ready);
    writeJsonl(path.join(out, 'unverifiable.jsonl'), unverifiable);
    writeJsonl(path.join(out, 'blocked-by-access.jsonl'), blockedAccess);
    writeJsonl(path.join(out, 'blocked-by-owner.jsonl'), blockedOwner);
    writeJsonl(path.join(out, 'no-capability.jsonl'), noCapability);
    writeJson(path.join(out, 'summary.json'), Object.assign({}, report, { drafts: undefined, generated_at: new Date().toISOString() }));
  }
  return report;
}
module.exports = { scan, scanDrafts, classifyDraft, ownerFor, resolverFor };
'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonl, writeJsonl, writeJson } = require('./util');
const { resolveVerifier, MECHANICAL, CANDIDATE, MISSING } = require('./verifier-resolver');
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
function resolverFor(draft) {
  if (draft && draft.verifier_resolution && draft.verifier_resolution.kind) return draft.verifier_resolution;
  const command = draft && Array.isArray(draft.commands) && draft.commands.length ? draft.commands[0] : '';
  const files = draft && Array.isArray(draft.changed_files) ? draft.changed_files.map(function (item) { return typeof item === 'string' ? { path: item } : item; }) : [];
  return resolveVerifier({ command: command, files: files, source_text: JSON.stringify({ commands: draft && draft.commands || [], changed_files: draft && draft.changed_files || [], signals: draft && draft.signals || [] }) });
}
function classifyDraft(draft, context) {
  const ctx = context || {};
  const owner = ownerFor(draft, ctx.stateDir);
  const resolution = resolverFor(draft);
  const reasonCodes = [];
  if (!owner.owner) reasonCodes.push('blocked_by_owner');
  if (!draft.expected_transition) reasonCodes.push('expected_transition_missing');
  const mechanical = MECHANICAL.indexOf(resolution.kind) !== -1;
  let disposition = 'unverifiable';
  if (mechanical) {
    disposition = reasonCodes.length ? (reasonCodes.indexOf('blocked_by_owner') !== -1 ? 'blocked' : 'unverifiable') : 'ready_for_verifier';
  } else if (resolution.kind === CANDIDATE && ['http', 'sql', 'process', 'dom'].indexOf(resolution.inferred_kind) !== -1) {
    reasonCodes.push('blocked_by_access');
    disposition = 'blocked';
  } else {
    reasonCodes.push(resolution.kind === MISSING ? 'verifier_missing' : 'verifier_candidate_requires_pinned_binding');
    disposition = 'unverifiable';
  }
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
    owner: owner.owner,
    owner_source: owner.source,
    verifier_candidate: resolution,
    disposition: disposition,
    reason_codes: uniqueReasonCodes,
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
    writeJson(path.join(out, 'summary.json'), Object.assign({}, report, { drafts: undefined, generated_at: new Date().toISOString() }));
  }
  return report;
}
module.exports = { scan, scanDrafts, classifyDraft, ownerFor, resolverFor };
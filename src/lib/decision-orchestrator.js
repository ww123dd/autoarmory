'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJsonl, writeJson, sha256 } = require('./util');

function readRows(file) {
  if (!fs.existsSync(file)) return [];
  try { return readJsonl(file); }
  catch (_) { return []; }
}
function gitHead(repo) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? String(result.stdout || '').trim() : null;
}
function pendingJob(draft, repo) {
  const resolution = draft.verifier_candidate || {};
  const job = {
    schema_version: 'autoarmory/pending-change/v1',
    change_id: draft.change_id,
    session_id: draft.session_id || null,
    turn_id: draft.turn_id || null,
    source_message_id: draft.source_message_id || null,
    changed_files: draft.changed_files || [],
    commands: draft.commands || [],
    signals: draft.signals || [],
    expected_transition: draft.expected_transition,
    claim_instance: draft.claim_instance || (draft.claim_shape && draft.claim_shape.inputs) || null,
    expected_value: Object.prototype.hasOwnProperty.call(draft, 'expected_value') ? draft.expected_value : null,
    expected_provenance: draft.expected_provenance || null,
    owner: draft.owner || null,
    action_class: draft.action_class || null
  };
  if (resolution.kind === 'registered') job.verifier_id = resolution.ref;
  else {
    job.verifier_candidate = { kind: resolution.kind, ref: resolution.ref };
    job.mechanical_binding = {
      kind: resolution.kind,
      command_sha256: resolution.ref ? sha256(String(resolution.ref)) : null,
      cwd: repo,
      repo_head: gitHead(repo),
      timeout_ms: 30000,
      allowlist_class: resolution.kind
    };
  }
  return job;
}
function orchestrate(stateDir, options) {
  const opts = options || {};
  const root = path.resolve(stateDir || opts.state || '.');
  const repo = path.resolve(opts.repo || '.');
  const readyFile = path.join(root, 'decision-scan', 'ready-for-verifier.jsonl');
  const pendingDir = path.join(root, 'pending');
  let rows = readRows(readyFile);
  if (opts.changeId) rows = rows.filter(function (row) { return row.change_id === opts.changeId; });
  if (Number.isFinite(Number(opts.limit)) && Number(opts.limit) > 0) rows = rows.slice(0, Number(opts.limit));
  const report = {
    schema_version: 'autoarmory/decision-orchestrator/v1',
    state_root: root,
    repo: repo,
    apply: opts.apply === true,
    ready_count: rows.length,
    written: 0,
    skipped: 0,
    already_pending: 0,
    results: []
  };
  for (const draft of rows) {
    if (!draft || draft.disposition !== 'ready_for_verifier' || !draft.expected_transition || !draft.change_id) {
      report.skipped += 1;
      report.results.push({ change_id: draft && draft.change_id || null, status: 'skipped', reason: 'draft_not_ready' });
      continue;
    }
    const job = pendingJob(draft, repo);
    const file = path.join(pendingDir, draft.change_id + '.json');
    if (fs.existsSync(file)) {
      report.already_pending += 1;
      report.results.push({ change_id: draft.change_id, status: 'already_pending' });
      continue;
    }
    if (opts.apply === true) writeJson(file, job);
    report.written += 1;
    report.results.push({ change_id: draft.change_id, status: opts.apply === true ? 'written' : 'would_write' });
  }
  return report;
}
module.exports = { orchestrate, pendingJob };
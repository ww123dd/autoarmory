'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJsonl, writeJson, writeJsonl, sha256 } = require('./util');
const sessionShadow = require('./session-shadow');
const changeInspector = require('./change-inspector');
const verdictView = require('./verdict-view');

function cleanPart(value) { return String(value || '').replace(/[^A-Za-z0-9._-]/g, '_'); }
function sessionRoot(options) { return path.resolve((options && options.sessionRoot) || process.env.CODEX_SESSION_ROOT || path.join(os.homedir(), '.codex', 'sessions')); }
function stateDir(options) { return path.resolve((options && options.stateDir) || process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow')); }
function registryFile(dir) { return path.join(dir, 'session-registry.jsonl'); }
function findInRegistry(dir, sessionId) { if (!sessionId || !fs.existsSync(registryFile(dir))) return null; const rows = readJsonl(registryFile(dir)); for (let index = rows.length - 1; index >= 0; index--) { const row = rows[index]; if (row.session_id === sessionId && row.session_file && fs.existsSync(row.session_file)) return row; } return null; }
function pinSession(dir, event, sessionFile, located) { try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(registryFile(dir), JSON.stringify({ schema_version: 'autoarmory/session-registry/v1', session_id: event.session_id || null, session_file: sessionFile, cwd: event.cwd || null, match: located.match || null, pinned_at: new Date().toISOString() }) + '\n', 'utf8'); } catch (_) {} }
function gapRetryCount(dir, sessionId) { try { if (!fs.existsSync(path.join(dir, 'shadow-gaps.jsonl'))) return 0; return readJsonl(path.join(dir, 'shadow-gaps.jsonl')).filter(function (row) { return row.session_id === sessionId; }).length; } catch (_) { return 0; } }
function recordGap(dir, event, reason, diagnostics) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'shadow-gaps.jsonl'), JSON.stringify({
      schema_version: 'autoarmory/stop-shadow-gap/v1',
      at: new Date().toISOString(),
      session_id: event && event.session_id || null,
      turn_id: event && event.turn_id || null,
      cwd: event && event.cwd || null,
      reason: reason,
      search_root: diagnostics && diagnostics.root || null,
      elapsed_ms: diagnostics && diagnostics.elapsed_ms || null,
      candidate_count: diagnostics && diagnostics.candidate_count || 0,
      exact_matches: diagnostics && diagnostics.exact_matches || 0,
      tail_matches: diagnostics && diagnostics.tail_matches || 0,
      retry_count: gapRetryCount(dir, event && event.session_id) + 1,
      give_up: gapRetryCount(dir, event && event.session_id) + 1 >= 3,
      match: diagnostics && diagnostics.match || null,
      fallback_candidate: diagnostics && diagnostics.fallback_candidate || null
    }) + '\n', 'utf8');
  } catch (_) {}
}
function readHead(file, bytes) {
  const size = Number(bytes || 16384);
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(size);
    const read = fs.readSync(fd, buffer, 0, size, 0);
    return buffer.slice(0, read).toString('utf8').split(/\r?\n/)[0];
  } finally { fs.closeSync(fd); }
}
function sessionMeta(file) {
  try { const row = JSON.parse(readHead(file)); return row && row.payload ? row.payload : null; } catch (_) { return null; }
}
function sameCwd(left, right) {
  if (!left || !right) return false;
  return String(left).replace(/[\\/]+$/, '').toLowerCase() === String(right).replace(/[\\/]+$/, '').toLowerCase();
}
function recentRollouts(root, options) {
  const maxAgeMs = Number((options && options.fallbackMaxAgeMs) || 24 * 60 * 60 * 1000);
  const maxCandidates = Number((options && options.maxCandidates) || 200);
  const now = Date.now();
  let files = [];
  if (typeof fs.globSync === 'function') {
    try { files = fs.globSync('**/rollout*.jsonl', { cwd: root }).map(function (name) { return path.resolve(root, name); }); } catch (_) { files = []; }
  } else {
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile() && /^rollout.*\.jsonl$/i.test(entry.name)) files.push(full);
      }
    }
  }
  return files.map(function (file) { let stat; try { stat = fs.statSync(file); } catch (_) { return null; } return { file: file, mtimeMs: stat.mtimeMs }; }).filter(function (item) { return item && now - item.mtimeMs <= maxAgeMs; }).sort(function (a, b) { return b.mtimeMs - a.mtimeMs; }).slice(0, maxCandidates);
}
function locateSession(sessionId, options, event) {
  const started = Date.now();
  const root = sessionRoot(options);
  const info = { root: root, session_id: sessionId || null, file: null, match: null, candidate_count: 0, exact_matches: 0, tail_matches: 0, elapsed_ms: 0, cwd: event && event.cwd || null };
  if (!sessionId || !fs.existsSync(root)) { info.elapsed_ms = Date.now() - started; return info; }
  const candidates = recentRollouts(root, options);
  info.candidate_count = candidates.length;
  const exact = candidates.filter(function (item) { return item.file.indexOf(cleanPart(sessionId)) !== -1; });
  info.exact_matches = exact.length;
  if (exact.length) { info.file = exact[0].file; info.match = 'exact'; info.elapsed_ms = Date.now() - started; return info; }
  const tail = cleanPart(sessionId).slice(-12);
  const tailHits = candidates.filter(function (item) { return item.file.indexOf(tail) !== -1; });
  info.tail_matches = tailHits.length;
  if (tailHits.length) { info.file = tailHits[0].file; info.match = 'tail'; info.elapsed_ms = Date.now() - started; return info; }
  if (event && event.cwd) {
    for (const item of candidates) {
      const meta = sessionMeta(item.file);
      if (meta && sameCwd(meta.cwd, event.cwd)) { info.fallback_candidate = item.file; info.match = 'cwd_candidate'; info.elapsed_ms = Date.now() - started; return info; }
    }
  }
  info.elapsed_ms = Date.now() - started;
  return info;
}
function findSessionFile(sessionId, options) { return locateSession(sessionId, options, {}).file; }
function draftKey(row) { return String(row && row.session_id || '') + '|' + String(row && row.id || ''); }
function stripDraft(draft, event, stats) {
  const copy = Object.assign({}, draft);
  const hadSession = !!copy.session_id;
  const hadTurn = !!copy.turn_id;
  if (!copy.session_id && event && event.session_id) copy.session_id = event.session_id;
  if (!copy.turn_id && event && event.turn_id) copy.turn_id = event.turn_id;
  const bareUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(copy.session_id || ''));
  if (!copy.provenance_status) {
    if (hadSession && bareUuid) copy.provenance_status = 'attribution_lost';
    else if (hadSession) copy.provenance_status = 'canonical';
    else if (copy.session_id) copy.provenance_status = 'filled_from_event';
    else copy.provenance_status = 'missing';
  }
  if (copy.signals) { copy.high_signal = changeInspector.isHighSignal(copy.signals, copy.repeat_count); copy.notify = copy.high_signal; }
  delete copy.verifier_resolution;
  delete copy.verifier_ref;
  copy.verification_state = 'unresolved';
  copy.closure = false;
  copy.requires_agent_decision = true;
  if (stats) {
    if (hadSession && copy.provenance_status === 'attribution_lost') stats.session_lost += 1;
    else if (hadSession) stats.session_preserved += 1;
    else if (copy.session_id) stats.session_filled += 1;
    if (hadTurn) stats.turn_preserved += 1;
    else if (copy.turn_id) stats.turn_filled += 1;
  }
  return copy;
}
function uniqueDrafts(rows) {
  const seen = {};
  return (rows || []).filter(function (row) {
    const id = row && row.id;
    const key = draftKey(row);
    if (!id || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}
function repoIdentity(repo) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', windowsHide: true });
  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: repo, encoding: 'utf8', windowsHide: true });
  return { repo_head: head.status === 0 ? String(head.stdout || '').trim() : null, repo_remote: remote.status === 0 ? String(remote.stdout || '').trim() : null };
}
function writePendingJobs(dir, drafts) {
  if (!drafts || !drafts.length) return [];
  const pendingDir = path.join(dir, 'pending');
  fs.mkdirSync(pendingDir, { recursive: true });
  const written = [];
  for (const draft of drafts) {
    const changeId = draft.change_id || draft.id;
    if (!changeId) continue;
    const resolution = draft.verifier_resolution || {};
    const job = {
      schema_version: 'autoarmory/pending-change/v1',
      change_id: changeId,
      session_id: draft.session_id || null,
      turn_id: draft.turn_id || null,
      source_message_id: draft.source_message_id || null,
      changed_files: draft.changed_files || [],
      commands: draft.commands || [],
      check_status: draft.check_status || null,
      signals: draft.signals || [],
      verifier_id: resolution.kind === 'registered' ? resolution.ref : null,
      verifier_candidate: resolution.kind && resolution.kind !== 'registered' ? resolution : null
    };
    if (resolution.kind === 'project_test' || resolution.kind === 'git_status' || resolution.kind === 'file_hash') { const identity = repoIdentity(repo); job.mechanical_binding = { kind: resolution.kind, command_sha256: resolution.ref ? sha256(String(resolution.ref)) : null, cwd: draft.cwd || null, repo_head: identity.repo_head, repo_remote: identity.repo_remote, timeout_ms: 30000, allowlist_class: resolution.kind }; }
    const file = path.join(pendingDir, changeId + '.json');
    writeJson(file, job);
    written.push(file);
  }
  return written;
}
function runStopShadow(event, options) {
  const opts = options || {};
  if (process.env.STOP_SHADOW_OFF === '1') return { ok: true, skipped: 'disabled' };
  if (!event || event.stop_hook_active === true) return { ok: true, skipped: 'stop_hook_active' };
  if (!event.session_id && !event.transcript_path) return { ok: true, skipped: 'no_session_identity' };
  const dir = stateDir(opts);
  const registryHit = findInRegistry(dir, event.session_id);
  const located = registryHit ? { file: registryHit.session_file, match: 'registry', candidate_count: 0, root: sessionRoot(opts), elapsed_ms: 0 } : (event.transcript_path && fs.existsSync(event.transcript_path) ? { file: path.resolve(event.transcript_path), match: 'transcript_path', candidate_count: 0, root: sessionRoot(opts), elapsed_ms: 0 } : locateSession(event.session_id, opts, event));
  const sessionFile = located.file;
  if (!sessionFile) {
    recordGap(dir, event, 'session_not_found', located);
    return { ok: true, gap: 'session_not_found', diagnostics: located };
  }
  pinSession(dir, event, sessionFile, located);
  const repo = opts.repo || path.resolve(__dirname, '..', '..');
  const engineDir = path.join(dir, 'change-inspector');
  const candidatesFile = path.join(engineDir, 'candidate-cases.jsonl');
  const newDraftsFile = path.join(engineDir, 'new-drafts.jsonl');
  const timeoutMs = Number(opts.timeoutMs || process.env.AUTOARMORY_STOP_TIMEOUT_MS || 5000);
  const scan = spawnSync(process.execPath, [path.join(repo, 'scripts', 'change-inspect.js'), '--session', sessionFile, '--state', engineDir, '--json'], { cwd: repo, encoding: 'utf8', timeout: timeoutMs, windowsHide: true, env: Object.assign({}, process.env) });
  if (scan.error && scan.error.code === 'ETIMEDOUT') { recordGap(dir, event, 'timeout', located); return { ok: true, gap: 'timeout', diagnostics: located }; }
  if (scan.status !== 0) { recordGap(dir, event, 'scan_failed', located); return { ok: true, gap: 'scan_failed', diagnostics: located }; }

  const newCandidates = fs.existsSync(newDraftsFile) ? readJsonl(newDraftsFile) : [];
  const projectionStateFile = path.join(dir, 'projection-state.json');
  let projectionState = fs.existsSync(projectionStateFile) ? JSON.parse(fs.readFileSync(projectionStateFile, 'utf8')) : null;
  const caseDraftsFile = path.join(dir, 'case-drafts.jsonl');
  if (!projectionState && fs.existsSync(caseDraftsFile)) {
    const existing = readJsonl(caseDraftsFile);
    const sessionCounts = {};
    const attribution = { session_preserved: 0, session_filled: 0, session_lost: 0, turn_preserved: 0, turn_filled: 0 };
    for (const draft of existing) {
      const key = draft.session_id || '(missing)';
      sessionCounts[key] = (sessionCounts[key] || 0) + 1;
      if (draft.provenance_status === 'attribution_lost') attribution.session_lost += 1;
      else if (draft.provenance_status === 'filled_from_event') attribution.session_filled += 1;
      else if (draft.session_id) attribution.session_preserved += 1;
    }
    projectionState = { schema_version: 'autoarmory/stop-shadow-projection-state/v1', projection_total: existing.length, high_signal_total: existing.filter(function (draft) { return draft.high_signal === true; }).length, session_counts: sessionCounts, attribution: attribution, updated_at: null };
    writeJson(projectionStateFile, projectionState);
  }
  if (!projectionState) projectionState = { schema_version: 'autoarmory/stop-shadow-projection-state/v1', policy_version: 0, reuse_record_count: 0, projection_total: 0, high_signal_total: 0, session_counts: {}, attribution: { session_preserved: 0, session_filled: 0, session_lost: 0, turn_preserved: 0, turn_filled: 0 }, updated_at: null };
  let currentSessionDraftCount = (projectionState.session_counts || {})[path.basename(sessionFile)] || 0;
  let newHighSignal = newCandidates.filter(function (draft) { return draft.high_signal === true; });
  const reuseIndex = verdictView.readReuseIndex(dir);
  const reuseRecordCount = Object.keys(reuseIndex).length;
  const forceProjection = projectionState.policy_version !== 4 || projectionState.reuse_record_count !== reuseRecordCount;

  if (newCandidates.length || forceProjection) {
    const allRecords = fs.existsSync(path.join(engineDir, 'change-records.jsonl')) ? readJsonl(path.join(engineDir, 'change-records.jsonl')) : [];
    const candidates = changeInspector.candidateCases(allRecords, { verifier_ids: [] });
    const attribution = { session_preserved: 0, session_filled: 0, session_lost: 0, turn_preserved: 0, turn_filled: 0 };
    const drafts = uniqueDrafts(candidates.map(function (draft) { return verdictView.joinDraft(stripDraft(draft, event, attribution), reuseIndex); }));
    const sessionCounts = {};
    for (const draft of drafts) { const key = draft.session_id || '(missing)'; sessionCounts[key] = (sessionCounts[key] || 0) + 1; }
    currentSessionDraftCount = sessionCounts[path.basename(sessionFile)] || 0;
    const highSignal = drafts.filter(function (draft) { return draft.high_signal === true; });
    projectionState = { schema_version: 'autoarmory/stop-shadow-projection-state/v1', policy_version: 4, reuse_record_count: reuseRecordCount, projection_total: drafts.length, high_signal_total: highSignal.length, session_counts: sessionCounts, attribution: attribution, updated_at: new Date().toISOString() };
    writeJsonl(path.join(dir, 'case-drafts.jsonl'), drafts);
    writeJson(path.join(dir, 'projection-state.json'), projectionState);
    writeJsonl(path.join(engineDir, 'notifications.jsonl'), highSignal);
    writeJson(path.join(engineDir, 'high-signal-changes.json'), { schema_version: 'autoarmory/high-signal-changes/v1', count: highSignal.length, changes: highSignal });
    writeJson(path.join(dir, 'high-signal.json'), { schema_version: 'autoarmory/stop-shadow-high-signal/v1', captured_at: new Date().toISOString(), session_id: event.session_id || null, count: highSignal.length, changes: highSignal, policy_invariants: { llm_judge_calls: 0, auto_close_count: 0, manual_case_creation_count: 0, stop_hook_blocked_session_count: 0 } });
    writePendingJobs(dir, newHighSignal);
  }

  const newEvents = fs.existsSync(path.join(engineDir, 'new-events.jsonl')) ? readJsonl(path.join(engineDir, 'new-events.jsonl')) : [];
  if (newEvents.length) {
    let verifiers = [];
    try { const lock = JSON.parse(fs.readFileSync(path.join(repo, 'verifiers.lock.json'), 'utf8')); verifiers = (lock.verifiers || []).map(function (item) { return { id: item.id, kind: item.kind || null, assertion: item.assertion || null }; }); } catch (_) { verifiers = []; }
    const sessionReport = sessionShadow.shadowSession(newEvents, { session_id: event.session_id || null, verifiers: verifiers });
    const sessionDrafts = uniqueDrafts((fs.existsSync(path.join(dir, 'session-case-drafts.jsonl')) ? readJsonl(path.join(dir, 'session-case-drafts.jsonl')) : []).concat(sessionReport.case_drafts.map(function (draft) { const copy = Object.assign({}, draft); copy.closure = false; copy.requires_agent_decision = true; return copy; })));
    writeJsonl(path.join(dir, 'session-case-drafts.jsonl'), sessionDrafts);
    const unverifiable = (fs.existsSync(path.join(dir, 'session-unverifiable.jsonl')) ? readJsonl(path.join(dir, 'session-unverifiable.jsonl')) : []).concat(sessionReport.unverifiable);
    const seenUnverifiable = {};
    writeJsonl(path.join(dir, 'session-unverifiable.jsonl'), unverifiable.filter(function (item) { const key = item && item.case_id || JSON.stringify(item); if (seenUnverifiable[key]) return false; seenUnverifiable[key] = true; return true; }));
  }

  const attribution = projectionState.attribution || { session_preserved: 0, session_filled: 0, session_lost: 0 };
  writeJson(path.join(dir, 'stop-shadow-summary.json'), {
    schema_version: 'autoarmory/stop-shadow-summary/v1',
    captured_at: new Date().toISOString(),
    session_id: event.session_id || null,
    session_file: sessionFile,
    auto_scan_count: 1,
    projection_total: projectionState.projection_total || 0,
    high_signal_total: projectionState.high_signal_total || 0,
    scanned_session_id: event.session_id || null,
    current_session_draft_count: currentSessionDraftCount,
    new_draft_count: newCandidates.length,
    new_high_signal_count: newHighSignal.length,
    attribution_preserved_count: attribution.session_preserved || 0,
    attribution_lost_count: attribution.session_lost || 0,
    attribution_filled_from_event_count: attribution.session_filled || 0,
    auto_case_draft_count: newCandidates.length,
    session_verified_candidate: 0,
    session_verifier_mismatch: 0,
    session_verifier_missing: 0,
    duplicate_run_draft_count: 0,
    policy_invariants: { stop_hook_blocked_session_count: 0, llm_judge_calls: 0, auto_close_count: 0, manual_case_creation_count: 0 }
  });
  return { ok: true, session_id: event.session_id || null, drafts: newCandidates.length, projection_total: projectionState.projection_total || 0, current_session_draft_count: currentSessionDraftCount, new_draft_count: newCandidates.length, attribution_preserved_count: attribution.session_preserved || 0, attribution_lost_count: attribution.session_lost || 0, attribution_filled_from_event_count: attribution.session_filled || 0, high_signal: newHighSignal.length, diagnostics: Object.assign({}, located, { session_file: sessionFile }) };
}
module.exports = { findSessionFile, locateSession, runStopShadow, recordGap };
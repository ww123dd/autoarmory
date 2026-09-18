'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJsonl, writeJson, writeJsonl } = require('./util');
const sessionShadow = require('./session-shadow');

function cleanPart(value) { return String(value || '').replace(/[^A-Za-z0-9._-]/g, '_'); }
function sessionRoot(options) { return path.resolve((options && options.sessionRoot) || process.env.CODEX_SESSION_ROOT || path.join(os.homedir(), '.codex', 'sessions')); }
function stateDir(options) { return path.resolve((options && options.stateDir) || process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow')); }
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
      tail_matches: diagnostics && diagnostics.tail_matches || 0
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
      if (meta && sameCwd(meta.cwd, event.cwd)) { info.file = item.file; info.match = 'latest_cwd'; info.elapsed_ms = Date.now() - started; return info; }
    }
  }
  info.elapsed_ms = Date.now() - started;
  return info;
}
function findSessionFile(sessionId, options) { return locateSession(sessionId, options, {}).file; }
function stripDraft(draft, event) {
  const copy = Object.assign({}, draft);
  delete copy.verifier_resolution;
  delete copy.verifier_ref;
  copy.session_id = event && event.session_id || copy.session_id;
  copy.turn_id = copy.turn_id || event && event.turn_id || null;
  copy.verification_state = 'unresolved';
  copy.closure = false;
  copy.requires_agent_decision = true;
  return copy;
}
function uniqueDrafts(rows) {
  const seen = {};
  return (rows || []).filter(function (row) {
    const id = row && row.id;
    if (!id || seen[id]) return false;
    seen[id] = true;
    return true;
  });
}
function runStopShadow(event, options) {
  const opts = options || {};
  if (process.env.STOP_SHADOW_OFF === '1') return { ok: true, skipped: 'disabled' };
  if (!event || event.stop_hook_active === true) return { ok: true, skipped: 'stop_hook_active' };
  if (!event.session_id && !event.transcript_path) return { ok: true, skipped: 'no_session_identity' };
  const dir = stateDir(opts);
  const located = event.transcript_path && fs.existsSync(event.transcript_path) ? { file: path.resolve(event.transcript_path), match: 'transcript_path', candidate_count: 0, root: sessionRoot(opts), elapsed_ms: 0 } : locateSession(event.session_id, opts, event);
  const sessionFile = located.file;
  if (!sessionFile) {
    recordGap(dir, event, 'session_not_found', located);
    return { ok: true, gap: 'session_not_found', diagnostics: located };
  }
  const repo = opts.repo || path.resolve(__dirname, '..', '..');
  const engineDir = path.join(dir, 'change-inspector');
  const timeoutMs = Number(opts.timeoutMs || process.env.AUTOARMORY_STOP_TIMEOUT_MS || 5000);
  const scan = spawnSync(process.execPath, [path.join(repo, 'scripts', 'change-inspect.js'), '--session', sessionFile, '--state', engineDir, '--json'], {
    cwd: repo,
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    env: Object.assign({}, process.env)
  });
  if (scan.error && scan.error.code === 'ETIMEDOUT') {
    recordGap(dir, event, 'timeout');
    return { ok: true, gap: 'timeout' };
  }
  if (scan.status !== 0) {
    recordGap(dir, event, 'scan_failed');
    return { ok: true, gap: 'scan_failed' };
  }
  const candidates = fs.existsSync(path.join(engineDir, 'candidate-cases.jsonl')) ? readJsonl(path.join(engineDir, 'candidate-cases.jsonl')) : [];
  const drafts = uniqueDrafts(candidates.map(function (draft) { return stripDraft(draft, event); }));
  writeJsonl(path.join(dir, 'case-drafts.jsonl'), drafts);

  const newEvents = fs.existsSync(path.join(engineDir, 'new-events.jsonl')) ? readJsonl(path.join(engineDir, 'new-events.jsonl')) : [];
  let verifiers = [];
  try { const lock = JSON.parse(fs.readFileSync(path.join(repo, 'verifiers.lock.json'), 'utf8')); verifiers = (lock.verifiers || []).map(function (item) { return { id: item.id, kind: item.kind || null, assertion: item.assertion || null }; }); } catch (_) { verifiers = []; }
  const sessionReport = sessionShadow.shadowSession(newEvents, { session_id: event.session_id || null, verifiers: verifiers });
  const sessionDrafts = uniqueDrafts((fs.existsSync(path.join(dir, 'session-case-drafts.jsonl')) ? readJsonl(path.join(dir, 'session-case-drafts.jsonl')) : []).concat(sessionReport.case_drafts.map(function (draft) { const copy = Object.assign({}, draft); copy.closure = false; copy.requires_agent_decision = true; return copy; })));
  writeJsonl(path.join(dir, 'session-case-drafts.jsonl'), sessionDrafts);
  const unverifiable = (fs.existsSync(path.join(dir, 'session-unverifiable.jsonl')) ? readJsonl(path.join(dir, 'session-unverifiable.jsonl')) : []).concat(sessionReport.unverifiable);
  const seenUnverifiable = {};
  writeJsonl(path.join(dir, 'session-unverifiable.jsonl'), unverifiable.filter(function (item) { const key = item && item.case_id || JSON.stringify(item); if (seenUnverifiable[key]) return false; seenUnverifiable[key] = true; return true; }));
  writeJsonl(path.join(engineDir, 'candidate-cases.jsonl'), drafts);
  const highSignal = drafts.filter(function (draft) { return draft.notify === true; });
  writeJsonl(path.join(engineDir, 'notifications.jsonl'), highSignal);
  writeJson(path.join(engineDir, 'high-signal-changes.json'), { schema_version: 'autoarmory/high-signal-changes/v1', count: highSignal.length, changes: highSignal });
  writeJson(path.join(dir, 'high-signal.json'), {
    schema_version: 'autoarmory/stop-shadow-high-signal/v1',
    captured_at: new Date().toISOString(),
    session_id: event.session_id || null,
    count: highSignal.length,
    changes: highSignal,
    llm_judge_calls: 0,
    auto_close_count: 0,
    manual_case_creation_count: 0,
    stop_hook_blocked_session_count: 0
  });
  writeJson(path.join(dir, 'stop-shadow-summary.json'), {
    schema_version: 'autoarmory/stop-shadow-summary/v1',
    captured_at: new Date().toISOString(),
    session_id: event.session_id || null,
    session_file: sessionFile,
    auto_scan_count: 1,
    auto_case_draft_count: drafts.length,
    session_verified_candidate: sessionDrafts.filter(function (draft) { return draft.classification === 'verified_candidate'; }).length,
    session_verifier_mismatch: sessionDrafts.filter(function (draft) { return draft.classification === 'verifier_mismatch'; }).length,
    session_verifier_missing: sessionDrafts.filter(function (draft) { return draft.classification === 'verifier_missing'; }).length,
    duplicate_run_draft_count: 0,
    stop_hook_blocked_session_count: 0,
    llm_judge_calls: 0,
    auto_close_count: 0,
    manual_case_creation_count: 0
  });
  return { ok: true, session_id: event.session_id || null, drafts: drafts.length, high_signal: highSignal.length, diagnostics: Object.assign({}, located, { session_file: sessionFile }) };
}
module.exports = { findSessionFile, locateSession, runStopShadow, recordGap };
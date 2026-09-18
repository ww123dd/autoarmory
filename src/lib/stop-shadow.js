'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJsonl, writeJson, writeJsonl } = require('./util');

function cleanPart(value) { return String(value || '').replace(/[^A-Za-z0-9._-]/g, '_'); }
function sessionRoot(options) { return path.resolve((options && options.sessionRoot) || process.env.CODEX_SESSION_ROOT || path.join(os.homedir(), '.codex', 'sessions')); }
function stateDir(options) { return path.resolve((options && options.stateDir) || process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow')); }
function recordGap(dir, event, reason) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'shadow-gaps.jsonl'), JSON.stringify({
      schema_version: 'autoarmory/stop-shadow-gap/v1',
      at: new Date().toISOString(),
      session_id: event && event.session_id || null,
      turn_id: event && event.turn_id || null,
      reason: reason
    }) + '\n', 'utf8');
  } catch (_) {}
}
function findSessionFile(sessionId, options) {
  if (!sessionId) return null;
  const root = sessionRoot(options);
  if (!fs.existsSync(root)) return null;
  const pattern = '**/*' + cleanPart(sessionId) + '*.jsonl';
  if (typeof fs.globSync === 'function') {
    try {
      const matches = fs.globSync(pattern, { cwd: root });
      if (matches.length) return path.resolve(root, matches[0]);
    } catch (_) {}
  }
  const deadline = Date.now() + Number((options && options.searchTimeoutMs) || 2000);
  const stack = [root];
  while (stack.length && Date.now() < deadline) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const entry of entries) {
      if (Date.now() >= deadline) break;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.indexOf(sessionId) !== -1 && /\.jsonl$/i.test(entry.name)) return full;
      if (entry.isDirectory()) stack.push(full);
    }
  }
  return null;
}
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
  let sessionFile = event.transcript_path && fs.existsSync(event.transcript_path) ? path.resolve(event.transcript_path) : findSessionFile(event.session_id, opts);
  if (!sessionFile) {
    recordGap(dir, event, 'session_not_found');
    return { ok: true, gap: 'session_not_found' };
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
    duplicate_run_draft_count: 0,
    stop_hook_blocked_session_count: 0,
    llm_judge_calls: 0,
    auto_close_count: 0,
    manual_case_creation_count: 0
  });
  return { ok: true, session_id: event.session_id || null, drafts: drafts.length, high_signal: highSignal.length };
}
module.exports = { findSessionFile, runStopShadow, recordGap };
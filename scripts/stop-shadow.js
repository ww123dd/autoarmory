#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { runStopShadow, recordGap } = require('../src/lib/stop-shadow');
function arg(name) { const index = process.argv.indexOf(name); return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null; }
function event() {
  const file = arg('--event');
  if (file) {
    const full = path.resolve(file);
    const rawEvent = fs.readFileSync(full, 'utf8') || '{}';
    try { fs.unlinkSync(full); } catch (_) {}
    return JSON.parse(rawEvent);
  }
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { raw = ''; }
  return JSON.parse(raw || '{}');
}
// Heartbeat. Every Stop appends exactly one row, on every exit path — ran, gap or
// error. Without it the only way to learn whether shadow ran is to open the state
// directory and infer, which is how it went unnoticed that no real session had
// ever produced a draft.
//
// Appended (.jsonl), not overwritten: a single last-run.json can only say what
// happened once, while the point of a heartbeat is to see that it has been
// failing every time. The most recent row still answers "did it run just now".
function beat(stateDir, ev, status, reason, result) {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    const diagnostics = result && result.diagnostics || {};
    const row = {
      schema_version: 'autoarmory/stop-shadow-last-stop/v1',
      at: new Date().toISOString(),
      session_id: ev.session_id || null,
      transcript_path: ev.transcript_path || null,
      cwd: ev.cwd || null,
      status: status,
      reason: reason || null,
      match: diagnostics.match || null,
      session_file: diagnostics.session_file || diagnostics.file || null,
      search_root: diagnostics.root || null,
      elapsed_ms: diagnostics.elapsed_ms || null,
      candidate_count: diagnostics.candidate_count || 0,
      exact_matches: diagnostics.exact_matches || 0,
      tail_matches: diagnostics.tail_matches || 0,
      draft_count: (result && result.drafts) || 0,
      projection_total: (result && result.projection_total) || 0,
      current_session_draft_count: (result && result.current_session_draft_count) || 0,
      new_draft_count: (result && result.new_draft_count) || 0,
      attribution_preserved_count: (result && result.attribution_preserved_count) || 0,
      attribution_lost_count: (result && result.attribution_lost_count) || 0,
      attribution_filled_from_event_count: (result && result.attribution_filled_from_event_count) || 0,
      high_signal_count: (result && result.high_signal) || 0
    };
    fs.writeFileSync(path.join(stateDir, 'last-stop.json'), JSON.stringify(row, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(stateDir, 'last-run.json'), JSON.stringify(row, null, 2) + '\n', 'utf8');
    // Append-only heartbeat: the capture-rate metric reads this window.
    fs.appendFileSync(path.join(stateDir, 'last-run.jsonl'), JSON.stringify(row) + '\n', 'utf8');
  } catch (_) {}
}
let ev = {};
try { ev = event(); } catch (_) { ev = {}; }
if (ev.stop_hook_active === true || process.env.STOP_SHADOW_OFF === '1') process.exit(0);
const stateDir = process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow');
if (!ev.session_id && !ev.transcript_path) beat(stateDir, ev, 'skipped', 'no session_id and no transcript_path');
else {
  try {
    const result = runStopShadow(ev, { repo: path.resolve(__dirname, '..') });
    if (result && result.gap) beat(stateDir, ev, 'gap', result.gap, result);
    else beat(stateDir, ev, 'ran', null, result);
  } catch (error) {
    try { recordGap(stateDir, ev, 'internal_error'); } catch (_) {}
    beat(stateDir, ev, 'error', String((error && error.message) || error), null);
  }
}
if (process.env.AUTOARMORY_RUNNER_OFF !== '1') {
  try {
    const runner = spawn(process.execPath, [path.join(__dirname, 'mechanism-recheck.js'), '--drain', '--state', stateDir, '--repo', path.resolve(__dirname, '..')], { detached: true, stdio: 'ignore', windowsHide: true });
    runner.unref();
  } catch (_) {}
}
process.exit(0);
